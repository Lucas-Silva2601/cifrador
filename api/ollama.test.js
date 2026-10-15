import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditHarmonicFlow,
  auditMelodyGuide,
  executeOllamaAction,
  lyricsFingerprint,
  normalizeCifraStructure,
  normalizeReharmonizedLayout,
  organizationLyricsFingerprint,
} from './ollama.js';

test('rejeita choque entre a nota indicada da melodia e o acorde', () => {
  const guide = 'Em “Temor não há”, a nota de repouso é C#.';
  const conflict = auditMelodyGuide('[Bm7]Temor não [Am6]há', guide);
  const compatible = auditMelodyGuide('[Bm7]Temor não [A9]há', guide);

  assert.equal(conflict.checked, 1);
  assert.equal(conflict.violations.length, 1);
  assert.match(conflict.violations[0], /\[Am6].*C#/);
  assert.equal(compatible.status, 'approved');
});

test('manda corrigir o acorde que conflita com o guia melódico antes de aceitar', async (context) => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  const responses = [
    '<cifra>[Bm7]Temor não [Am6]há</cifra>',
    '<cifra>[Bm7]Temor não [A9]há</cifra>',
  ];
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: { content: responses.shift() } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const names = ['Bm7', 'Am6', 'A9'];
  const result = await executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
    content: '[Bm7]Temor não há',
    melodyGuide: 'Em “Temor não há”, a nota de repouso é C#.',
    chords: names.map((name, index) => ({ id: `melody-${index}`, name, frets: [0, 0, 0, 0, 0, 0] })),
  });

  assert.equal(calls, 2);
  assert.equal(result.content, '[Bm7]Temor não [A9]há');
  assert.equal(result.harmonicAudit.melodyChecks, 1);
});

test('descarta saltos excessivos no baixo que persistem após a revisão', async (context) => {
  const previousFetch = globalThis.fetch;
  const crowded = '<cifra>[Bm7]Eu caminho devagar [A/C#]para encontrar [D]o meu destino [E/G#]agora sem temor</cifra>';
  const responses = [crowded, crowded];
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: responses.shift() } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const names = ['Bm7', 'A/C#', 'D', 'E/G#'];
  await assert.rejects(
    executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
      content: '[Bm7]Eu caminho devagar para encontrar o meu destino agora sem temor',
      chords: names.map((name, index) => ({ id: `bass-${index}`, name, frets: [0, 0, 0, 0, 0, 0] })),
    }),
    /linha de baixo ainda contém saltos excessivos/,
  );
});

test('audita excesso de acordes e saltos em uma linha de baixo com inversões', () => {
  const crowded = auditHarmonicFlow(
    '[Bm7]Está nas [A9/C#]mãos do meu [F#m7]Jesus [E/G#]que [A9]vivo [G6]está [F#m7] [E7] [A9]',
    'moderada',
  );
  const balanced = auditHarmonicFlow(
    '[A]Porque Ele [E/G#]vive [F#m7]posso crer no [D]amanhã',
    'moderada',
  );

  assert.equal(crowded.densityViolations.length, 1);
  assert.equal(crowded.bassWarnings.length, 1);
  assert.equal(balanced.status, 'approved');
});

test('organiza nomes de seções entre colchetes sem alterar os acordes', () => {
  const input = '[Intro]\n[C] [Am] [F] [G]\n[Verso 1]\n[C]Minha canção\n[Final] [G]Fim';

  assert.equal(normalizeCifraStructure(input), [
    '# Intro',
    '[C] [Am] [F] [G]',
    '',
    '# Verso 1',
    '[C]Minha canção',
    '',
    '# Final',
    '[G]Fim',
  ].join('\n'));
});

test('organiza títulos simples e mantém uma linha em branco entre as seções', () => {
  const input = 'Intro:\n[C] [G]\n\n\nREFRÃO\n[F]Vou cantar';

  assert.equal(normalizeCifraStructure(input), [
    '# Intro',
    '[C] [G]',
    '',
    '# REFRÃO',
    '[F]Vou cantar',
  ].join('\n'));
});

test('não confunde acordes com títulos de seção', () => {
  const input = '[C]\n[Am]Minha letra\n[B4(#5)] [G]';
  assert.equal(normalizeCifraStructure(input), input);
});

test('confere a letra mesmo quando acordes soltos viram acordes em colchetes', () => {
  const original = '[Intro] Dm C G/B\n\nC      G/B       Am\nMinha alma engrandece ao Senhor';
  const organized = '# Intro\n[Dm] [C] [G/B]\n\n[C]Minha alma [G/B]engrandece ao [Am]Senhor';

  assert.equal(
    organizationLyricsFingerprint(original, ['C', 'Dm', 'G/B', 'Am']),
    organizationLyricsFingerprint(organized, ['C', 'Dm', 'G/B', 'Am']),
  );
});

test('ignora parênteses usados para agrupar progressões de acordes', () => {
  const original = [
    '[Refrão Final]',
    '( G9 C6(9) G9/B )',
    '( Am7(11) G9/B C6(9) )',
    'Amém e amém!',
  ].join('\n');
  const organized = [
    '# Refrão Final',
    '( [G9] [C6(9)] [G9/B] )',
    '( [Am7(11)] [G9/B] [C6(9)] )',
    'Amém e amém!',
  ].join('\n');
  const allowed = ['G9', 'C6(9)', 'G9/B', 'Am7(11)'];

  assert.equal(
    organizationLyricsFingerprint(original, allowed),
    organizationLyricsFingerprint(organized, allowed),
  );
});

test('aceita mudanças de pontuação e espaços, mas detecta palavras alteradas', () => {
  const original = '[C]Tu és santo, meu Senhor!';
  const reformatted = '[C]Tu és santo meu Senhor';
  const changed = '[C]Tu és grande, meu Senhor!';

  assert.equal(lyricsFingerprint(original, ['C']), lyricsFingerprint(reformatted, ['C']));
  assert.notEqual(lyricsFingerprint(original, ['C']), lyricsFingerprint(changed, ['C']));
});

test('reconhece Refrão Final como título de seção', () => {
  assert.equal(normalizeCifraStructure('[Refrão Final]\n[C]Amém'), '# Refrão Final\n[C]Amém');
});

test('aceita a organização completa de progressões agrupadas sem acusar alteração da letra', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: {
      content: '<cifra># Refrão Final\n( [G9] [C6(9)] [G9/B] )\n\n[Am7(11)]Amém e [G9/B]amém!</cifra>',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const names = ['G9', 'C6(9)', 'G9/B', 'Am7(11)'];
  const result = await executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'organize', {
    content: '[Refrão Final]\n( G9 C6(9) G9/B )\n\nAm7(11)      G9/B\nAmém e amém!',
    chords: names.map((name) => ({ name, frets: [0, 0, 0, 0, 0, 0] })),
  });

  assert.match(result.content, /^# Refrão Final/m);
  assert.equal(result.model, 'teste');
});

test('rearmonização devolve uma única posição escolhida por acorde', async (context) => {
  const previousFetch = globalThis.fetch;
  let requestPayload;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (_url, options) => {
    requestPayload = JSON.parse(options.body);
    return new Response(JSON.stringify({
      message: { content: '<cifra>[A]Olá, [B]mundo!</cifra>' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
    content: '[A]Olá, [B]mundo!',
    style: 'Gospel',
    intensity: 'moderada',
    chords: [
      { id: 'a-1', name: 'A', frets: [0, 0, 2, 2, 2, 0], startFret: 1 },
      { id: 'a-2', name: 'A', frets: [5, 7, 7, 6, 5, 5], startFret: 5 },
      { id: 'b-1', name: 'B', frets: [2, 2, 4, 4, 4, 2], startFret: 2 },
    ],
  });

  assert.equal(result.voicings.length, 2);
  assert.deepEqual(result.voicings.map((item) => item.name), ['A', 'B']);
  const prompt = requestPayload.messages.find((message) => message.role === 'user').content;
  assert.equal((prompt.match(/^A:/gm) || []).length, 1);
  assert.equal((prompt.match(/^B:/gm) || []).length, 1);
});

test('manda refazer uma rearmonização com acordes demais na frase', async (context) => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  const responses = [
    '<cifra>[A]Porque [B]Ele [C#m]vive, [D]posso [E]crer [F#m]no [A]amanhã</cifra>',
    '<cifra>[A]Porque Ele vive, [D]posso crer no [E]amanhã</cifra>',
  ];
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: { content: responses.shift() } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const names = ['A', 'B', 'C#m', 'D', 'E', 'F#m'];
  const result = await executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
    title: 'Porque Ele Vive',
    content: '[A]Porque Ele vive, posso crer no amanhã',
    intensity: 'moderada',
    chords: names.map((name, index) => ({ id: `chord-${index}`, name, frets: [0, 0, 0, 0, 0, 0] })),
  });

  assert.equal(calls, 2);
  assert.equal(result.content, '[A]Porque Ele vive, [D]posso crer no [E]amanhã');
  assert.equal(result.harmonicAudit.status, 'approved');
});

test('separa acordes consecutivos e remove recuos acidentais', () => {
  assert.equal(
    normalizeReharmonizedLayout('   [C6][D9] [C6]Que me fez chegar'),
    '[C6] [D9] [C6]Que me fez chegar',
  );
});

test('divide um verso comprimido em frases legíveis sem alterar a letra', () => {
  const input = '[A9]Porque Ele [C#m7]vive [F#m7] [Bm7] [E7] [D9]Posso crer no [Dm6]amanhã [A9] [A7] [D9]Porque Ele [C#m7]vive [E7]Temor não há';
  const result = normalizeReharmonizedLayout(input);

  assert.equal(result.split('\n').length, 3);
  assert.equal(lyricsFingerprint(result), lyricsFingerprint(input));
  assert.match(result, /^\[A9]Porque Ele \[C#m7]vive\n/);
  assert.match(result, /\n\[A9] \[A7] \[D9]Porque Ele/);
});

test('cria e audita acordes profissionais ausentes do banco', async (context) => {
  const previousFetch = globalThis.fetch;
  const responses = [
    '<cifra>[Cmaj7]Olá, [A9/C#]mundo!</cifra>',
  ];
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: { content: responses.shift() },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
    content: '[C]Olá, [G]mundo!',
    style: 'Gospel',
    intensity: 'intensa',
    chords: [
      { id: 'c-1', name: 'C', frets: [-1, 3, 2, 0, 1, 0], startFret: 1 },
      { id: 'g-1', name: 'G', frets: [3, 2, 0, 0, 0, 3], startFret: 1 },
    ],
  });

  assert.deepEqual(result.createdChords.map((chord) => chord.name), ['Cmaj7', 'A9/C#']);
  assert.equal(result.createdChords.every((chord) => chord.frets.length === 6), true);
  assert.deepEqual(result.voicings.map((item) => item.name), ['Cmaj7', 'A9/C#']);
});

test('descarta a rearmonização quando o símbolo de um acorde novo é ambíguo', async (context) => {
  const previousFetch = globalThis.fetch;
  const responses = [
    '<cifra>[Cbanana]Olá, mundo!</cifra>',
  ];
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: { content: responses.shift() },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    executeOllamaAction({ OLLAMA_MODEL: 'teste' }, 'reharmonize', {
      content: '[C]Olá, mundo!',
      chords: [{ id: 'c-1', name: 'C', frets: [-1, 3, 2, 0, 1, 0], startFret: 1 }],
    }),
    /símbolos de acorde que não podem ser validados/,
  );
});
