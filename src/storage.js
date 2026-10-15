const STORAGE_KEY = 'cifrador:songs:v2';
const THEME_KEY = 'cifrador:theme';
const CUSTOM_CHORDS_KEY = 'cifrador:custom-chords:v1';
const LAYOUT_KEY = 'cifrador:layout:v1';
const SONG_FOLDERS_KEY = 'cifrador:song-folders:v1';

function readLocalValue(key) {
  const desktopStorage = globalThis.window?.cifradorDesktop?.storage;
  return desktopStorage ? desktopStorage.getItem(key) : localStorage.getItem(key);
}

function writeLocalValue(key, value) {
  const desktopStorage = globalThis.window?.cifradorDesktop?.storage;
  if (desktopStorage) {
    desktopStorage.setItem(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

export function loadSongs() {
  try {
    const value = JSON.parse(readLocalValue(STORAGE_KEY));
    return Array.isArray(value) ? value.filter(isValidSong) : [];
  } catch {
    return [];
  }
}

export function saveSongs(songs) {
  writeLocalValue(STORAGE_KEY, JSON.stringify(songs));
}

export function loadSongFolders() {
  try {
    const value = JSON.parse(readLocalValue(SONG_FOLDERS_KEY));
    return Array.isArray(value) ? value.filter(isValidSongFolder) : [];
  } catch {
    return [];
  }
}

export function saveSongFolders(folders) {
  writeLocalValue(SONG_FOLDERS_KEY, JSON.stringify(folders));
}

export function loadCustomChords() {
  try {
    const value = JSON.parse(readLocalValue(CUSTOM_CHORDS_KEY));
    return Array.isArray(value) ? value.filter(isValidChord) : [];
  } catch {
    return [];
  }
}

export function saveCustomChords(chords) {
  writeLocalValue(CUSTOM_CHORDS_KEY, JSON.stringify(chords));
}

export function loadTheme() {
  return readLocalValue(THEME_KEY) || 'dark';
}

export function saveTheme(theme) {
  writeLocalValue(THEME_KEY, theme);
}

export function loadLayoutPreferences() {
  try {
    const value = JSON.parse(readLocalValue(LAYOUT_KEY));
    return {
      sidebarCollapsed: Boolean(value?.sidebarCollapsed),
      editorCollapsed: Boolean(value?.editorCollapsed),
      previewWidthRatio: Number.isFinite(value?.previewWidthRatio)
        ? Math.min(0.85, Math.max(0.3, value.previewWidthRatio))
        : null,
    };
  } catch {
    return { sidebarCollapsed: false, editorCollapsed: false, previewWidthRatio: null };
  }
}

export function saveLayoutPreferences(preferences) {
  writeLocalValue(LAYOUT_KEY, JSON.stringify({
    sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
    editorCollapsed: Boolean(preferences.editorCollapsed),
    previewWidthRatio: Number.isFinite(preferences.previewWidthRatio)
      ? Math.min(0.85, Math.max(0.3, preferences.previewWidthRatio))
      : null,
  }));
}

export function isValidSong(song) {
  return Boolean(
    song &&
      typeof song === 'object' &&
      typeof song.title === 'string' &&
      typeof song.content === 'string',
  );
}

export function isValidSongFolder(folder) {
  return Boolean(
    folder &&
      typeof folder === 'object' &&
      typeof folder.id === 'string' &&
      folder.id &&
      typeof folder.name === 'string' &&
      folder.name.trim(),
  );
}

function isValidChord(chord) {
  return Boolean(
    chord &&
      typeof chord === 'object' &&
      typeof chord.name === 'string' &&
      Array.isArray(chord.frets) &&
      chord.frets.length === 6 &&
      chord.frets.every((fret) => Number.isInteger(fret) && fret >= -1 && fret <= 24),
  );
}
