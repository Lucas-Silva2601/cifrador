export function createId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clampNumber(value, min, max, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function isDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function normalizeSong(song) {
  return {
    id: typeof song.id === 'string' && song.id ? song.id : createId(),
    title: String(song.title || '').slice(0, 100),
    artist: String(song.artist || '').slice(0, 100),
    key: String(song.key || '').slice(0, 8),
    capo: clampNumber(song.capo, 0, 12, 0),
    bpm: clampNumber(song.bpm, 20, 300, null),
    content: String(song.content || ''),
    chordVoicings: Array.isArray(song.chordVoicings)
      ? song.chordVoicings
        .filter((item) => item && typeof item.name === 'string' && typeof item.id === 'string')
        .map((item) => ({ name: item.name, id: item.id }))
      : [],
    folderId: typeof song.folderId === 'string' ? song.folderId : '',
    updatedAt: isDate(song.updatedAt) ? song.updatedAt : new Date().toISOString(),
  };
}

export function createEmptySong(folderId = '') {
  return normalizeSong({
    id: createId(),
    title: '',
    artist: '',
    key: 'C',
    capo: 0,
    bpm: null,
    content: '# Verso\n[C]Comece a escrever sua [G]cifra aqui…',
    folderId,
    updatedAt: new Date().toISOString(),
  });
}

export function createDemoSong() {
  return normalizeSong({
    id: 'boas-vindas',
    title: 'Primeiros acordes',
    artist: 'Cifrador',
    key: 'C',
    capo: 0,
    bpm: 92,
    content:
      '# Intro\n[C]  [Am]  [F]  [G]\n\n# Verso\n[C]Cada acorde abre um [Am]caminho\n[F]Cada verso encontra o seu [G]lugar\n[C]Guarde aqui o seu re[Am]pertório\n[F]E escolha o tom para can[G]tar\n\n# Refrão\n[F]Leve a música com [G]você\n[Em]Pronta para recome[Am]çar\n[F]Um semitom de cada [G]vez\n[C]Até a voz se encaixar',
    updatedAt: new Date().toISOString(),
  });
}

export function mergeSongs(current, imported) {
  const byId = new Map(current.map((song) => [song.id, song]));
  for (const song of imported) byId.set(song.id, song);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
