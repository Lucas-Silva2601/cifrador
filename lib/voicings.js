function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('pt-BR');
}

function chordSequence(value) {
  if (Array.isArray(value)) return value.map((name) => String(name || '').trim()).filter(Boolean);
  return [...String(value || '').matchAll(/\[([^\]\n]+)]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function shapeSignature(chord) {
  return `${chord.frets.join(',')}|${(chord.barres || [])
    .map((barre) => `${barre.fret}:${barre.fromString}:${barre.toString}`)
    .join(',')}`;
}

function shapeAnchor(chord) {
  const pressed = chord.frets.filter((fret) => fret > 0).sort((left, right) => left - right);
  if (!pressed.length) return 1;
  return pressed[Math.floor((pressed.length - 1) / 2)];
}

function playabilityScore(chord) {
  const pressed = chord.frets.filter((fret) => fret > 0);
  const span = pressed.length ? Math.max(...pressed) - Math.min(...pressed) : 0;
  const startFret = Number(chord.startFret) || (pressed.length ? Math.max(1, Math.min(...pressed)) : 1);
  const muted = chord.frets.filter((fret) => fret < 0).length;
  const open = chord.frets.filter((fret) => fret === 0).length;
  const barreCost = (chord.barres || []).reduce((total, barre) =>
    total + 0.7 + Math.abs(Number(barre.toString) - Number(barre.fromString)) * 0.16, 0);
  const customBonus = chord.source === 'Personalizado' ? 0.65 : 0;
  return span * 0.85 + Math.max(0, startFret - 1) * 0.16 + muted * 0.22
    + barreCost - open * 0.18 - customBonus;
}

function transitionScore(left, right) {
  if (!left || !right) return 0;
  const anchorDistance = Math.abs(shapeAnchor(left) - shapeAnchor(right));
  let stringMovement = 0;
  let comparedStrings = 0;
  for (let index = 0; index < 6; index += 1) {
    const from = left.frets[index];
    const to = right.frets[index];
    if (from < 0 || to < 0) continue;
    stringMovement += Math.abs(from - to);
    comparedStrings += 1;
  }
  return anchorDistance * 1.15 + (comparedStrings ? stringMovement / comparedStrings : 0) * 0.18;
}

function uniqueCandidates(library, name) {
  const normalized = normalizeName(name);
  const unique = new Map();
  for (const chord of library) {
    if (!chord || normalizeName(chord.name) !== normalized || !Array.isArray(chord.frets) || chord.frets.length !== 6) continue;
    const signature = shapeSignature(chord);
    const current = unique.get(signature);
    if (!current || chord.source === 'Personalizado') unique.set(signature, chord);
  }
  return [...unique.values()];
}

function buildTransitions(sequence) {
  const transitions = new Map();
  for (let index = 1; index < sequence.length; index += 1) {
    const left = normalizeName(sequence[index - 1]);
    const right = normalizeName(sequence[index]);
    if (!left || !right || left === right) continue;
    const key = [left, right].sort().join('\u0000');
    transitions.set(key, (transitions.get(key) || 0) + 1);
  }
  return transitions;
}

function transitionWeight(transitions, left, right) {
  return transitions.get([left, right].sort().join('\u0000')) || 0;
}

export function selectChordVoicings(contentOrNames, library, preferredVoicings = []) {
  const sequence = chordSequence(contentOrNames);
  const names = [];
  const displayName = new Map();
  for (const name of sequence) {
    const normalized = normalizeName(name);
    if (!normalized || displayName.has(normalized)) continue;
    displayName.set(normalized, name);
    names.push(normalized);
  }

  const candidates = new Map(names.map((name) => [name, uniqueCandidates(library, displayName.get(name))]));
  const preferredIds = new Map((preferredVoicings || [])
    .filter((item) => item && item.name && item.id)
    .map((item) => [normalizeName(item.name), item.id]));
  const selected = new Map();

  for (const name of names) {
    const shapes = candidates.get(name);
    if (!shapes.length) continue;
    const preferred = shapes.find((shape) => shape.id === preferredIds.get(name));
    selected.set(name, preferred || shapes.reduce((best, shape) =>
      playabilityScore(shape) < playabilityScore(best) ? shape : best));
  }

  const transitions = buildTransitions(sequence);
  if (transitions.size) {
    for (let pass = 0; pass < 4; pass += 1) {
      for (const name of names) {
        if (preferredIds.has(name)) continue;
        const shapes = candidates.get(name);
        if (shapes.length < 2) continue;
        let best = selected.get(name);
        let bestScore = Number.POSITIVE_INFINITY;
        for (const shape of shapes) {
          let score = playabilityScore(shape);
          for (const neighbor of names) {
            if (neighbor === name || !selected.has(neighbor)) continue;
            const weight = transitionWeight(transitions, name, neighbor);
            if (weight) score += transitionScore(shape, selected.get(neighbor)) * Math.min(weight, 4);
          }
          if (score < bestScore) {
            best = shape;
            bestScore = score;
          }
        }
        selected.set(name, best);
      }
    }
  }

  return names.map((name) => selected.get(name) || displayName.get(name));
}

export function serializeSelectedVoicings(content, library) {
  return selectChordVoicings(content, library)
    .filter((chord) => chord && typeof chord === 'object' && chord.id)
    .map((chord) => ({ name: chord.name, id: chord.id }));
}
