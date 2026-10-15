const TUNING = [4, 9, 2, 7, 11, 4];
const TUNING_MIDI = [40, 45, 50, 55, 59, 64];
const NOTE_INDEX = new Map([
  ['C', 0], ['B#', 0], ['C#', 1], ['Db', 1], ['D', 2], ['D#', 3], ['Eb', 3],
  ['E', 4], ['Fb', 4], ['E#', 5], ['F', 5], ['F#', 6], ['Gb', 6], ['G', 7],
  ['G#', 8], ['Ab', 8], ['A', 9], ['A#', 10], ['Bb', 10], ['B', 11], ['Cb', 11],
]);

function normalizeSymbol(value) {
  return String(value || '').trim().replaceAll('♯', '#').replaceAll('♭', 'b').replace(/\s+/g, '');
}

function noteName(value) {
  const match = value.match(/^([A-Ga-g])([#b]?)/);
  return match ? `${match[1].toUpperCase()}${match[2]}` : '';
}

function addInterval(set, interval) {
  set.add((interval + 120) % 12);
}

export function analyzeChordSymbol(value) {
  const symbol = normalizeSymbol(value);
  const match = symbol.match(/^([A-G])([#b]?)([^/]*)?(?:\/([A-G])([#b]?))?$/);
  if (!match) return null;

  const rootName = `${match[1]}${match[2]}`;
  const root = NOTE_INDEX.get(rootName);
  const suffix = match[3] || '';
  const plainSuffix = suffix.replace(/[()]/g, '');
  const recognizedSuffix = plainSuffix === ''
    || /^(?:m|min|maj|M|dim|aug|sus2|sus4|add2|add9|add11|°|ø)?(?:2|4|5|6|7|9|11|13)*(?:b5|#5|b9|#9|#11|b13|\+)*$/i.test(plainSuffix)
    || /^m(?:maj|M)7$/.test(plainSuffix);
  if (!recognizedSuffix) return null;
  const lower = suffix.toLowerCase();
  const bassName = match[4] ? `${match[4]}${match[5]}` : rootName;
  const bass = NOTE_INDEX.get(bassName);
  if (root === undefined || bass === undefined) return null;

  const halfDiminished = /ø|m7\(?b5\)?/i.test(suffix);
  const diminished = !halfDiminished && /dim|°/i.test(suffix);
  const power = /^5$/.test(suffix);
  const suspended2 = /sus2/i.test(suffix);
  const suspended4 = /sus4/i.test(suffix) || /^4(?:$|[([])/.test(suffix);
  const minor = !halfDiminished && !diminished
    && ((suffix.startsWith('m') && !lower.startsWith('maj')) || lower.startsWith('min'));
  const augmented = /aug|#5/i.test(suffix) || suffix === '+';
  const majorSeventh = /maj(?:7|9|11|13)/i.test(suffix)
    || /M(?:7|9|11|13)|7M|7\+/.test(suffix);
  const intervals = new Set([0]);

  if (halfDiminished) [3, 6, 10].forEach((interval) => addInterval(intervals, interval));
  else if (diminished) [3, 6].forEach((interval) => addInterval(intervals, interval));
  else if (power) addInterval(intervals, 7);
  else if (suspended2) [2, 7].forEach((interval) => addInterval(intervals, interval));
  else if (suspended4) [5, 7].forEach((interval) => addInterval(intervals, interval));
  else if (minor) [3, 7].forEach((interval) => addInterval(intervals, interval));
  else [4, augmented ? 8 : 7].forEach((interval) => addInterval(intervals, interval));

  if (/b5/i.test(suffix)) {
    intervals.delete(7);
    addInterval(intervals, 6);
  }
  if (/#5|aug/i.test(suffix) || suffix === '+') {
    intervals.delete(7);
    addInterval(intervals, 8);
  }

  const has13 = /13/.test(suffix);
  const has11 = /11/.test(suffix);
  const has9 = /9/.test(suffix);
  const sixNine = /6\(?9\)?/i.test(suffix);
  const added9 = /add9|^(?:2|add2)$/i.test(suffix);
  const added11 = /add11/i.test(suffix);
  const hasSeventh = halfDiminished || diminished && /7/.test(suffix)
    || majorSeventh || /7/.test(suffix)
    || ((has9 || has11 || has13) && !sixNine && !added9 && !added11);

  if (hasSeventh) addInterval(intervals, diminished && /7/.test(suffix) ? 9 : majorSeventh ? 11 : 10);
  if (/6/.test(suffix) && !has13) addInterval(intervals, 9);
  if (has9 || added9) addInterval(intervals, 2);
  if (has11 || added11) addInterval(intervals, 5);
  if (has13) addInterval(intervals, 9);
  if (/b9/i.test(suffix)) addInterval(intervals, 1);
  if (/#9/i.test(suffix)) addInterval(intervals, 3);
  if (/#11/i.test(suffix)) addInterval(intervals, 6);
  if (/b13/i.test(suffix)) addInterval(intervals, 8);

  const required = new Set([0]);
  if (power) required.add(7);
  else if (halfDiminished || diminished || minor) required.add(3);
  else if (suspended2) required.add(2);
  else if (suspended4) required.add(5);
  else required.add(4);
  if (hasSeventh) required.add(diminished && /7/.test(suffix) ? 9 : majorSeventh ? 11 : 10);
  if (sixNine) {
    required.add(2);
    required.add(9);
  } else if (has13) required.add(9);
  else if (has11 || added11) required.add(5);
  else if (has9 || added9) required.add(/b9/i.test(suffix) ? 1 : /#9/i.test(suffix) ? 3 : 2);
  else if (/6/.test(suffix)) required.add(9);

  const absoluteTones = new Set([...intervals].map((interval) => (root + interval) % 12));
  absoluteTones.add(bass);
  return {
    symbol,
    root,
    rootName,
    bass,
    bassName,
    intervals,
    required,
    absoluteTones,
  };
}

export function validateChordVoicing(chord) {
  const analysis = analyzeChordSymbol(chord?.name);
  const errors = [];
  if (!analysis) return { valid: false, errors: ['símbolo de acorde não reconhecido'] };
  if (!Array.isArray(chord?.frets) || chord.frets.length !== 6) {
    return { valid: false, errors: ['o mapa precisa ter exatamente seis cordas'] };
  }

  const sounding = chord.frets.flatMap((fret, string) => {
    if (!Number.isInteger(fret) || fret < -1 || fret > 24) {
      errors.push(`casa inválida na ${6 - string}ª corda`);
      return [];
    }
    return fret < 0 ? [] : [{
      string,
      tone: (TUNING[string] + fret) % 12,
      pitch: TUNING_MIDI[string] + fret,
    }];
  });
  if (sounding.length < 3) errors.push('o acorde precisa soar em pelo menos três cordas');

  const outsiders = sounding.filter(({ tone }) => !analysis.absoluteTones.has(tone));
  if (outsiders.length) errors.push('o mapa contém notas que não pertencem ao acorde');

  const relative = new Set(sounding.map(({ tone }) => (tone - analysis.root + 12) % 12));
  const missing = [...analysis.required].filter((interval) => !relative.has(interval));
  if (missing.length) errors.push('faltam notas essenciais da formação harmônica');

  const lowest = sounding.reduce((current, note) => !current || note.pitch < current.pitch ? note : current, null);
  if (lowest && lowest.tone !== analysis.bass) {
    errors.push(`a nota mais grave precisa ser ${analysis.bassName}`);
  }

  const pressed = chord.frets.filter((fret) => fret > 0);
  if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 5) {
    errors.push('a abertura ultrapassa cinco casas');
  }
  return { valid: errors.length === 0, errors, analysis };
}

export function describeChordRequirements(value) {
  const analysis = analyzeChordSymbol(value);
  if (!analysis) return `${value}: símbolo inválido`;
  return `${analysis.symbol}: intervalos permitidos ${[...analysis.intervals].sort((a, b) => a - b).join(', ')}; baixo ${analysis.bassName}`;
}

export function generateChordFrets(value, maxFret = 15) {
  const analysis = analyzeChordSymbol(value);
  if (!analysis) return null;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const seen = new Set();

  for (let startFret = 1; startFret <= Math.max(1, maxFret - 4); startFret += 1) {
    const options = TUNING.map((openTone) => {
      const values = [-1];
      if (analysis.absoluteTones.has(openTone)) values.push(0);
      for (let fret = startFret; fret <= startFret + 4; fret += 1) {
        if (analysis.absoluteTones.has((openTone + fret) % 12)) values.push(fret);
      }
      return [...new Set(values)];
    });

    const visit = (string, frets, hasSounding) => {
      if (string === 6) {
        const signature = frets.join(',');
        if (seen.has(signature)) return;
        seen.add(signature);
        const audit = validateChordVoicing({ name: analysis.symbol, frets });
        if (!audit.valid) return;
        const pressed = frets.filter((fret) => fret > 0);
        const soundingCount = frets.filter((fret) => fret >= 0).length;
        const mutedCount = 6 - soundingCount;
        const openCount = frets.filter((fret) => fret === 0).length;
        const span = pressed.length ? Math.max(...pressed) - Math.min(...pressed) : 0;
        const firstFret = pressed.length ? Math.min(...pressed) : 1;
        const distinctFrets = new Set(pressed).size;
        const score = firstFret * 0.14 + span * 0.75 + mutedCount * 0.62
          + Math.abs(5 - soundingCount) * 0.28 + distinctFrets * 0.12 - openCount * 0.08;
        if (score < bestScore) {
          best = [...frets];
          bestScore = score;
        }
        return;
      }

      for (const fret of options[string]) {
        if (!hasSounding && fret >= 0 && (TUNING[string] + fret) % 12 !== analysis.bass) continue;
        visit(string + 1, [...frets, fret], hasSounding || fret >= 0);
      }
    };
    visit(0, [], false);
  }
  return best;
}
