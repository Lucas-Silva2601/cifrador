import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chords = JSON.parse(await readFile(new URL('./default-chords.json', import.meta.url), 'utf8'));
const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const TUNING = [4, 9, 2, 7, 11, 4];
const ROOT_TONES = new Map(ROOTS.map((root, index) => [root, [0, 2, 4, 5, 7, 9, 11][index]]));

const EXPECTED_COUNTS = new Map([
  ['', [15, 15, 16, 14, 15, 4, 14]],
  ['°', [5, 5, 5, 7, 7, 6, 5]],
  ['(#5)', [10, 9, 10, 9, 9, 9, 9]],
  ['4', [10, 10, 9, 10, 10, 9, 9]],
  ['4(#5)', [2, 2, 2, 2, 2, 2, 3]],
  ['5', [2, 2, 3, 2, 2, 2, 2]],
  ['6', [10, 11, 9, 10, 9, 9, 10]],
  ['7', [9, 11, 14, 9, 11, 4, 10]],
  ['7(#5)', [4, 4, 4, 4, 4, 4, 4]],
  ['9', [9, 9, 8, 8, 8, 8, 7]],
  ['9(#5)', [5, 6, 7, 7, 9, 5, 6]],
  ['11', [10, 10, 9, 10, 10, 10, 3]],
  ['13', [10, 11, 9, 10, 9, 9, 10]],
  ['m', [9, 11, 13, 9, 10, 11, 11]],
  ['m(#5)', [5, 6, 9, 8, 8, 4, 5]],
  ['m4', [3, 3, 4, 3, 3, 4, 4]],
  ['m5', [9, 11, 13, 9, 10, 11, 11]],
  ['m6', [8, 10, 13, 12, 11, 11, 8]],
  ['m7', [5, 5, 7, 5, 8, 15, 5]],
  ['m7(#5)', [2, 2, 2, 2, 2, 2, 2]],
  ['m9', [3, 2, 3, 3, 3, 4, 3]],
]);

const ALLOWED_INTERVALS = new Map([
  ['', [0, 4, 7]], ['°', [0, 3, 6, 9]], ['(#5)', [0, 4, 7, 8]],
  ['4', [0, 4, 5, 7, 10]], ['4(#5)', [0, 4, 5, 7, 8]], ['5', [0, 7]],
  ['6', [0, 4, 7, 9]], ['7', [0, 4, 7, 10]], ['7(#5)', [0, 4, 8, 10]],
  ['9', [0, 2, 4, 7, 10]], ['9(#5)', [0, 2, 4, 8, 10]],
  ['11', [0, 2, 4, 5, 7, 8, 10]], ['13', [0, 2, 4, 5, 7, 9, 10]],
  ['m', [0, 3, 7]], ['m(#5)', [0, 3, 7, 8]], ['m4', [0, 3, 5, 7]],
  ['m5', [0, 3, 7]], ['m6', [0, 3, 7, 9]], ['m7', [0, 3, 7, 10]],
  ['m7(#5)', [0, 3, 7, 8, 10]], ['m9', [0, 2, 3, 7, 10]],
]);

test('o banco auditado contém os 147 acordes e 1.066 mapas únicos do gabarito', () => {
  assert.equal(chords.length, 1066);
  assert.equal(new Set(chords.map((chord) => chord.name)).size, 147);
  assert.equal(new Set(chords.map((chord) => chord.id)).size, chords.length);
  assert.equal(new Set(chords.map((chord) => `${chord.name}:${chord.frets.join('-')}`)).size, chords.length);

  for (const [suffix, counts] of EXPECTED_COUNTS) {
    ROOTS.forEach((root, index) => {
      const name = `${root}${suffix}`;
      assert.equal(chords.filter((chord) => chord.name === name).length, counts[index], `${name}: quantidade incorreta`);
    });
  }
});

test('todos os mapas cabem no braço e na janela visual de cinco casas', () => {
  for (const chord of chords) {
    assert.equal(chord.frets.length, 6, `${chord.id}: deve ter seis cordas`);
    assert.equal(chord.fingers.length, 6, `${chord.id}: deve ter seis dedos`);
    assert.ok(Number.isInteger(chord.startFret) && chord.startFret >= 1 && chord.startFret <= 24, `${chord.id}: casa inicial inválida`);
    for (const fret of chord.frets) {
      assert.ok(Number.isInteger(fret) && fret >= -1 && fret <= 24, `${chord.id}: casa ${fret} inválida`);
      if (fret > 0) {
        const visualFret = fret - chord.startFret + 1;
        assert.ok(visualFret >= 1 && visualFret <= 5, `${chord.id}: casa ${fret} ficaria fora do diagrama`);
      }
    }
    if (chord.positionFret !== undefined) {
      assert.ok(Number.isInteger(chord.positionFret) && chord.positionFret >= 1 && chord.positionFret <= 24, `${chord.id}: posição declarada inválida`);
    }
  }
});

test('nenhum mapa contém notas alheias à qualidade indicada no nome', () => {
  for (const chord of chords) {
    const suffix = chord.name.slice(1);
    const allowed = ALLOWED_INTERVALS.get(suffix);
    assert.ok(allowed, `${chord.name}: qualidade sem regra de validação`);
    const rootTone = ROOT_TONES.get(chord.name[0]);
    const intervals = chord.frets.flatMap((fret, string) =>
      fret < 0 ? [] : [(TUNING[string] + fret - rootTone + 120) % 12]);
    const outsiders = intervals.filter((interval) => !allowed.includes(interval));
    assert.deepEqual(outsiders, [], `${chord.id}: contém intervalos alheios ${outsiders.join(', ')}`);
  }
});

test('pestanas cobrem somente cordas que podem ser pressionadas na mesma casa', () => {
  let barreCount = 0;
  for (const chord of chords) {
    for (const barre of chord.barres || []) {
      barreCount += 1;
      assert.ok(barre.fret >= 1 && barre.fret <= 24, `${chord.id}: casa da pestana inválida`);
      assert.ok(barre.finger >= 1 && barre.finger <= 4, `${chord.id}: dedo da pestana inválido`);
      assert.ok(barre.fromString >= 0 && barre.toString <= 5 && barre.toString > barre.fromString, `${chord.id}: intervalo da pestana inválido`);
      assert.equal(chord.frets[barre.fromString], barre.fret, `${chord.id}: início da pestana não coincide com a nota`);
      assert.equal(chord.frets[barre.toString], barre.fret, `${chord.id}: fim da pestana não coincide com a nota`);
      assert.ok(chord.frets.slice(barre.fromString, barre.toString + 1).every((fret) => fret >= barre.fret), `${chord.id}: pestana atravessa corda aberta ou casa inferior`);
    }
  }
  assert.ok(barreCount > 700, 'a auditoria deveria identificar as pestanas necessárias');
});

test('correções críticas do gabarito permanecem aplicadas', () => {
  const hasShape = (name, frets) => chords.some((chord) => chord.name === name && chord.frets.join(',') === frets.join(','));
  assert.ok(hasShape('C°', [-1, 15, 16, 14, 16, -1]));
  assert.ok(hasShape('C7(#5)', [-1, 15, 18, 15, 17, -1]));
  assert.ok(hasShape('C9(#5)', [-1, 3, 6, 3, 5, -1]));
  assert.ok(hasShape('Cm6', [-1, -1, 13, 14, 13, 15]));
  assert.ok(hasShape('Am7', [-1, -1, 22, 21, 20, 20]));
});
