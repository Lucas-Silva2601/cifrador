import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeChordSymbol, generateChordFrets, validateChordVoicing } from './chord-theory.js';

test('valida acordes estendidos somente quando as notas essenciais estão presentes', () => {
  const valid = validateChordVoicing({ name: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 0] });
  const missingSeventh = validateChordVoicing({ name: 'Cmaj7', frets: [-1, 3, 2, 0, 1, 0] });

  assert.equal(valid.valid, true);
  assert.equal(missingSeventh.valid, false);
  assert.match(missingSeventh.errors.join(' '), /notas essenciais/);
});

test('confere a nota mais grave dos acordes com baixo invertido', () => {
  const valid = validateChordVoicing({ name: 'D/F#', frets: [2, 0, 0, 2, 3, 2] });
  const wrongBass = validateChordVoicing({ name: 'D/F#', frets: [-1, 0, 0, 2, 3, 2] });

  assert.equal(valid.valid, true);
  assert.equal(wrongBass.valid, false);
  assert.match(wrongBass.errors.join(' '), /mais grave precisa ser F#/);
});

test('rejeita notas alheias à formação do acorde', () => {
  const result = validateChordVoicing({ name: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 1] });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /não pertencem/);
});

test('entende símbolos profissionais comuns', () => {
  for (const name of ['C7+', 'Bm7(b5)', 'G7(b9)', 'F#sus4', 'Aadd9', 'C6(9)', 'Eb13', 'D/F#']) {
    assert.ok(analyzeChordSymbol(name), name);
  }
  assert.equal(analyzeChordSymbol('C6(9)').intervals.has(10), false);
  assert.equal(validateChordVoicing({ name: 'C6(9)', frets: [-1, 3, 2, 2, 3, 3] }).valid, true);
  assert.equal(analyzeChordSymbol('Cbanana'), null);
});

test('calcula e audita uma posição tocável para acordes novos e inversões', () => {
  for (const name of ['A9/C#', 'Cmaj7', 'D/F#']) {
    const frets = generateChordFrets(name);
    assert.ok(frets, name);
    assert.equal(validateChordVoicing({ name, frets }).valid, true, `${name}: ${frets?.join('-')}`);
  }
});
