'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Editor from '@/components/Editor';
import Preview from '@/components/Preview';
import ChordLibrary from '@/components/ChordLibrary';
import AiDialog from '@/components/AiDialog';
import ChordDialog from '@/components/ChordDialog';
import { useCifrador, validateAiChordsForApply } from '@/hooks/useCifrador';
import { requestAi } from '@/lib/ai-client';
import { isValidSong, isValidSongFolder, saveCustomChords, saveSongs } from '@/lib/storage';
import { createId } from '@/lib/songs';

export default function HomePage() {
  const store = useCifrador();
  const {
    hydrated, songs, folders, persistFolders, expandedFolders, setExpandedFolders,
    selectedId, selectSong, filter, setFilter,
    customChords, setCustomChords, customChordVersion, setCustomChordVersion,
    theme, toggleTheme, layout, updateLayout,
    transposeOffset, saveState, toast, showToast,
    libraryOpen, setLibraryOpen,
    currentSong, updateSong, createSong, duplicateSong, deleteSong,
    applyTranspose, persistNow, aiCatalog,
  } = store;

  const [aiOpen, setAiOpen] = useState(false);
  const [chordOpen, setChordOpen] = useState(false);
  const [chordInitial, setChordInitial] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [organizing, setOrganizing] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const previewLayoutRef = useRef(null);

  useEffect(() => {
    if (!hydrated) return;
    document.body.classList.toggle('chord-library-mode', libraryOpen);
  }, [libraryOpen, hydrated]);

  const openFolderDialog = useCallback((id = null) => {
    const folder = folders.find((f) => f.id === id);
    setFolderDialog({ id: folder?.id ?? null });
    setFolderName(folder?.name ?? '');
  }, [folders]);

  function saveFolder() {
    const name = folderName.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) {
      showToast('Informe o nome da pasta.', true);
      return;
    }
    const duplicate = folders.some((f) =>
      f.id !== folderDialog?.id && f.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (duplicate) {
      showToast('Já existe uma pasta com esse nome.', true);
      return;
    }
    if (folderDialog?.id) {
      persistFolders(folders.map((f) => (f.id === folderDialog.id ? { ...f, name } : f)));
      showToast('Pasta renomeada');
    } else {
      const folder = { id: createId(), name, createdAt: new Date().toISOString() };
      persistFolders([...folders, folder]);
      setExpandedFolders(new Set([...expandedFolders, folder.id]));
      showToast('Pasta criada');
    }
    setFolderDialog(null);
  }

  function deleteFolder(id) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const count = songs.filter((s) => s.folderId === id).length;
    const detail = count ? ` As ${count} música${count === 1 ? '' : 's'} ficarão em “Sem pasta”.` : '';
    if (!window.confirm(`Excluir a pasta “${folder.name}”?${detail}`)) return;
    persistFolders(folders.filter((f) => f.id !== id));
    const nextSongs = songs.map((s) => (s.folderId === id ? { ...s, folderId: '' } : s));
    persistNow(nextSongs);
    showToast('Pasta excluída; as músicas foram preservadas');
  }

  function handleExport() {
    persistNow();
    const payload = JSON.stringify({
      version: 4,
      exportedAt: new Date().toISOString(),
      songs,
      folders,
      customChords,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cifrador-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Repertório exportado');
  }

  async function handleImportFile(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const imported = Array.isArray(payload) ? payload : payload.songs;
      if (!Array.isArray(imported)) throw new Error('Formato inválido');
      const valid = imported.filter(isValidSong);
      if (!valid.length) throw new Error('Nenhuma cifra válida');
      if (!Array.isArray(payload) && Array.isArray(payload.folders)) {
        const map = new Map(folders.map((f) => [f.id, f]));
        for (const folder of payload.folders.filter(isValidSongFolder)) map.set(folder.id, folder);
        const nextFolders = [...map.values()];
        persistFolders(nextFolders);
        setExpandedFolders(new Set(nextFolders.map((f) => f.id)));
      }
      if (Array.isArray(payload.customChords)) {
        const map = new Map(customChords.map((c) => [c.id || createId(), c]));
        for (const chord of payload.customChords.filter((c) => c && typeof c.name === 'string' && Array.isArray(c.frets) && c.frets.length === 6)) {
          map.set(chord.id || createId(), chord);
        }
        const nextChords = [...map.values()];
        setCustomChords(nextChords);
        setCustomChordVersion((v) => v + 1);
        saveCustomChords(nextChords);
      }
      const { mergeSongs } = await import('@/lib/songs');
      const { normalizeSong } = await import('@/lib/songs');
      const normalized = valid.map(normalizeSong);
      const merged = mergeSongs(songs, normalized);
      persistNow(merged);
      selectSong(normalized[0].id);
      showToast(`${normalized.length} ${normalized.length === 1 ? 'cifra importada' : 'cifras importadas'}`);
    } catch {
      showToast('Não foi possível importar o arquivo', true);
    }
  }

  async function handleOrganize() {
    if (!currentSong || currentSong.content.trim().length < 10) {
      showToast('Escreva ou cole uma cifra antes de organizar.', true);
      return;
    }
    setOrganizing(true);
    try {
      const payload = await requestAi('organize', {
        content: currentSong.content,
        key: currentSong.key,
        chords: aiCatalog,
      });
      updateSong(currentSong.id, { content: payload.content });
      persistNow(null, 'Cifra organizada e salva');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setOrganizing(false);
    }
  }

  function handleApplyAi({ content, voicings, createdChords }) {
    if (!currentSong) return;
    const check = validateAiChordsForApply(content.trim(), createdChords || [], customChords);
    if (check.error) {
      showToast(check.error, true);
      return;
    }
    const created = check.created || [];
    if (created.length) {
      const createdIds = new Set(created.map((c) => c.id));
      const createdMaps = new Set(created.map((c) => `${c.name}:${c.frets.join(',')}`));
      const nextChords = [
        ...created,
        ...customChords.filter((c) => !createdIds.has(c.id) && !createdMaps.has(`${c.name}:${c.frets.join(',')}`)),
      ];
      setCustomChords(nextChords);
      setCustomChordVersion((v) => v + 1);
      saveCustomChords(nextChords);
    }
    const usedNames = new Set(
      content.trim().split(/\s+/).join(' ').match(/\[([^\]\n]+)]/g)?.map((m) => m.slice(1, -1).replace(/\s+/g, '').toLocaleLowerCase('pt-BR')) ?? [],
    );
    updateSong(currentSong.id, {
      content: content.trim(),
      chordVoicings: (voicings || []).filter((item) =>
        usedNames.has(item.name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR'))),
    });
    persistNow(null, created.length ? `Rearmonização aplicada e ${created.length} acordes novos salvos` : 'Rearmonização aplicada');
    setAiOpen(false);
  }

  function handleSaveChords(chords) {
    const map = new Map(customChords.map((c) => [c.id, c]));
    for (const chord of chords) {
      map.set(chord.id || createId(), {
        ...chord,
        id: chord.id || createId(),
        custom: true,
        updatedAt: new Date().toISOString(),
      });
    }
    const next = [...map.values()];
    setCustomChords(next);
    setCustomChordVersion((v) => v + 1);
    saveCustomChords(next);
    setChordOpen(false);
    showToast(chords.length > 1 ? `${chords.length} acordes salvos` : 'Acorde salvo');
  }

  function handleDeleteChord(chord) {
    if (!window.confirm(`Excluir o acorde “${chord.name}”?`)) return;
    const next = customChords.filter((c) => c.id !== chord.id);
    setCustomChords(next);
    setCustomChordVersion((v) => v + 1);
    saveCustomChords(next);
    showToast('Acorde excluído');
  }

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="opacity-70">Carregando repertório…</p>
      </main>
    );
  }

  return (
    <div className={`app-shell${layout.sidebarCollapsed ? ' sidebar-collapsed' : ''}${sidebarMobileOpen ? ' mobile-open' : ''}`}>
      <div className="no-print">
        <Sidebar
          songs={songs}
          folders={folders}
          expandedFolders={expandedFolders}
          setExpandedFolders={setExpandedFolders}
          selectedId={selectedId}
          selectSong={(id) => { selectSong(id); setSidebarMobileOpen(false); }}
          filter={filter}
          setFilter={setFilter}
          onNew={() => createSong()}
          onOpenLibrary={() => setLibraryOpen(true)}
          onOpenChords={() => { setChordInitial(null); setChordOpen(true); }}
          onNewFolder={() => openFolderDialog(null)}
          onRenameFolder={(id) => openFolderDialog(id)}
          onDeleteFolder={deleteFolder}
          onDeleteSong={(id) => { if (window.confirm('Excluir esta música do repertório?')) deleteSong(id); }}
          onExport={handleExport}
          onImportFile={handleImportFile}
          layout={layout}
          onToggleSidebarCollapse={() => updateLayout({ sidebarCollapsed: !layout.sidebarCollapsed })}
        />
      </div>

      <main className="workspace">
        <header className="topbar no-print">
          <button className="icon-button menu-button" type="button" onClick={() => setSidebarMobileOpen((v) => !v)} aria-label="Abrir repertório">☰</button>
          <div className={`save-state${saveState === 'pending' ? ' pending' : ''}`}><span /> {saveState === 'pending' ? 'Salvando…' : 'Salvo localmente'}</div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema">◐</button>
            <button className="secondary-button" type="button" onClick={() => setAiOpen(true)}>✦ Rearmonizar</button>
            <button className="secondary-button" type="button" onClick={duplicateSong}>Duplicar</button>
            <button className="primary-button compact" type="button" onClick={() => persistNow(null, 'Cifra salva')}>Salvar</button>
          </div>
        </header>

        {libraryOpen ? (
          <ChordLibrary
            customChords={customChords}
            onBack={() => setLibraryOpen(false)}
            onNew={() => { setChordInitial(null); setChordOpen(true); }}
            onEdit={(chord) => { setChordInitial(chord); setChordOpen(true); }}
            onDelete={handleDeleteChord}
          />
        ) : (
          <div className={`editor-layout${layout.editorCollapsed ? ' editor-collapsed' : ''}`} ref={previewLayoutRef}>
            <div className="no-print">
              <Editor
                song={currentSong}
                folders={folders}
                transposeOffset={transposeOffset}
                onChange={(patch) => {
                  if (!currentSong) return;
                  if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
                    updateSong(currentSong.id, { ...patch, chordVoicings: [] });
                  } else {
                    updateSong(currentSong.id, patch);
                  }
                }}
                onTranspose={applyTranspose}
                onOrganize={handleOrganize}
                organizing={organizing}
                onDelete={() => { if (window.confirm('Excluir esta cifra?')) deleteSong(); }}
                onMoveFolder={(folderId) => {
                  if (!currentSong) return;
                  updateSong(currentSong.id, { folderId: folders.some((f) => f.id === folderId) ? folderId : '' });
                  showToast('Pasta da música atualizada');
                }}
                collapsed={layout.editorCollapsed}
                onToggleCollapse={() => updateLayout({ editorCollapsed: !layout.editorCollapsed })}
              />
            </div>
            <Preview
              song={currentSong}
              customChords={customChords}
              customChordVersion={customChordVersion}
              previewWidthRatio={layout.previewWidthRatio}
              onPreviewWidthChange={(previewWidthRatio) => updateLayout({ previewWidthRatio })}
            />
          </div>
        )}
      </main>

      <AiDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        song={currentSong}
        aiCatalog={aiCatalog}
        onApply={handleApplyAi}
      />

      <ChordDialog
        open={chordOpen}
        initial={chordInitial}
        onClose={() => setChordOpen(false)}
        onSave={handleSaveChords}
      />

      {folderDialog && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Pasta">
          <div className="dialog">
            <header className="dialog-header">
              <h2>{folderDialog.id ? 'Renomear pasta' : 'Nova pasta'}</h2>
              <button type="button" className="icon-button" onClick={() => setFolderDialog(null)} aria-label="Fechar">×</button>
            </header>
            <label className="dialog-label">Nome da pasta
              <input value={folderName} onChange={(e) => setFolderName(e.target.value)} maxLength={60} placeholder="Ex.: Natal, Escola, Shows" autoFocus />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setFolderDialog(null)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={saveFolder}>Salvar pasta</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.key} className={`toast visible${toast.isError ? ' error' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
