import chordShapes from './default-chords.json';

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_INDEX = new Map([
  ['C', 0], ['B#', 0], ['C#', 1], ['Db', 1], ['D', 2], ['D#', 3], ['Eb', 3],
  ['E', 4], ['Fb', 4], ['E#', 5], ['F', 5], ['F#', 6], ['Gb', 6], ['G', 7],
  ['G#', 8], ['Ab', 8], ['A', 9], ['A#', 10], ['Bb', 10], ['B', 11], ['Cb', 11],
]);

const defaultChordMap = new Map();
chordShapes.forEach((chord) => {
  if (!defaultChordMap.has(chord.name)) defaultChordMap.set(chord.name, chord);
});

function chordId(chord, index = 0) {
  return chord.id || `default:${chord.name}:${index}`;
}

export function getDefaultChords() {
  return chordShapes.map((chord, index) => ({ ...chord, id: chordId(chord, index), source: 'Padrão' }));
}

export function getChordLibrary(customChords = []) {
  const library = new Map(chordShapes.map((chord, index) => [
    chordId(chord, index),
    { ...chord, id: chordId(chord, index), source: 'Padrão' },
  ]));
  for (const chord of customChords) library.set(chord.id || `custom:${chord.name}`, { ...chord, source: 'Personalizado' });
  return [...library.values()];
}

export function classifyChord(chordOrName) {
  const name = typeof chordOrName === 'string' ? chordOrName : chordOrName.name;
  const explicitCategory = typeof chordOrName === 'object' ? chordOrName.category : '';
  if (explicitCategory) return explicitCategory;

  const quality = name.replace(/^[A-G](?:#|b)?/, '');
  if (/7sus4|sus4.*7/i.test(quality)) return 'Sétimas com quarta';
  if (/m(?:aj)?7/i.test(quality) && !/^maj7/i.test(quality)) return 'Menores com sétima';
  if (/maj7|M7/.test(quality)) return 'Sétimas maiores';
  if (/7/.test(quality)) return 'Com sétima';
  if (/4.*#5|#5.*4/i.test(quality)) return 'Quartas com quinta aumentada';
  if (/sus4/i.test(quality) || /^\(?4\)?$/i.test(quality)) return 'Quartas suspensas';
  if (/sus2/i.test(quality)) return 'Segundas suspensas';
  if (/add/i.test(quality)) return 'Adicionados';
  if (/6/.test(quality)) return 'Com sexta';
  if (/dim|°/i.test(quality)) return 'Diminutos';
  if (/aug|\+|#5/i.test(quality)) return 'Aumentados';
  if (/^m(?!aj)/i.test(quality)) return 'Menores';
  return quality ? 'Outros' : 'Maiores';
}

export function findChord(name, customChords = []) {
  return customChords.find((chord) => chord.name === name) || defaultChordMap.get(name) || null;
}

export function extractChords(content) {
  const matches = content.matchAll(/\[([^\]\n]+)]/g);
  return [...new Set([...matches].map((match) => match[1].trim()).filter(Boolean))];
}

export function transposeContent(content, steps) {
  return content.replace(/\[([^\]\n]+)]/g, (_, chord) => `[${transposeChord(chord, steps)}]`);
}

export function transposeChord(chord, steps) {
  const [main, bass] = chord.trim().split('/');
  const transposed = transposePart(main, steps);
  return bass ? `${transposed}/${transposePart(bass, steps)}` : transposed;
}

function transposePart(part, steps) {
  const match = part.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) return part;

  const [, letter, accidental, suffix] = match;
  const original = `${letter}${accidental}`;
  const noteIndex = NOTE_INDEX.get(original);
  if (noteIndex === undefined) return part;

  const notes = accidental === 'b' ? FLAT_NOTES : SHARP_NOTES;
  const nextIndex = (noteIndex + steps + 120) % 12;
  return `${notes[nextIndex]}${suffix}`;
}

export function renderChordDiagram(chordOrName, customChords = []) {
  const shape = typeof chordOrName === 'object' ? chordOrName : findChord(chordOrName, customChords);
  const chordName = typeof chordOrName === 'object' ? chordOrName.name : chordOrName;
  if (!shape) {
    return `<div class="chord-card chord-card--unknown"><strong>${escapeHtml(chordName)}</strong><span>diagrama não cadastrado</span></div>`;
  }

  const width = 118;
  const height = 142;
  const left = 23;
  const top = 37;
  const stringGap = 14;
  const fretGap = 18;
  const fretCount = 5;
  const shownFrets = shape.frets.filter((fret) => fret > 0);
  const startFret = shape.startFret || Math.max(1, Math.min(...shownFrets));
  const lines = [];

  for (let string = 0; string < 6; string += 1) {
    const x = left + string * stringGap;
    lines.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + fretGap * fretCount}" />`);
  }

  for (let fret = 0; fret <= fretCount; fret += 1) {
    const y = top + fret * fretGap;
    lines.push(`<line class="${fret === 0 && startFret === 1 ? 'nut' : ''}" x1="${left}" y1="${y}" x2="${left + stringGap * 5}" y2="${y}" />`);
  }

  const barres = (shape.barres || []).map((barre) => {
    const visualFret = barre.fret - startFret + 1;
    if (visualFret < 1 || visualFret > fretCount) return '';
    const x1 = left + barre.fromString * stringGap;
    const x2 = left + barre.toString * stringGap;
    const y = top + (visualFret - 0.5) * fretGap;
    return `<line class="barre" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`;
  });

  const markers = shape.frets.map((fret, string) => {
    const x = left + string * stringGap;
    if (fret === -1) return `<text x="${x}" y="25" text-anchor="middle">×</text>`;
    if (fret === 0) return `<circle class="open" cx="${x}" cy="21" r="4" />`;
    const visualFret = fret - startFret + 1;
    if (visualFret < 1 || visualFret > fretCount) return '';
    const y = top + (visualFret - 0.5) * fretGap;
    const finger = shape.fingers?.[string];
    return `<circle class="finger" cx="${x}" cy="${y}" r="6" />${finger ? `<text class="finger-number" x="${x}" y="${y + 3}" text-anchor="middle">${finger}</text>` : ''}`;
  });

  const position = startFret > 1
    ? `<text class="fret-number" x="8" y="${top + fretGap * 0.7}">${startFret}ª</text>`
    : '';

  return `
    <article class="chord-card" aria-label="Diagrama do acorde ${escapeHtml(chordName)}">
      <div class="chord-card-title"><strong>${escapeHtml(chordName)}</strong><span>${startFret}ª casa</span></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">
        ${lines.join('')}${barres.join('')}${markers.join('')}${position}
      </svg>
    </article>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
