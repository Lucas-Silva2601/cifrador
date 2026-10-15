import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChordMap, parseChordMaps } from './chord-map.js';

test('interpreta mapa com casa, pestana, notas e dedos', () => {
  const chord = parseChordMap(`
    Casa 3: |---(Pestana do Dedo 1)---|

    E  A  D  G  B  e
    X  3  5  5  5  3
       1  2  3  4  1
  `, 'Cm');

  assert.equal(chord.name, 'Cm');
  assert.equal(chord.startFret, 3);
  assert.deepEqual(chord.frets, [-1, 3, 5, 5, 5, 3]);
  assert.deepEqual(chord.fingers, [0, 1, 2, 3, 4, 1]);
  assert.deepEqual(chord.barres, [
    { fret: 3, fromString: 1, toString: 5, finger: 1 },
    { fret: 5, fromString: 2, toString: 4, finger: 2 },
  ]);
});

test('infere a primeira casa quando ela não é informada', () => {
  const chord = parseChordMap('E A D G B e\n0 2 2 1 0 0', 'E');
  assert.equal(chord.startFret, 1);
  assert.deepEqual(chord.frets, [0, 2, 2, 1, 0, 0]);
});

test('aceita tablatura com hífens e digitação descrita por corda', () => {
  const chord = parseChordMap(`
    Tablatura: X - 3 - 2 - 0 - 1 - 0
    Digitação:
    5ª corda: Casa 3 (Dedo 3)
    4ª corda: Casa 2 (Dedo 2)
    3ª corda: Solta
    2ª corda: Casa 1 (Dedo 1)
    1ª corda: Solta
  `, 'C');

  assert.equal(chord.startFret, 1);
  assert.deepEqual(chord.frets, [-1, 3, 2, 0, 1, 0]);
  assert.deepEqual(chord.fingers, [0, 3, 2, 0, 1, 0]);
});

test('aceita seis descrições de corda sem uma linha de tablatura', () => {
  const chord = parseChordMap(`
    6ª corda: Solta
    5ª corda: Casa 2 (Dedo 2)
    4ª corda: Casa 2 (Dedo 3)
    3ª corda: Casa 1 (Dedo 1)
    2ª corda: Solta
    1ª corda: Solta
  `, 'E');

  assert.deepEqual(chord.frets, [0, 2, 2, 1, 0, 0]);
  assert.deepEqual(chord.fingers, [0, 2, 3, 1, 0, 0]);
});

test('reconhece a casa inicial no formato Início', () => {
  const chord = parseChordMap('Início: 5ª casa\nTablatura: X - 7 - 5 - 5 - 5 - 8', 'C');
  assert.equal(chord.startFret, 5);
  assert.deepEqual(chord.frets, [-1, 7, 5, 5, 5, 8]);
});

test('rejeita mapas incompletos', () => {
  assert.throws(() => parseChordMap('X 3 5', 'Cm'), /seis posições/);
});

test('aceita o mapa compacto separado por hífens', () => {
  const chord = parseChordMap('X-3-5-5-X-X', 'C5');
  assert.equal(chord.name, 'C5');
  assert.deepEqual(chord.frets, [-1, 3, 5, 5, -1, -1]);
  assert.equal(chord.startFret, 3);
});

test('extrai o símbolo do acorde de uma descrição em português', () => {
  const chord = parseChordMap('- **Dó com 5ª (C5):** X-3-5-5-X-X', 'Dó com 5ª (C5)');
  assert.equal(chord.name, 'C5');
  assert.deepEqual(chord.frets, [-1, 3, 5, 5, -1, -1]);
});

test('extrai nome e mapa quando a linha completa é colada', () => {
  const chord = parseChordMap('- **Ré com 5ª (D5):** X-5-7-7-X-X');
  assert.equal(chord.name, 'D5');
  assert.deepEqual(chord.frets, [-1, 5, 7, 7, -1, -1]);
});

test('interpreta vários acordes compactos de uma só vez', () => {
  const chords = parseChordMaps(`
    Dó com 5ª (C5): X-3-5-5-X-X
    Ré com 5ª (D5): X-5-7-7-X-X
    Mi com 5ª (E5): 0-2-2-X-X-X
    Fá com 5ª (F5): 1-3-3-X-X-X
    Sol com 5ª (G5): 3-5-5-X-X-X
    Lá com 5ª (A5): X-0-2-2-X-X
    Si com 5ª (B5): X-2-4-4-X-X
  `);

  assert.deepEqual(chords.map((chord) => chord.name), ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5']);
  assert.deepEqual(chords.at(-1).frets, [-1, 2, 4, 4, -1, -1]);
});

test('rejeita o lote inteiro quando uma linha nomeada está incompleta', () => {
  assert.throws(() => parseChordMaps(`
    Dó com 5ª (C5): X-3-5-5-X-X
    Ré com 5ª (D5): X-5-7-7-X
  `), /Linha 2: informe exatamente seis posições/);
});

test('interpreta várias posições numeradas do mesmo acorde', () => {
  const chords = parseChordMaps(`
    DÓ MAIOR (C)

    1. x-3-2-0-1-0
    2. x-3-2-0-1-3
    3. x-3-2-0-1-x
    4. x-x-2-0-1-0
    5. (5ª casa) x-x-5-5-5-3
    6. (5ª casa) x-3-5-5-5-3
    7. (8ª casa) 8-10-10-9-8-8
    8. (8ª casa) x-x-10-9-8-8
    9. (10ª casa) x-x-10-12-13-12
    10. (12ª casa) x-15-14-12-13-12
    11. (12ª casa) x-x-14-12-13-12
    12. (15ª casa) x-x-x-17-17-15
    13. (17ª casa) x-x-17-17-17-15
    14. (17ª casa) x-x-19-17-17-x
    15. (20ª casa) 20-22-22-21-20-20
    16. (20ª casa) x-x-22-21-20-20
  `);

  assert.equal(chords.length, 16);
  assert.ok(chords.every((chord) => chord.name === 'C'));
  assert.equal(chords[4].variant, '5ª casa · posição 5');
  assert.equal(chords[4].positionFret, 5);
  assert.equal(chords[4].startFret, 3);
  assert.deepEqual(chords[4].frets, [-1, -1, 5, 5, 5, 3]);
  assert.deepEqual(chords[15].frets, [-1, -1, 22, 21, 20, 20]);
});

test('guarda a casa entre parênteses sem alterar as notas do mapa', () => {
  const chords = parseChordMaps(`
    Si 4(#5)

    1. X-2-2-0-0-X
    2. (9ª casa) X-X-9-9-8-7
    3. (12ª casa) X-14-13-12-12-X
  `);

  assert.equal(chords[0].startFret, 1);
  assert.equal(chords[1].startFret, 7);
  assert.equal(chords[1].positionFret, 9);
  assert.equal(chords[1].variant, '9ª casa · posição 2');
  assert.deepEqual(chords[1].frets, [-1, -1, 9, 9, 8, 7]);
  assert.equal(chords[2].startFret, 12);
  assert.equal(chords[2].positionFret, 12);
  assert.deepEqual(chords[2].frets, [-1, 14, 13, 12, 12, -1]);
});

test('aceita posições numeradas separadas por barras verticais', () => {
  const chords = parseChordMaps('Dó maior (C):\n1. X-3-2-0-1-0 | 2. (3ª casa) X-3-6-5-5-X');
  assert.equal(chords.length, 2);
  assert.equal(chords[0].name, 'C');
  assert.equal(chords[1].variant, '3ª casa · posição 2');
});
