import { parseChordMap, parseChordMaps } from '../chord-map.js';
import {
  analyzeChordSymbol,
  describeChordRequirements,
  generateChordFrets,
  validateChordVoicing,
} from '../chord-theory.js';
import { selectChordVoicings, serializeSelectedVoicings } from '../voicings.js';

const DEFAULT_CLOUD_URL = 'https://ollama.com/api';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:11434/api';
const MAX_BODY_SIZE = 1_000_000;
const ACTION_BY_PATH = Object.freeze({
  '/api/ai/reharmonize': 'reharmonize',
  '/api/ai/organize': 'organize',
  '/api/ai/chord-map': 'chord-map',
});

export function createOllamaMiddleware(env) {
  const config = resolveOllamaConfig(env);

  return async function ollamaMiddleware(request, response, next) {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/ai/')) return next();

    setJsonHeaders(response);

    if (pathname === '/api/ai/status' && request.method === 'GET') {
      return sendJson(response, 200, describeOllamaConfig(config));
    }

    const action = ACTION_BY_PATH[pathname];
    if (!action || request.method !== 'POST') {
      return sendJson(response, 404, { error: 'Rota não encontrada.' });
    }

    try {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await executeWithConfig(config, action, body));
    } catch (error) {
      const status = Number(error.status) || 500;
      const message = status >= 500
        ? `Falha ao consultar o Ollama: ${error.message}`
        : error.message;
      return sendJson(response, status, { error: message });
    }
  };
}

export function getOllamaStatus(env = {}) {
  return describeOllamaConfig(resolveOllamaConfig(env));
}

export async function executeOllamaAction(env = {}, action, body = {}) {
  return executeWithConfig(resolveOllamaConfig(env), action, body);
}

function resolveOllamaConfig(env = {}) {
  const apiKey = env.OLLAMA_API_KEY?.trim() || '';
  const baseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL || (apiKey ? DEFAULT_CLOUD_URL : DEFAULT_LOCAL_URL));
  const model = env.OLLAMA_MODEL?.trim() || 'gemma4:31b';
  const isCloud = /^https:\/\/ollama\.com(?:\/|$)/i.test(baseUrl);
  return { apiKey, baseUrl, model, isCloud };
}

function describeOllamaConfig({ apiKey, isCloud, model }) {
  return {
    configured: !isCloud || Boolean(apiKey),
    provider: isCloud ? 'Ollama Cloud' : 'Ollama local',
    model,
  };
}

async function executeWithConfig({ apiKey, baseUrl, model, isCloud }, action, body) {
  if (isCloud && !apiKey) {
    const error = new Error('Adicione OLLAMA_API_KEY ao arquivo .env e reinicie o Cifrador.');
    error.status = 503;
    throw error;
  }

  if (action === 'chord-map') {
    const input = validateChordMapInput(body);
    return { ...(await correctChordMap({ apiKey, baseUrl, model, input })), model };
  }

  if (action !== 'organize' && action !== 'reharmonize') {
    const error = new Error('Ação de IA não encontrada.');
    error.status = 404;
    throw error;
  }

  const input = validateReharmonizationInput(body);
  const allowedChords = [...new Set(input.chords.map((chord) => chord.name.trim()).filter(Boolean))];
  if (allowedChords.length === 0) {
    const error = new Error('Cadastre ao menos um acorde antes de usar a IA.');
    error.status = 400;
    throw error;
  }

  const result = action === 'organize'
    ? await organizeCifra({ apiKey, baseUrl, model, input, allowedChords })
    : await reharmonize({ apiKey, baseUrl, model, input, allowedChords });
  return { ...result, model };
}

async function correctChordMap({ apiKey, baseUrl, model, input }) {
  const labeledCount = input.map.split(/\r?\n/)
    .filter((line) => /:\*{0,2}\s*(?:x|\d)/i.test(line))
    .length;
  let expectedCount = Math.max(1, labeledCount);
  let sourceChords = [];
  try {
    sourceChords = parseChordMaps(input.map, input.name);
    expectedCount = Math.max(expectedCount, sourceChords.length);
  } catch {
    // A IA tentará recuperar entradas que o leitor local ainda não reconhece.
  }
  const system = [
    'Você revisa mapas de acordes para violão na afinação padrão E A D G B e.',
    'Interprete X como corda abafada, 0 como corda solta e números como casas.',
    'Corrija erros evidentes comparando o nome do acorde com as notas do mapa.',
    'Use exatamente seis posições, da 6ª corda E até a 1ª corda e.',
    'Preserve e devolva todos os acordes recebidos, sem juntar ou omitir linhas.',
    'Responda somente com JSON válido entre <json> e </json>.',
    'O JSON deve ter a propriedade chords, uma lista de objetos com name e map.',
    'Cada map deve usar o formato X-3-5-5-X-X.',
  ].join(' ');
  const response = await callOllama({ apiKey, baseUrl, model, messages: [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Nome informado: ${input.name || 'não informado'}\nMapa informado:\n${input.map}`,
    },
  ] });
  const jsonText = response.match(/<json>([\s\S]*?)<\/json>/i)?.[1] || response;
  let corrected;
  try {
    corrected = JSON.parse(jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    const error = new Error('A IA não retornou uma correção de acorde válida. Tente novamente.');
    error.status = 422;
    throw error;
  }

  try {
    const entries = Array.isArray(corrected.chords) ? corrected.chords : [corrected];
    const chords = entries.map((entry, index) => {
      const chord = parseChordMap(String(entry?.map || ''), String(entry?.name || input.name || ''));
      return {
        name: chord.name,
        map: chord.frets.map((fret) => fret < 0 ? 'X' : fret).join('-'),
        ...(sourceChords[index]?.variant ? { variant: sourceChords[index].variant } : {}),
      };
    });
    if (expectedCount > 1 && chords.length !== expectedCount) {
      throw new Error('quantidade diferente');
    }
    return {
      chords,
      ...(chords.length === 1 ? chords[0] : {}),
    };
  } catch {
    const error = new Error('A correção da IA ainda não possui seis posições válidas. Tente novamente.');
    error.status = 422;
    throw error;
  }
}

async function organizeCifra({ apiKey, baseUrl, model, input, allowedChords }) {
  const organizedInput = normalizeCifraStructure(input.content);
  const catalog = allowedChords.join(', ');
  const system = [
    'Você é um editor profissional de cifras para violão.',
    'Sua única tarefa é organizar a formatação; não rearmonize, não substitua e não remova acordes.',
    'Preserve exatamente todas as palavras da letra e a ordem das partes da música.',
    'Reconheça linhas formadas por acordes, incluindo inversões como G/B e extensões como Am7.',
    'Escreva títulos em linhas próprias como # Intro, # Verso, # Refrão, # Ponte e # Final.',
    'Coloque todo acorde entre colchetes, por exemplo [Dm], [G/B] e [C4].',
    'Parênteses externos podem agrupar progressões; preserve-os e não os trate como parte da letra.',
    'Quando uma linha de acordes estiver acima de uma linha de letra, posicione os acordes antes dos trechos correspondentes.',
    'Se não houver letra, mantenha os acordes juntos em uma linha instrumental.',
    'Cada linha cantada deve conter apenas uma frase musical curta; nunca coloque um verso ou refrão inteiro na mesma linha.',
    'Quebre linhas longas preferencialmente antes de uma preparação harmônica, mantendo o acorde sobre a palavra em que entra.',
    'Mantenha uma linha em branco entre as seções.',
    'Não acrescente explicações, comentários ou cercas de código.',
    'Entregue apenas a cifra organizada entre as tags <cifra> e </cifra>.',
  ].join(' ');
  const user = [
    `Nomes já disponíveis no banco para referência: ${catalog}`,
    `\nCIFRA PARA ORGANIZAR:\n${organizedInput}`,
  ].join('\n');
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const first = await callOllama({ apiKey, baseUrl, model, messages });
  let content = normalizeReharmonizedLayout(extractCifra(first));
  let lyricsChanged = organizationLyricsFingerprint(content, allowedChords)
    !== organizationLyricsFingerprint(organizedInput, allowedChords);
  let unformatted = findUnformattedChordLines(content, allowedChords);

  if (lyricsChanged || unformatted.length > 0) {
    const problems = [
      lyricsChanged ? 'alguma palavra da letra foi alterada ou removida' : '',
      unformatted.length ? `estas linhas de acordes continuam sem colchetes: ${unformatted.join(' | ')}` : '',
    ].filter(Boolean).join('; ');
    const corrected = await callOllama({ apiKey, baseUrl, model, messages: [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `Corrija somente a formatação porque ${problems}. Preserve cada palavra e envolva cada acorde em colchetes.`,
      },
    ] });
    content = normalizeReharmonizedLayout(extractCifra(corrected));
    lyricsChanged = organizationLyricsFingerprint(content, allowedChords)
      !== organizationLyricsFingerprint(organizedInput, allowedChords);
    unformatted = findUnformattedChordLines(content, allowedChords);
  }

  if (lyricsChanged) {
    const error = new Error('A IA alterou a letra ao tentar organizar a cifra. O resultado foi descartado.');
    error.status = 422;
    throw error;
  }
  if (unformatted.length > 0) {
    const error = new Error('A IA não conseguiu colocar todos os acordes entre colchetes. Tente novamente.');
    error.status = 422;
    throw error;
  }
  if (!content.includes('[') || content.length < 10) {
    const error = new Error('O Ollama não retornou uma cifra organizada válida. Tente novamente.');
    error.status = 422;
    throw error;
  }

  return { content };
}

async function reharmonize({ apiKey, baseUrl, model, input, allowedChords }) {
  const organizedContent = normalizeCifraStructure(input.content);
  const recommendedShapes = selectChordVoicings(allowedChords, input.chords);
  const catalog = recommendedShapes
    .filter((chord) => chord && typeof chord === 'object')
    .map((chord) => `${chord.name}: ${chord.frets.map((fret) => fret === -1 ? 'X' : fret).join(' ')}`)
    .join('\n');
  const system = [
    'Você é um arranjador musical especializado em harmonia para violão.',
    'Organize e rearmonize a cifra preservando exatamente a letra e a ordem das seções.',
    'Escreva cada título de seção em uma linha própria no formato # Intro, # Verso, # Refrão, # Ponte ou # Final.',
    'Use colchetes exclusivamente para acordes, sempre na sintaxe [Acorde].',
    'Mantenha uma linha em branco entre as seções e posicione cada acorde antes da palavra ou trecho em que ele entra.',
    'Cada linha cantada deve conter uma frase musical curta, normalmente até cinco acordes; nunca comprima um verso ou refrão inteiro em uma linha.',
    'Ao quebrar uma linha, leve os acordes de preparação para a mesma linha da frase que eles preparam.',
    'Parênteses externos podem agrupar progressões; preserve-os e não os trate como parte da letra.',
    'Crie um arranjo profissional e harmonicamente rico, não apenas uma troca superficial de acordes.',
    'A melodia é soberana: cada acorde deve conter a nota cantada ou tratá-la como tensão consonante; evite segundas menores e nonas menores acidentais contra notas sustentadas.',
    'Se reconhecer a canção pelo título, respeite sua melodia conhecida. Se não tiver certeza da melodia, seja conservador e não invente tensões alteradas arriscadas.',
    'Use condução de vozes, inversões com baixo, acordes de passagem, dominantes secundários, preparações e cadências adequadas ao estilo.',
    'O baixo deve formar uma linha intencional, preferencialmente por graus conjuntos ou pequenos intervalos; não use inversões que criem saltos e zigue-zagues gratuitos.',
    'Controle o ritmo harmônico: riqueza não é quantidade. Dê dois ou quatro tempos aos acordes estruturais e acelere somente em passagens ou cadências justificadas.',
    'Estrofes com a mesma melodia devem compartilhar o mesmo esqueleto harmônico, salvo quando uma variação de clímax for claramente intencional.',
    'Todo dominante alterado, diminuto ou acorde emprestado deve ter preparação, função e resolução perceptíveis.',
    'Diferencie versos, pré-refrões, refrões e pontes, aumentando a tensão e resolvendo-a de forma musical.',
    'Evite empilhar acordes sem clareza: se vários acordes forem instrumentais, coloque-os em uma linha própria e separe-os por espaços.',
    'O catálogo contém posições recomendadas. Você pode criar acordes fora dele somente quando forem musicalmente necessários e tiverem símbolo convencional inequívoco.',
    'Escolha progressões pensando também em transições confortáveis no braço e não use variações gratuitas do mesmo acorde.',
    'Não acrescente explicações, cercas de código ou comentários.',
    'Entregue apenas a cifra final entre as tags <cifra> e </cifra>.',
  ].join(' ');
  const densityGuidance = {
    leve: 'Use no máximo três acordes por frase cantada e enriqueça apenas pontos estratégicos.',
    moderada: 'Use normalmente de três a cinco acordes por frase, com passagens pontuais e espaço para cada função ser ouvida.',
    intensa: 'Use até seis acordes por frase quando a métrica permitir; densidade maior fica reservada a trechos instrumentais e cadências justificadas.',
  }[input.intensity];
  const user = [
    `Música: ${input.title || 'título não informado'}`,
    `Artista ou referência: ${input.artist || 'não informado'}`,
    `Tom atual: ${input.key || 'não informado'}`,
    `Estilo desejado: ${input.style}`,
    `Intensidade da rearmonização: ${input.intensity}`,
    `Direção de densidade: ${densityGuidance}`,
    input.melodyGuide ? `GUIA MELÓDICO FORNECIDO PELO MÚSICO (prioridade máxima): ${input.melodyGuide}` : 'Guia melódico não fornecido: preserve a melodia conhecida pelo título e use escolhas conservadoras onde houver dúvida.',
    input.instructions ? `Orientações adicionais: ${input.instructions}` : '',
    `\nCATÁLOGO DE ACORDES JÁ DISPONÍVEIS:\n${catalog}`,
    `\nCIFRA ORIGINAL JÁ ORGANIZADA:\n${organizedContent}`,
  ].filter(Boolean).join('\n');

  const first = await callOllama({ apiKey, baseUrl, model, messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ] });
  let rawContent = extractCifra(first);
  let content = normalizeReharmonizedLayout(rawContent);
  let lyricsChanged = lyricsFingerprint(content, allowedChords)
    !== lyricsFingerprint(organizedContent, allowedChords);
  let harmonicAudit = auditHarmonicFlow(rawContent, input.intensity);
  let melodyAudit = auditMelodyGuide(rawContent, input.melodyGuide);

  if (lyricsChanged || harmonicAudit.issues.length || input.melodyGuide) {
    const reviewReasons = [
      lyricsChanged ? 'A letra foi alterada: restaure exatamente todas as palavras e sua ordem.' : '',
      ...harmonicAudit.issues,
      ...melodyAudit.violations,
      input.melodyGuide ? 'Confira novamente cada acorde contra o guia melódico informado, sobretudo notas sustentadas e finais de frase.' : '',
    ].filter(Boolean).join('\n- ');
    const corrected = await callOllama({ apiKey, baseUrl, model, messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `Faça uma auditoria final e corrija estes pontos:\n- ${reviewReasons}\nPriorize melodia, respiração harmônica, baixo fluido e coerência entre estrofes. Preserve a letra e devolva somente a cifra.`,
      },
    ] });
    rawContent = extractCifra(corrected);
    content = normalizeReharmonizedLayout(rawContent);
    lyricsChanged = lyricsFingerprint(content, allowedChords)
      !== lyricsFingerprint(organizedContent, allowedChords);
    harmonicAudit = auditHarmonicFlow(rawContent, input.intensity);
    melodyAudit = auditMelodyGuide(rawContent, input.melodyGuide);
  }

  if (lyricsChanged) {
    const error = new Error('A IA alterou a letra original mesmo após a correção. O resultado foi descartado.');
    error.status = 422;
    throw error;
  }

  if (harmonicAudit.densityViolations.length) {
    const error = new Error('A IA ainda concentrou acordes demais em uma frase. O arranjo foi descartado para preservar o ritmo harmônico.');
    error.status = 422;
    throw error;
  }

  if (harmonicAudit.bassWarnings.length) {
    const error = new Error('A linha de baixo ainda contém saltos excessivos entre as inversões. O arranjo foi descartado para preservar a condução de vozes.');
    error.status = 422;
    throw error;
  }

  if (melodyAudit.violations.length) {
    const error = new Error(`A harmonia ainda conflita com o guia melódico: ${melodyAudit.violations.join(' ')}`);
    error.status = 422;
    throw error;
  }

  if (!content.includes('[') || content.length < 10) {
    const error = new Error('O Ollama não retornou uma cifra válida. Tente novamente.');
    error.status = 422;
    throw error;
  }

  const missingNames = findUnsupportedChords(content, allowedChords);
  if (missingNames.length > 16) {
    const error = new Error('A rearmonização criou acordes novos demais de uma só vez. Reduza a intensidade e tente novamente.');
    error.status = 422;
    throw error;
  }
  const createdChords = missingNames.length
    ? await createMissingChords({ apiKey, baseUrl, model, names: missingNames })
    : [];
  const completeLibrary = [...input.chords, ...createdChords];
  const completeNames = [...allowedChords, ...createdChords.map((chord) => chord.name)];
  const stillMissing = findUnsupportedChords(content, completeNames);
  if (stillMissing.length) {
    const error = new Error(`Não foi possível validar estes acordes novos: ${stillMissing.join(', ')}.`);
    error.status = 422;
    throw error;
  }

  return {
    content,
    voicings: serializeSelectedVoicings(content, completeLibrary),
    createdChords,
    harmonicAudit: {
      status: harmonicAudit.issues.length ? 'reviewed' : 'approved',
      melodyReference: input.melodyGuide ? 'provided' : 'conservative',
      melodyChecks: melodyAudit.checked,
      bassWarnings: harmonicAudit.bassWarnings.length,
    },
  };
}

async function createMissingChords({ apiKey, baseUrl, model, names }) {
  const invalidNames = names.filter((name) => !analyzeChordSymbol(name));
  if (invalidNames.length) {
    const error = new Error(`A IA sugeriu símbolos de acorde que não podem ser validados: ${invalidNames.join(', ')}.`);
    error.status = 422;
    throw error;
  }

  const generated = [];
  const unresolved = [];
  for (const name of names) {
    const frets = generateChordFrets(name);
    if (!frets) {
      unresolved.push(name);
      continue;
    }
    const chord = parseChordMap(frets.map((fret) => fret < 0 ? 'X' : fret).join('-'), name);
    const audit = validateChordVoicing(chord);
    if (audit.valid) generated.push(finalizeGeneratedChord(chord, name, 'Posição calculada e validada pelo sistema'));
    else unresolved.push(name);
  }

  if (unresolved.length === 0) return generated;

  const requirements = unresolved.map(describeChordRequirements).join('\n');
  const system = [
    'Você é um luthier e professor de harmonia especializado em mapas de violão na afinação E A D G B e.',
    'Crie uma única posição tocável e musicalmente correta para cada acorde solicitado.',
    'Use números absolutos de casas, X para corda abafada e 0 para corda solta, sempre da 6ª corda até a 1ª.',
    'A nota mais grave deve respeitar o baixo indicado após a barra.',
    'Não inclua nenhuma nota alheia à formação do acorde e preserve todas as notas essenciais.',
    'Prefira posições compactas de até cinco casas e transições comuns no violão.',
    'Responda somente com JSON válido entre <json> e </json>, no formato {"chords":[{"name":"Cmaj7","map":"X-3-2-0-0-0"}]}.',
  ].join(' ');
  const user = `ACORDES NOVOS:\n${requirements}`;
  let feedback = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callOllama({ apiKey, baseUrl, model, messages: [
      { role: 'system', content: system },
      { role: 'user', content: feedback ? `${user}\n\nCORRIJA ESTES PROBLEMAS:\n${feedback}` : user },
    ] });
    const parsed = parseGeneratedChords(response, unresolved);
    if (parsed.chords.length === unresolved.length && parsed.errors.length === 0) {
      return [...generated, ...parsed.chords];
    }
    feedback = parsed.errors.join('\n');
  }

  const error = new Error('A IA sugeriu acordes novos, mas os mapas não passaram pela auditoria harmônica. Nada foi aplicado.');
  error.status = 422;
  throw error;
}

function parseGeneratedChords(value, expectedNames) {
  const jsonText = value.match(/<json>([\s\S]*?)<\/json>/i)?.[1] || value;
  let payload;
  try {
    payload = JSON.parse(jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return { chords: [], errors: ['A resposta não contém JSON válido.'] };
  }

  const entries = Array.isArray(payload?.chords) ? payload.chords : [];
  const expected = new Map(expectedNames.map((name) => [normalizeChordName(name), name]));
  const chords = [];
  const errors = [];
  for (const entry of entries) {
    const expectedName = expected.get(normalizeChordName(String(entry?.name || '')));
    if (!expectedName || chords.some((chord) => normalizeChordName(chord.name) === normalizeChordName(expectedName))) continue;
    try {
      const chord = parseChordMap(String(entry.map || ''), expectedName);
      const audit = validateChordVoicing(chord);
      if (!audit.valid) {
        errors.push(`${expectedName}: ${audit.errors.join('; ')}`);
        continue;
      }
      chords.push(finalizeGeneratedChord(chord, expectedName, 'Posição criada e validada pela IA'));
    } catch (error) {
      errors.push(`${expectedName}: ${error.message || 'mapa inválido'}`);
    }
  }
  for (const name of expectedNames) {
    if (!chords.some((chord) => normalizeChordName(chord.name) === normalizeChordName(name))) {
      errors.push(`${name}: posição válida não encontrada`);
    }
  }
  return { chords, errors: [...new Set(errors)] };
}

function finalizeGeneratedChord(chord, name, variant) {
  return {
    ...chord,
    id: `ai:${normalizeChordName(name)}:${chord.frets.join('-')}`,
    name,
    variant,
    custom: true,
    updatedAt: new Date().toISOString(),
  };
}

async function callOllama({ apiKey, baseUrl, model, messages }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.25 },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Ollama respondeu com HTTP ${response.status}.`);
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }

  const content = payload.message?.content;
  if (typeof content !== 'string') throw new Error('Resposta vazia ou incompatível do Ollama.');
  return content.trim();
}

function validateReharmonizationInput(body) {
  if (!body || typeof body !== 'object') throw clientError('Corpo da requisição inválido.');
  if (typeof body.content !== 'string' || body.content.trim().length < 10) {
    throw clientError('A cifra está vazia ou muito curta.');
  }
  if (!Array.isArray(body.chords)) throw clientError('Banco de acordes inválido.');

  return {
    content: body.content.slice(0, 80_000),
    title: String(body.title || '').slice(0, 120),
    artist: String(body.artist || '').slice(0, 120),
    key: String(body.key || '').slice(0, 16),
    style: String(body.style || 'MPB contemporânea').slice(0, 80),
    intensity: ['leve', 'moderada', 'intensa'].includes(body.intensity) ? body.intensity : 'moderada',
    instructions: String(body.instructions || '').slice(0, 1_000),
    melodyGuide: String(body.melodyGuide || '').slice(0, 2_000),
    chords: body.chords.slice(0, 500).filter((chord) =>
      chord && typeof chord.name === 'string' && Array.isArray(chord.frets) && chord.frets.length === 6,
    ),
  };
}

function validateChordMapInput(body) {
  if (!body || typeof body !== 'object') throw clientError('Corpo da requisição inválido.');
  const name = String(body.name || '').trim().slice(0, 80);
  const map = String(body.map || '').trim().slice(0, 4_000);
  if (!map) throw clientError('Digite o mapa que deseja revisar.');
  return { name, map };
}

function findUnsupportedChords(content, allowedChords) {
  const allowed = new Set(allowedChords.map(normalizeChordName));
  const used = [...content.matchAll(/\[([^\]\n]+)]/g)].map((match) => match[1].trim());
  return [...new Set(used.filter((chord) => !allowed.has(normalizeChordName(chord))))];
}

function normalizeChordName(value) {
  return value.replace(/\s+/g, '').toLocaleLowerCase('pt-BR');
}

function isChordToken(value, allowedChords = []) {
  let token = value.trim().replace(/^\[|]$/g, '').replace(/^[|:]+|[|:]+$/g, '');
  while (/^[({]/.test(token)) token = token.slice(1).trimStart();
  while (token.endsWith(')') && (token.match(/\)/g)?.length || 0) > (token.match(/\(/g)?.length || 0)) {
    token = token.slice(0, -1).trimEnd();
  }
  while (token.endsWith('}')) token = token.slice(0, -1).trimEnd();
  if (!token) return false;
  const allowed = new Set(allowedChords.map(normalizeChordName));
  if (allowed.has(normalizeChordName(token))) return true;
  return /^[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:[#b+\-]\d+)*(?:\([^)]*\))?|[°ø])?(?:\/[A-G](?:#|b)?)?$/.test(token);
}

function isUnformattedChordLine(line, allowedChords = []) {
  if (!line.trim() || /^\s*#/.test(line) || line.includes('[')) return false;
  const tokens = line.trim().split(/\s+/)
    .filter((token) => !/^[|:()[\]{},.;~\-–—]+$/.test(token));
  return tokens.length > 0 && tokens.every((token) => isChordToken(token, allowedChords));
}

function findUnformattedChordLines(value, allowedChords = []) {
  return normalizeCifraStructure(value).split('\n')
    .filter((line) => isUnformattedChordLine(line, allowedChords))
    .map((line) => line.trim());
}

export function organizationLyricsFingerprint(value, allowedChords = []) {
  return lyricsFingerprint(value, allowedChords);
}

export function lyricsFingerprint(value, allowedChords = []) {
  const lyricText = normalizeCifraStructure(value).split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !isUnformattedChordLine(line, allowedChords))
    .join(' ')
    .replace(/\[[^\]\n]+]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR');

  return lyricText.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.join(' ') || '';
}

const SECTION_NAME_PATTERN = /^(?:intro(?:dução)?|verso|estrofe|refr[aã]o(?:\s+final)?|pr[eé][\s-]?refr[aã]o|ponte|interl[uú]dio|solo|instrumental|final|fim|outro|parte\s+[a-z0-9]+)(?:\s+\d+|\s*[x×]\s*\d+)?$/i;

function isSectionName(value) {
  return SECTION_NAME_PATTERN.test(value.trim().replace(/\s*:\s*$/, ''));
}

export function normalizeCifraStructure(value) {
  const normalizedLines = String(value || '').replace(/\r\n?/g, '\n').split('\n').flatMap((line) => {
    const heading = line.match(/^\s*#+\s*(.+?)\s*$/);
    if (heading) return [`# ${heading[1].replace(/\s*:\s*$/, '').trim()}`];

    const bracketedSection = line.match(/^\s*\[([^\]\n]+)]\s*(.*)$/);
    if (bracketedSection && isSectionName(bracketedSection[1])) {
      const title = bracketedSection[1].replace(/\s*:\s*$/, '').trim();
      const remainder = bracketedSection[2].trimStart();
      return remainder ? [`# ${title}`, remainder] : [`# ${title}`];
    }

    const bareSection = line.trim();
    if (isSectionName(bareSection)) {
      return [`# ${bareSection.replace(/\s*:\s*$/, '').trim()}`];
    }

    return [line.trimEnd()];
  });

  const organized = [];
  for (const line of normalizedLines) {
    if (line.startsWith('# ')) {
      while (organized.at(-1) === '') organized.pop();
      if (organized.length > 0) organized.push('');
    }
    organized.push(line);
  }

  return organized.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function auditHarmonicFlow(value, intensity = 'moderada') {
  const densityLimit = { leve: 3, moderada: 5, intensa: 6 }[intensity] || 5;
  const chordWordLimit = { leve: 0.5, moderada: 0.72, intensa: 0.9 }[intensity] || 0.72;
  const densityViolations = [];
  const bassWarnings = [];
  const lines = normalizeCifraStructure(value).split('\n');

  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const chordMatches = [...line.matchAll(/\[([^\]\n]+)]/g)];
    const lyric = line.replace(/\[[^\]\n]+]/g, '').trim();
    if (!lyric || chordMatches.length < 2) continue;

    const wordCount = lyric.match(/[\p{L}\p{N}]+/gu)?.length || 0;
    if (chordMatches.length > densityLimit) {
      densityViolations.push(
        `Linha cantada ${index + 1}: reduza de ${chordMatches.length} para no máximo ${densityLimit} acordes e deixe a frase respirar.`,
      );
    } else if (chordMatches.length >= 4 && wordCount && chordMatches.length / wordCount > chordWordLimit) {
      densityViolations.push(
        `Linha cantada ${index + 1}: ${chordMatches.length} acordes para ${wordCount} palavras deixam o ritmo harmônico acavalado; sustente mais os acordes estruturais.`,
      );
    }

    const names = chordMatches.map((match) => match[1].trim());
    const analyses = names.map(analyzeChordSymbol);
    const slashCount = names.filter((name) => name.includes('/')).length;
    if (slashCount < 2 || analyses.some((analysis) => !analysis)) continue;
    const jumps = analyses.slice(1).map((analysis, chordIndex) => {
      const previous = analyses[chordIndex];
      const distance = Math.abs(analysis.bass - previous.bass);
      return Math.min(distance, 12 - distance);
    });
    if (jumps.some((distance) => distance >= 5)) {
      bassWarnings.push(
        `Linha cantada ${index + 1}: suavize a condução do baixo ${analyses.map((analysis) => analysis.bassName).join(' → ')}; há um salto amplo entre inversões.`,
      );
    }
  }

  const issues = [...densityViolations, ...bassWarnings];
  return {
    status: issues.length ? 'review' : 'approved',
    issues,
    densityViolations,
    bassWarnings,
  };
}

export function auditMelodyGuide(value, guide) {
  const entries = parseMelodyGuide(guide);
  const violations = [];
  let checked = 0;

  for (const entry of entries) {
    const noteAnalysis = analyzeChordSymbol(entry.note);
    if (!noteAnalysis) continue;
    const chords = findChordsAtLyricPhrase(value, entry.phrase);
    for (const chordName of chords) {
      const chord = analyzeChordSymbol(chordName);
      if (!chord) continue;
      checked += 1;
      if (!chord.absoluteTones.has(noteAnalysis.root)) {
        violations.push(
          `No trecho “${entry.phrase}”, [${chordName}] não contém a nota melódica ${entry.note}.`,
        );
      }
    }
  }

  return {
    status: violations.length ? 'conflict' : checked ? 'approved' : 'not-checked',
    checked,
    violations: [...new Set(violations)],
  };
}

function parseMelodyGuide(value) {
  return String(value || '').split(/\r?\n|;/).flatMap((instruction) => {
    const quotedPhrase = instruction.match(/["“]([^"”]+)["”]/)?.[1];
    const plainPhrase = instruction.match(/^\s*(?:em\s+)?(.+?)\s*(?:=|:)\s*[A-Ga-g](?:#|b|♯|♭)?(?:\s|$)/i)?.[1];
    const noteMatch = instruction.match(/nota[^.;\n=]{0,60}?(?:é|=|:)\s*([A-Ga-g])([#b♯♭]?)(?![\p{L}])/iu)
      || instruction.match(/(?:=|:)\s*([A-Ga-g])([#b♯♭]?)(?![\p{L}])/u);
    const phrase = String(quotedPhrase || plainPhrase || '').trim();
    if (!phrase || !noteMatch) return [];
    const accidental = (noteMatch[2] || '').replace('♯', '#').replace('♭', 'b');
    return [{ phrase, note: `${noteMatch[1].toUpperCase()}${accidental}` }];
  });
}

function findChordsAtLyricPhrase(value, phrase) {
  const wanted = phrase.match(/[\p{L}\p{N}]+/gu)?.map(normalizeLyricWord) || [];
  if (!wanted.length) return [];
  const found = [];

  for (const line of normalizeCifraStructure(value).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const words = [];
    const chordPattern = /\[([^\]\n]+)]/g;
    let activeChord = '';
    let cursor = 0;
    const appendWords = (text) => {
      for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
        words.push({ value: normalizeLyricWord(match[0]), chord: activeChord });
      }
    };
    for (const match of line.matchAll(chordPattern)) {
      appendWords(line.slice(cursor, match.index));
      activeChord = match[1].trim();
      cursor = match.index + match[0].length;
    }
    appendWords(line.slice(cursor));

    for (let index = 0; index <= words.length - wanted.length; index += 1) {
      if (wanted.every((word, offset) => words[index + offset].value === word)) {
        const chord = words[index + wanted.length - 1].chord;
        if (chord) found.push(chord);
      }
    }
  }
  return found;
}

function normalizeLyricWord(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function normalizeReharmonizedLayout(value) {
  return normalizeCifraStructure(value)
    .split('\n')
    .flatMap((line) => splitLongChordLine(line.trim()))
    .join('\n')
    .replace(/]\s*(?=\[)/g, '] ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLongChordLine(line) {
  if (!line || line.startsWith('#')) return [line];
  const chordPattern = /\[[^\]\n]+]/g;
  const matches = [...line.matchAll(chordPattern)];
  if (matches.length < 6 || line.replace(chordPattern, '').trim() === '') return [line];

  const lead = line.slice(0, matches[0].index).trim();
  const units = [];
  let pending = lead;
  for (const [index, match] of matches.entries()) {
    const end = matches[index + 1]?.index ?? line.length;
    const segment = line.slice(match.index, end).trim();
    pending = [pending, segment].filter(Boolean).join(' ');
    const lyric = segment.replace(chordPattern, '').trim();
    if (lyric) {
      units.push(pending);
      pending = '';
    }
  }
  if (pending) {
    if (units.length) units[units.length - 1] += ` ${pending}`;
    else units.push(pending);
  }

  const rows = [];
  let row = '';
  let rowChords = 0;
  let rowLyrics = 0;
  for (const unit of units) {
    const unitChords = (unit.match(chordPattern) || []).length;
    const unitLyrics = unit.replace(chordPattern, '').trim().length;
    const exceedsReadableLine = row && (
      rowChords + unitChords > 5
      || rowLyrics + unitLyrics > 46
      || row.length + unit.length > 105
    );
    if (exceedsReadableLine) {
      rows.push(row);
      row = '';
      rowChords = 0;
      rowLyrics = 0;
    }
    row = [row, unit].filter(Boolean).join(' ');
    rowChords += unitChords;
    rowLyrics += unitLyrics;
  }
  if (row) rows.push(row);
  return rows.length > 1 ? rows : [line];
}

function extractCifra(value) {
  const tagged = value.match(/<cifra>([\s\S]*?)<\/cifra>/i)?.[1];
  return (tagged || value)
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw clientError('Requisição muito grande.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw clientError('JSON inválido.');
  }
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('OLLAMA_BASE_URL inválida.');
  return parsed.toString().replace(/\/$/, '');
}

function clientError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function setJsonHeaders(response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, status, value) {
  response.statusCode = status;
  response.end(JSON.stringify(value));
}
