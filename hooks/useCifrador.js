'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  extractChords,
  getChordLibrary,
  transposeChord,
  transposeContent,
} from '@/lib/chords';
import { selectChordVoicings } from '@/lib/voicings';
import { validateChordVoicing } from '@/lib/chord-theory';
import { requestAi } from '@/lib/ai-client';
import {
  createDemoSong,
  createEmptySong,
  createId,
  mergeSongs,
  normalizeSong,
} from '@/lib/songs';
import {
  isValidSong,
  isValidSongFolder,
  loadCustomChords,
  loadLayoutPreferences,
  loadSongFolders,
  loadSongs,
  loadTheme,
  saveCustomChords,
  saveLayoutPreferences,
  saveSongFolders,
  saveSongs,
  saveTheme,
} from '@/lib/storage';

export function useCifrador() {
  const [songs, setSongs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('');
  const [customChords, setCustomChords] = useState([]);
  const [customChordVersion, setCustomChordVersion] = useState(0);
  const [theme, setThemeState] = useState('dark');
  const [layout, setLayout] = useState({ sidebarCollapsed: false, editorCollapsed: false, previewWidthRatio: null });
  const [transposeOffset, setTransposeOffset] = useState(0);
  const [saveState, setSaveState] = useState('saved');
  const [toast, setToast] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const initialSongs = loadSongs();
    const initialFolders = loadSongFolders();
    const seeded = initialSongs.length ? initialSongs : [createDemoSong()];
    setSongs(seeded);
    setFolders(initialFolders);
    setExpandedFolders(new Set(initialFolders.map((f) => f.id)));
    setSelectedId(seeded[0]?.id ?? null);
    setCustomChords(loadCustomChords());
    setThemeState(loadTheme());
    setLayout(loadLayoutPreferences());
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const showToast = useCallback((message, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, isError, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const persistSongs = useCallback((next) => {
    setSongs(next);
    setSaveState('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSongs(next);
      setSaveState('saved');
    }, 450);
  }, []);

  const persistNow = useCallback((nextSongs = null, message = null) => {
    clearTimeout(saveTimer.current);
    if (nextSongs) {
      setSongs(nextSongs);
      saveSongs(nextSongs);
    } else {
      setSongs((prev) => {
        saveSongs(prev);
        return prev;
      });
    }
    setSaveState('saved');
    if (message) showToast(message);
  }, [showToast]);

  const currentSong = useMemo(
    () => songs.find((s) => s.id === selectedId) ?? null,
    [songs, selectedId],
  );

  const updateSong = useCallback((id, patch) => {
    setSongs((prev) => {
      const next = prev.map((song) =>
        song.id === id ? normalizeSong({ ...song, ...patch, updatedAt: new Date().toISOString() }) : song,
      );
      setSaveState('pending');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveSongs(next);
        setSaveState('saved');
      }, 450);
      return next;
    });
  }, []);

  const selectSong = useCallback((id) => {
    setSelectedId(id);
    setTransposeOffset(0);
  }, []);

  const createSong = useCallback((folderId = '') => {
    const song = createEmptySong(folderId);
    setSongs((prev) => [song, ...prev]);
    saveSongs([song, ...songs]);
    setSelectedId(song.id);
    setLibraryOpen(false);
    showToast('Nova cifra criada');
    return song.id;
  }, [songs, showToast]);

  const duplicateSong = useCallback(() => {
    if (!currentSong) return;
    const copy = normalizeSong({
      ...currentSong,
      id: createId(),
      title: `${currentSong.title || 'Sem título'} (cópia)`,
      updatedAt: new Date().toISOString(),
    });
    const next = [copy, ...songs];
    setSongs(next);
    saveSongs(next);
    setSelectedId(copy.id);
    showToast('Cifra duplicada');
  }, [currentSong, songs, showToast]);

  const deleteSong = useCallback((id = selectedId) => {
    if (!id) return;
    const next = songs.filter((s) => s.id !== id);
    setSongs(next);
    saveSongs(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    setTransposeOffset(0);
    showToast('Música excluída do repertório');
  }, [songs, selectedId, showToast]);

  const applyTranspose = useCallback((steps) => {
    if (!currentSong) return;
    const content = transposeContent(currentSong.content, steps);
    const key = currentSong.key ? transposeChord(currentSong.key, steps) : '';
    updateSong(currentSong.id, { content, key, chordVoicings: [] });
    setTransposeOffset((prev) => prev + steps);
  }, [currentSong, updateSong]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });
  }, []);

  const updateLayout = useCallback((patch) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      saveLayoutPreferences(next);
      return next;
    });
  }, []);

  const persistFolders = useCallback((next) => {
    setFolders(next);
    saveSongFolders(next);
  }, []);

  const aiCatalog = useMemo(() => {
    const library = getChordLibrary(customChords);
    const names = [...new Set(library.map((c) => c.name))];
    return selectChordVoicings(names, library);
  }, [customChords, customChordVersion]);

  return {
    hydrated,
    songs, setSongs,
    folders, persistFolders, setFolders,
    expandedFolders, setExpandedFolders,
    selectedId, selectSong, setSelectedId,
    filter, setFilter,
    customChords, setCustomChords, customChordVersion, setCustomChordVersion,
    theme, toggleTheme,
    layout, updateLayout,
    transposeOffset, setTransposeOffset,
    saveState, toast, showToast,
    libraryOpen, setLibraryOpen,
    currentSong, updateSong,
    createSong, duplicateSong, deleteSong,
    applyTranspose, persistSongs, persistNow,
    aiCatalog,
  };
}

export function validateAiChordsForApply(content, pendingAiChords, customChords) {
  const norm = (v) => v.replace(/\s+/g, '').toLocaleLowerCase('pt-BR');
  const usedNames = new Set(extractChords(content).map(norm));
  const pending = pendingAiChords.filter((c) => usedNames.has(norm(c.name)));
  const invalid = pending.filter((c) => !validateChordVoicing(c).valid);
  if (invalid.length) return { error: 'Um acorde novo não passou pela auditoria e a rearmonização não foi aplicada.' };
  const available = new Set([
    ...getChordLibrary(customChords).map((c) => norm(c.name)),
    ...pending.map((c) => norm(c.name)),
  ]);
  const missing = extractChords(content).filter((n) => !available.has(norm(n)));
  if (missing.length) return { error: `Revise estes acordes antes de aplicar: ${missing.join(', ')}.` };
  return { created: pending };
}
