'use client';

import { useMemo, useRef } from 'react';
import { isValidSong, isValidSongFolder } from '@/lib/storage';
import { createId, mergeSongs, normalizeSong } from '@/lib/songs';

export default function Sidebar({
  songs, folders, expandedFolders, setExpandedFolders,
  selectedId, selectSong, filter, setFilter,
  onNew, onOpenLibrary, onOpenChords, onNewFolder, onRenameFolder, onDeleteFolder, onDeleteSong,
  onExport, onImportFile, layout, onToggleSidebarCollapse,
}) {
  const importRef = useRef(null);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const normalizedFilter = filter.toLocaleLowerCase('pt-BR');

  const filtered = useMemo(() => songs.filter((song) => {
    const folderName = folderById.get(song.folderId)?.name || '';
    return `${song.title} ${song.artist || ''} ${folderName}`.toLocaleLowerCase('pt-BR').includes(normalizedFilter);
  }), [songs, folderById, normalizedFilter]);

  return (
    <aside className={`sidebar${layout.sidebarCollapsed ? ' collapsed' : ''}`} id="sidebar">
      <button
        className="panel-collapse-button sidebar-collapse-button"
        type="button"
        onClick={onToggleSidebarCollapse}
        aria-expanded={!layout.sidebarCollapsed}
        title={layout.sidebarCollapsed ? 'Expandir repertório' : 'Recolher repertório'}
      >
        {layout.sidebarCollapsed ? '›' : '‹'}
      </button>

      <div className="brand-row">
        <span className="brand" aria-label="Cifrador — início">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span><strong>Cifrador</strong><small>Seu repertório, no seu tom</small></span>
        </span>
      </div>

      <button className="primary-button new-song-button" type="button" onClick={onNew}>
        <span aria-hidden="true">＋</span> Nova cifra
      </button>
      <button className="library-button" type="button" onClick={onOpenLibrary}>
        <span aria-hidden="true">♯</span>
        <span><strong>Biblioteca de acordes</strong><small>Diagramas e classificações</small></span>
      </button>

      <label className="search-field">
        <span className="sr-only">Buscar no repertório</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="Buscar no repertório"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLocaleLowerCase('pt-BR'))}
        />
      </label>

      <div className="library-heading">
        <span>Repertório</span>
        <div>
          <button className="new-folder-button" type="button" onClick={() => onNewFolder()} title="Criar pasta">＋ Pasta</button>
          <span className="song-count">{filter ? `${filtered.length}/${songs.length}` : songs.length}</span>
        </div>
      </div>

      <nav className="song-list" aria-label="Repertório">
        {folders.map((folder) => {
          const folderSongs = filtered.filter((s) => s.folderId === folder.id);
          const folderMatches = folder.name.toLocaleLowerCase('pt-BR').includes(normalizedFilter);
          if (filter && !folderSongs.length && !folderMatches) return null;
          const expanded = Boolean(filter) || expandedFolders.has(folder.id);
          return (
            <section key={folder.id} className={`song-folder-group ${expanded ? 'expanded' : ''}`}>
              <div className="song-folder-header">
                <button
                  className="song-folder-toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    const next = new Set(expandedFolders);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    setExpandedFolders(next);
                  }}
                >
                  <span className="folder-chevron" aria-hidden="true">›</span>
                  <span className="folder-icon" aria-hidden="true">▰</span>
                  <strong>{folder.name}</strong><small>{folderSongs.length}</small>
                </button>
                <div className="song-folder-actions">
                  <button type="button" aria-label={`Renomear pasta ${folder.name}`} title="Renomear" onClick={() => onRenameFolder(folder.id)}>✎</button>
                  <button type="button" aria-label={`Excluir pasta ${folder.name}`} title="Excluir" onClick={() => onDeleteFolder(folder.id)}>×</button>
                </div>
              </div>
              {expanded && (
                <div className="song-folder-contents">
                  {folderSongs.length ? folderSongs.map((song) => (
                    <SongRow key={song.id} song={song} active={song.id === selectedId} onSelect={selectSong} onDelete={onDeleteSong} />
                  )) : <div className="empty-folder">Pasta vazia</div>}
                </div>
              )}
            </section>
          );
        })}
        {(() => {
          const unfiled = filtered.filter((s) => !s.folderId || !folderById.has(s.folderId));
          if (!unfiled.length) return null;
          return (
            <section className="song-folder-group unfiled expanded">
              <div className="song-folder-header static">
                <span className="folder-icon" aria-hidden="true">□</span><strong>Sem pasta</strong><small>{unfiled.length}</small>
              </div>
              <div className="song-folder-contents">
                {unfiled.map((song) => (
                  <SongRow key={song.id} song={song} active={song.id === selectedId} onSelect={selectSong} onDelete={onDeleteSong} />
                ))}
              </div>
            </section>
          );
        })()}
        {!filtered.length && <div className="empty-list">Nenhuma cifra encontrada.</div>}
      </nav>

      <div className="sidebar-footer no-print">
        <button className="quiet-button manage-chords-button" type="button" onClick={onOpenChords}>＋ Cadastrar acorde</button>
        <button className="quiet-button" type="button" onClick={() => importRef.current?.click()}>Importar</button>
        <button className="quiet-button" type="button" onClick={onExport}>Exportar</button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
      </div>
    </aside>
  );
}

function SongRow({ song, active, onSelect, onDelete }) {
  return (
    <div className={`song-list-row ${active ? 'active' : ''}`}>
      <button className={`song-list-item ${active ? 'active' : ''}`} type="button" onClick={() => onSelect(song.id)}>
        <span className="song-initial">{(song.title.trim()[0] || 'C').toUpperCase()}</span>
        <span><strong>{song.title || 'Sem título'}</strong><small>{song.artist || 'Artista não informado'}</small></span>
        <em>{song.key || '—'}</em>
      </button>
      <button className="song-delete-button" type="button" aria-label={`Excluir música ${song.title || 'Sem título'}`} title="Excluir música" onClick={() => onDelete(song.id)}>×</button>
    </div>
  );
}
