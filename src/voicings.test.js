import assert from 'node:assert/strict';
import test from 'node:test';
import { selectChordVoicings, serializeSelectedVoicings } from './voicings.js';

function shape(id, name, fret, extra = {}) {
  return {
    id,
    name,
    frets: [fret, fret, fret, fret, fret, fret],
    fingers: [1, 1, 1, 1, 1, 1],
    startFret: Math.max(1, fret),
    ...extra,
  };
}

test('escolhe somente uma posição para cada acorde usado', () => {
  const library = [
    shape('g-low', 'G9', 2),
    shape('g-high', 'G9', 9),
    shape('c-low', 'C6(9)', 3),
    shape('c-high', 'C6(9)', 10),
  ];

  const selected = selectChordVoicings('[G9]Tudo [C6(9)]bem\n[G9]Amém', library);

  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((chord) => chord.name), ['G9', 'C6(9)']);
});

test('prefere posições próximas quando os acordes aparecem em sequência', () => {
  const library = [
    shape('a-low', 'A', 1),
    shape('a-near-b', 'A', 9),
    shape('b-high', 'B', 9),
  ];
  const content = '[A] [B]\n[A] [B]\n[A] [B]';

  const selected = selectChordVoicings(content, library);

  assert.equal(selected.find((chord) => chord.name === 'A').id, 'a-near-b');
  assert.equal(selected.find((chord) => chord.name === 'B').id, 'b-high');
});

test('mantém as posições escolhidas pela rearmonização', () => {
  const library = [shape('a-low', 'A', 1), shape('a-high', 'A', 9), shape('b-high', 'B', 9)];

  const selected = selectChordVoicings('[A] [B]', library, [{ name: 'A', id: 'a-low' }]);

  assert.equal(selected.find((chord) => chord.name === 'A').id, 'a-low');
  assert.deepEqual(serializeSelectedVoicings('[A] [B]', library), [
    { name: 'A', id: 'a-high' },
    { name: 'B', id: 'b-high' },
  ]);
});
