const FRET_TOKEN = /^(?:x|X|0|\d{1,2})$/;
const FINGER_TOKEN = /^(?:x|X|-|0|[1-4])$/;

export function parseChordMap(rawMap, name) {
  const text = String(rawMap || '').trim();
  if (!text) throw new Error('Cole ou digite o mapa do acorde.');
  const chordName = normalizeChordName(name) || extractChordNameFromMap(text);
  if (!chordName) throw new Error('Informe o nome do acorde.');

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declaredFret = parseDeclaredFret(text);
  const rows = lines.map((line, index) => ({ index, tokens: tokenizeRow(line) }));
  const tablatureEntry = lines
    .map((line, index) => ({ index, tokens: parseTablatureLine(line) }))
    .find(({ tokens }) => tokens?.length === 6);
  const regularEntry = rows.find(({ tokens }) => tokens.length === 6 && tokens.every((token) => FRET_TOKEN.test(token)));
  const stringDetails = parseStringDetails(lines);
  const descriptiveFrets = stringDetails.map((detail) => detail?.fret);
  const hasCompleteDescription = descriptiveFrets.every(Number.isInteger);
  const fretEntry = tablatureEntry || regularEntry;

  if (!fretEntry && !hasCompleteDescription) {
    throw new Error('Não encontrei uma linha com seis posições. Exemplo: X 3 5 5 5 3.');
  }

  const frets = fretEntry
    ? fretEntry.tokens.map((token) => /^x$/i.test(token) ? -1 : Number(token))
    : descriptiveFrets;
  const playableCount = frets.filter((fret) => fret >= 0).length;
  const fingerEntry = rows.find(({ index, tokens }) =>
    index > (fretEntry?.index ?? -1) &&
      (tokens.length === 6 || tokens.length === playableCount) &&
      tokens.every((token) => FINGER_TOKEN.test(token)),
  );
  const positiveFrets = frets.filter((fret) => fret > 0);
  const startFret = frets.includes(0) && Math.max(...positiveFrets, 0) <= 5
    ? 1
    : (positiveFrets.length ? Math.max(1, Math.min(...positiveFrets)) : 1);
  const inferredFingers = fingerEntry
    ? alignFingers(fingerEntry.tokens, frets)
    : inferFingers(frets, startFret);
  const fingers = inferredFingers.map((finger, index) => stringDetails[index]?.finger ?? finger);
  const barres = inferBarres(text, frets, fingers, startFret);

  return {
    id: createId(),
    name: chordName.slice(0, 24),
    frets,
    fingers,
    barres,
    startFret,
    ...(declaredFret ? { positionFret: declaredFret } : {}),
    rawMap: text.slice(0, 4_000),
    custom: true,
    updatedAt: new Date().toISOString(),
  };
}

export function parseChordMaps(rawMap, fallbackName) {
  const text = String(rawMap || '').trim();
  if (!text) throw new Error('Cole ou digite o mapa do acorde.');

  const numberedEntries = parseNumberedEntries(text, fallbackName);
  if (numberedEntries.length) return numberedEntries;

  const lines = text.split(/\r?\n/).map((line, index) => ({
    index: index + 1,
    line: line.trim(),
  })).filter(({ line }) => line);
  const entries = lines.filter(({ line }) => findCompactMap(line));
  const labeledEntries = lines.filter(({ line }) => /:\*{0,2}\s*(?:x|\d)/i.test(line));
  const batchEntries = labeledEntries.length > 1 ? labeledEntries : entries;

  if (batchEntries.length <= 1) return [parseChordMap(text, fallbackName)];

  return batchEntries.map(({ index, line }) => {
    const compactMap = findCompactMap(line);
    if (!compactMap) throw new Error(`Linha ${index}: informe exatamente seis posições, como X-3-5-5-X-X.`);
    const name = extractChordNameFromMap(line);
    if (!name) throw new Error(`Informe o nome do acorde na linha ${index}.`);
    try {
      return parseChordMap(line, name);
    } catch (error) {
      throw new Error(`Linha ${index}: ${error.message}`);
    }
  });
}

function parseNumberedEntries(text, fallbackName) {
  const markers = [...text.matchAll(/(?:^|[\n|])\s*(\d{1,2})\.\s*/gim)];
  if (!markers.length) return [];

  const heading = text.slice(0, markers[0].index).trim()
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || '';
  const chordName = normalizeChordName(heading.replace(/[:*]+$/g, '')) || normalizeChordName(fallbackName);
  if (!chordName) throw new Error('Informe o nome comum das posições antes da lista numerada.');

  return markers.map((marker, markerIndex) => {
    const positionNumber = Number(marker[1]);
    const start = marker.index + marker[0].length;
    const end = markers[markerIndex + 1]?.index ?? text.length;
    const entryText = text.slice(start, end).replace(/^\s*\|/, '').trim();
    const declaredPosition = parseParenthesizedFret(entryText);
    const compactMap = findCompactMap(entryText);
    if (!compactMap) {
      throw new Error(`Posição ${positionNumber}: informe exatamente seis cordas, como X-3-2-0-1-0.`);
    }

    const chord = parseChordMap(entryText, chordName);
    chord.variant = declaredPosition
      ? `${declaredPosition}ª casa · posição ${positionNumber}`
      : `Posição ${positionNumber}`;
    return chord;
  });
}

export function describeChord(chord) {
  const positions = chord.frets.map((fret) => fret === -1 ? 'X' : fret).join('  ');
  const barre = chord.barres?.length ? ' • com pestana' : '';
  return `Casa ${chord.startFret}: ${positions}${barre}`;
}

function parseDeclaredFret(text) {
  const match = text.match(/(?:^|\n)\s*(?:(?:casa|posição)\s*(\d{1,2})|in[ií]cio\s*:\s*(\d{1,2})\s*ª?\s*casa)/i);
  const value = match?.[1] || match?.[2] || parseParenthesizedFret(text);
  return value ? Math.max(1, Number(value)) : null;
}

function parseParenthesizedFret(text) {
  const match = String(text || '').match(
    /\(\s*(?:(?:casa|posição)\s*(\d{1,2})|(\d{1,2})\s*[ªºa]?\s*(?:casa|posição))\s*\)/i,
  );
  return match?.[1] || match?.[2] || null;
}

function parseTablatureLine(line) {
  const match = line.match(/^tablatura\s*:\s*(.+)$/i);
  if (!match) return null;

  const tokens = match[1].match(/(?:x|\d{1,2})/gi) || [];
  return tokens.length === 6 && tokens.every((token) => FRET_TOKEN.test(token)) ? tokens : null;
}

function parseStringDetails(lines) {
  const details = Array(6).fill(null);

  for (const line of lines) {
    const match = line.match(/^([1-6])\s*[ªºa]?\s*corda\s*:\s*(.+)$/i);
    if (!match) continue;

    const stringNumber = Number(match[1]);
    const description = match[2];
    const fretMatch = description.match(/casa\s*(\d{1,2})/i);
    const fingerMatch = description.match(/dedo\s*(\d)/i);
    let fret;

    if (fretMatch) fret = Number(fretMatch[1]);
    else if (/\bsolta\b/i.test(description)) fret = 0;
    else if (/\b(?:x|abafada|muda)\b/i.test(description)) fret = -1;
    else continue;

    details[6 - stringNumber] = {
      fret,
      finger: fingerMatch ? Number(fingerMatch[1]) : 0,
    };
  }

  return details;
}

function tokenizeRow(line) {
  const compactMap = findCompactMap(line);
  if (compactMap) return compactMap.split(/\s*-\s*/);

  return line
    .replace(/[|:;,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function findCompactMap(line) {
  return line.match(/(?:^|[\s:*])((?:x|\d{1,2})(?:\s*-\s*(?:x|\d{1,2})){5})(?=$|[\s*.,;])/i)?.[1] || '';
}

function normalizeChordName(value) {
  const name = String(value || '').trim();
  if (!name) return '';
  const symbol = name.match(/\(([A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:[#b+\-]\d+)*(?:\/[A-G](?:#|b)?)?)\)\s*$/)?.[1];
  return (symbol || name).slice(0, 24);
}

function extractChordNameFromMap(text) {
  const label = text.match(/\*\*\s*(.+?)\s*:\s*\*\*/)?.[1]
    || text.match(/^\s*[-•]?\s*([^:\n]+?)\s*:\s*(?=(?:x|\d{1,2})(?:\s*-\s*(?:x|\d{1,2})){5})/im)?.[1]
    || '';
  return normalizeChordName(label);
}

function inferFingers(frets, startFret) {
  const fingerByFret = new Map();
  let nextFinger = 1;
  return frets.map((fret) => {
    if (fret <= 0) return 0;
    if (fret === startFret) return 1;
    if (!fingerByFret.has(fret)) {
      fingerByFret.set(fret, Math.min(4, nextFinger + 1));
      nextFinger += 1;
    }
    return fingerByFret.get(fret);
  });
}

function alignFingers(tokens, frets) {
  const values = tokens.map((token) => /^[1-4]$/.test(token) ? Number(token) : 0);
  if (values.length === 6) return values;

  let valueIndex = 0;
  return frets.map((fret) => fret < 0 ? 0 : values[valueIndex++] || 0);
}

function inferBarres(text, frets, fingers, startFret) {
  const explicitFinger = Number(text.match(/pestana(?:\s+do)?\s+dedo\s*(\d)/i)?.[1]) || 1;
  const candidates = [...new Set(frets.filter((fret) => fret > 0))]
    .sort((a, b) => a - b)
    .flatMap((fret) => {
      const strings = frets
        .map((value, index) => value === fret ? index : -1)
        .filter((index) => index >= 0);
      if (strings.length < 2) return [];
      const fromString = strings[0];
      const toString = strings.at(-1);
      const canBarre = frets.slice(fromString, toString + 1).every((value) => value >= fret);
      return canBarre ? [{ fret, fromString, toString }] : [];
    });

  if (!candidates.length && /pestana/i.test(text)) {
    const playableStrings = frets
      .map((fret, index) => fret >= 0 ? index : -1)
      .filter((index) => index >= 0);
    return playableStrings.length >= 2
      ? [{ fret: startFret, fromString: playableStrings[0], toString: playableStrings.at(-1), finger: explicitFinger }]
      : [];
  }

  return candidates.map((barre) => ({
    ...barre,
    finger: /pestana/i.test(text) && barre.fret === startFret
      ? explicitFinger
      : (fingers[barre.fromString] || 1),
  }));
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
