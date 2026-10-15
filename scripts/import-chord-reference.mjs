import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = process.argv[2];
const shouldWrite = process.argv.includes('--write');

if (!sourcePath) {
  throw new Error('Uso: node scripts/import-chord-reference.mjs <gabarito.txt> [--write]');
}

const ROOTS = new Map([
  ['dó', 'C'], ['ré', 'D'], ['mi', 'E'], ['fá', 'F'],
  ['sol', 'G'], ['lá', 'A'], ['si', 'B'],
]);

const SECTION_SUFFIXES = [
  ['ACORDES DIMINUTOS', '°'],
  ['ACORDES COM QUINTA AUMENTADA', '(#5)'],
  ['ACORDES COM QUARTA (', '4'],
  ['ACORDES COM QUARTA E QUINTA AUMENTADA', '4(#5)'],
  ['POWER CHORDS', '5'],
  ['ACORDES COM SEXTA', '6'],
  ['ACORDES COM SÉTIMA DOMINANTE', '7'],
  ['ACORDES COM SÉTIMA E QUINTA AUMENTADA', '7(#5)'],
  ['ACORDES COM NONA (', '9'],
  ['ACORDES COM NONA E QUINTA AUMENTADA', '9(#5)'],
  ['ACORDES COM DÉCIMA PRIMEIRA', '11'],
  ['ACORDES COM DÉCIMA TERCEIRA', '13'],
  ['ACORDES MENORES (', 'm'],
  ['ACORDES MENORES COM QUINTA AUMENTADA', 'm(#5)'],
  ['ACORDES MENORES COM QUARTA', 'm4'],
  ['ACORDES MENORES COM QUINTA', 'm5'],
  ['ACORDES MENORES COM SEXTA', 'm6'],
  ['ACORDES MENORES COM SÉTIMA (', 'm7'],
  ['ACORDES MENORES COM SÉTIMA E QUINTA AUMENTADA', 'm7(#5)'],
  ['ACORDES MENORES COM NONA', 'm9'],
];

const ALLOWED_INTERVALS = new Map([
  ['', [0, 4, 7]], ['°', [0, 3, 6, 9]], ['(#5)', [0, 4, 7, 8]],
  // A apostila usa "4" tanto para sus4 quanto para add4 e inclui algumas
  // inversões com sétima. Esses tons continuam pertencendo à família indicada.
  ['4', [0, 4, 5, 7, 10]], ['4(#5)', [0, 4, 5, 7, 8]], ['5', [0, 7]],
  ['6', [0, 4, 7, 9]], ['7', [0, 4, 7, 10]], ['7(#5)', [0, 4, 8, 10]],
  ['9', [0, 2, 4, 7, 10]], ['9(#5)', [0, 2, 4, 8, 10]],
  ['11', [0, 2, 4, 5, 7, 8, 10]], ['13', [0, 2, 4, 5, 7, 9, 10]],
  ['m', [0, 3, 7]], ['m(#5)', [0, 3, 7, 8]], ['m4', [0, 3, 5, 7]],
  ['m5', [0, 3, 7]], ['m6', [0, 3, 7, 9]], ['m7', [0, 3, 7, 10]],
  ['m7(#5)', [0, 3, 7, 8, 10]], ['m9', [0, 2, 3, 7, 10]],
]);

const NOTE_BY_ROOT = new Map([['C', 0], ['D', 2], ['E', 4], ['F', 5], ['G', 7], ['A', 9], ['B', 11]]);
const TUNING = [4, 9, 2, 7, 11, 4];
const text = await readFile(resolve(sourcePath), 'utf8');
const parsed = [];
let suffix = '';
let chordName = '';

for (const line of text.split(/\r?\n/)) {
  const heading = line.match(/^###\s+(.+)$/)?.[1];
  if (heading) {
    const major = heading.match(/\(([A-G])\)\s*$/);
    if (major) {
      suffix = '';
      chordName = major[1];
    } else {
      suffix = SECTION_SUFFIXES.find(([title]) => heading.startsWith(title))?.[1] ?? '';
      chordName = '';
    }
  }

  const label = line.match(/^\*\s+\*\*(.+?)\*\*\s*:/)?.[1];
  if (label) {
    const normalized = label.normalize('NFC').toLocaleLowerCase('pt-BR');
    const root = [...ROOTS].find(([word]) => normalized.startsWith(word))?.[1];
    if (!root) throw new Error(`Não foi possível identificar a nota em: ${label}`);
    chordName = `${root}${suffix}`;
  }

  if (!chordName) continue;
  const mapPattern = /(?:\((\d{1,2})\s*[ªºa]?\s*casa\)\s*)?`((?:x|\d{1,2})(?:-(?:x|\d{1,2})){5})`/gi;
  for (const match of line.matchAll(mapPattern)) {
    const frets = match[2].split('-').map((token) => token.toLowerCase() === 'x' ? -1 : Number(token));
    parsed.push({
      name: chordName,
      declaredFret: match[1] ? Number(match[1]) : null,
      frets,
    });
  }
}

const corrections = [];
const corrected = parsed.map((chord) => {
  const frets = correctKnownReferenceIssue(chord);
  if (frets.join('-') !== chord.frets.join('-')) {
    corrections.push({ name: chord.name, from: chord.frets, to: frets });
  }
  return { ...chord, frets };
});

const duplicates = [];
const unique = [];
const seen = new Map();
for (const chord of corrected) {
  const key = `${chord.name}:${chord.frets.join('-')}`;
  if (seen.has(key)) {
    duplicates.push({ ...chord, original: seen.get(key) });
    continue;
  }
  seen.set(key, chord);
  unique.push(chord);
}

const positionsByName = new Map();
const chords = unique.map((chord) => {
  const position = (positionsByName.get(chord.name) || 0) + 1;
  positionsByName.set(chord.name, position);
  const positive = chord.frets.filter((fret) => fret > 0);
  const startFret = chord.frets.includes(0) && Math.max(...positive, 0) <= 5
    ? 1
    : Math.max(1, Math.min(...positive));
  const { fingers, barres } = inferFingering(chord.frets);
  const slug = chord.name
    .replace('°', '-dim').replaceAll('#', 'sharp').replaceAll('(', '-').replaceAll(')', '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `${slug}-${String(position).padStart(2, '0')}`,
    name: chord.name,
    variant: chord.declaredFret ? `${chord.declaredFret}ª casa · posição ${position}` : `Posição ${position}`,
    frets: chord.frets,
    fingers,
    ...(barres.length ? { barres } : {}),
    startFret,
    ...(chord.declaredFret ? { positionFret: chord.declaredFret } : {}),
  };
});

const invalid = unique.flatMap((chord) => validateTones(chord));
const counts = Object.fromEntries([...positionsByName].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true })));

console.log(JSON.stringify({
  mapsRead: parsed.length,
  uniqueMaps: chords.length,
  correctedMaps: corrections.length,
  corrections,
  duplicateMapsRemoved: duplicates.length,
  chordNames: positionsByName.size,
  invalidMaps: invalid,
  counts,
}, null, 2));

if (invalid.length) throw new Error(`${invalid.length} mapa(s) contêm notas alheias ao acorde.`);
if (shouldWrite) {
  const destination = resolve('src/default-chords.json');
  await writeFile(destination, `${JSON.stringify(chords, null, 2)}\n`, 'utf8');
  console.log(`Banco atualizado: ${destination}`);
}

function inferFingering(frets) {
  const candidates = [...new Set(frets.filter((fret) => fret > 0))]
    .sort((a, b) => a - b)
    .flatMap((fret) => {
      const strings = frets.map((value, string) => value === fret ? string : -1).filter((string) => string >= 0);
      if (strings.length < 2) return [];
      const fromString = strings[0];
      const toString = strings.at(-1);
      const canBarre = frets.slice(fromString, toString + 1).every((value) => value >= fret);
      return canBarre ? [{ fret, fromString, toString }] : [];
    });

  const distinctFrets = [...new Set(frets.filter((fret) => fret > 0))].sort((a, b) => a - b);
  const fingerByFret = new Map(distinctFrets.map((fret, index) => [fret, Math.min(4, index + 1)]));
  const barres = candidates.map((barre) => ({
    ...barre,
    finger: fingerByFret.get(barre.fret),
  }));
  return {
    fingers: frets.map((fret) => fret > 0 ? fingerByFret.get(fret) : 0),
    barres,
  };
}

function correctKnownReferenceIssue(chord) {
  const key = `${chord.name}:${chord.frets.join(',')}`;
  const direct = new Map([
    ['C:-1,-1,19,17,17,-1', [-1, -1, 17, 17, 17, 15]],
    ['D:-1,-1,21,19,19,-1', [-1, -1, 19, 19, 19, 17]],
    ['D(#5):22,25,24,23,-1,-1', [10, 13, 12, 11, -1, -1]],
    ['C°:-1,15,14,15,13,-1', [-1, 15, 16, 14, 16, -1]],
    ['Dm:-1,-1,22,24,24,22', [-1, -1, 24, 22, 22, 22]],
    ['Dm5:-1,-1,22,24,24,-1', [-1, -1, 24, 22, 22, -1]],
    ['Am:-1,-1,21,21,22,-1', [-1, -1, 19, 21, 22, -1]],
    ['Am5:-1,-1,21,21,-1,-1', [-1, -1, 19, 21, -1, -1]],
    ['Am7:-1,-1,22,20,22,20', [-1, -1, 22, 21, 20, 20]],
    ['G7(#5):-1,22,23,22,24,-1', [-1, 22, -1, 20, 24, -1]],
    ['G9(#5):-1,22,23,22,24,-1', [-1, 22, -1, 20, 24, -1]],
  ]).get(key);
  if (direct) return direct;

  const invalid = validateTones(chord).length > 0;
  if (!invalid) return chord.frets;
  const frets = [...chord.frets];

  // Algumas formas de quarta começam duas casas acima e, assim, viram a nona.
  if (/^[FGAB]4$/.test(chord.name) && frets[2] > 0) {
    frets[2] -= 2;
    return frets;
  }

  // Esta sequência da apostila deve ser uma forma sem fundamental de 7 dominante.
  const seventhOffsets = new Map([['C7', 0], ['D7', 2], ['E7', 4], ['F7', 5], ['G7', 7]]);
  if (seventhOffsets.has(chord.name) && frets[2] >= 15) {
    const offset = seventhOffsets.get(chord.name);
    return [-1, -1, 17 + offset, 15 + offset, 17 + offset, 15 + offset];
  }

  // As famílias #5 tinham a quinta diminuta na 4ª corda; +2 semitons produz #5.
  if (/^[A-G](?:7|9)\(#5\)$/.test(chord.name) && frets[2] > 0) {
    frets[2] += 2;
    return frets;
  }

  // As formas altas m(#5) estavam grafadas como tríades maiores.
  if (/^[A-G]m\(#5\)$/.test(chord.name) && frets[2] > 0 && frets[5] > 0) {
    frets[3] += 1;
    frets[5] -= 1;
    return frets;
  }

  // Nas quatro últimas formas m6, a terça estava maior em vez de menor.
  if (/^[C-F]m6$/.test(chord.name) && frets[2] > 0) {
    frets[2] -= 1;
    return frets;
  }

  return frets;
}

function validateTones(chord) {
  const root = chord.name[0];
  const chordSuffix = chord.name.slice(1);
  const allowed = ALLOWED_INTERVALS.get(chordSuffix);
  if (!allowed) return [`${chord.name}: qualidade desconhecida`];
  const rootTone = NOTE_BY_ROOT.get(root);
  const actual = [...new Set(chord.frets.flatMap((fret, string) =>
    fret < 0 ? [] : [(TUNING[string] + fret - rootTone + 120) % 12,
    ]))];
  const outsiders = actual.filter((tone) => !allowed.includes(tone));
  return outsiders.length ? [`${chord.name} ${chord.frets.join('-')}: intervalos inválidos ${outsiders.join(',')}`] : [];
}
