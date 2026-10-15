import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const {
  loadSongFolders,
  loadSongs,
  loadLayoutPreferences,
  saveLayoutPreferences,
  saveSongFolders,
  saveSongs,
} = await import('./storage.js');

test('salva e recupera pastas válidas de músicas', () => {
  saveSongFolders([
    { id: 'louvores', name: 'Louvores', createdAt: '2026-10-11T00:00:00.000Z' },
    { id: '', name: 'Inválida' },
  ]);
  assert.deepEqual(loadSongFolders(), [
    { id: 'louvores', name: 'Louvores', createdAt: '2026-10-11T00:00:00.000Z' },
  ]);
});

test('mantém a associação entre música e pasta', () => {
  saveSongs([{ id: 'musica-1', title: 'Canção', content: '[C]Olá', folderId: 'louvores' }]);
  assert.equal(loadSongs()[0].folderId, 'louvores');
});

test('guarda a largura escolhida para a folha da cifra', () => {
  saveLayoutPreferences({ sidebarCollapsed: true, editorCollapsed: true, previewWidthRatio: 0.46 });

  assert.deepEqual(loadLayoutPreferences(), {
    sidebarCollapsed: true,
    editorCollapsed: true,
    previewWidthRatio: 0.46,
  });
});
