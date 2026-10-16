'use client';

export default function Editor({
  song, folders, transposeOffset,
  onChange, onTranspose, onOrganize, organizing,
  onDelete, onMoveFolder, collapsed, onToggleCollapse,
}) {
  if (!song) return null;
  return (
    <section className="editor-panel">
      <div className="editor-panel-heading">
        <span className="section-kicker">Editar cifra</span>
        <button
          type="button"
          className="panel-collapse-button editor-collapse-button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir editor' : 'Recolher editor'}
          title={collapsed ? 'Expandir editor' : 'Recolher editor'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="editor-grid">
            <label>Título<input value={song.title} onChange={(e) => onChange({ title: e.target.value.slice(0, 100) })} placeholder="Nome da música" /></label>
            <label>Artista<input value={song.artist || ''} onChange={(e) => onChange({ artist: e.target.value.slice(0, 100) })} placeholder="Quem canta?" /></label>
            <label>Pasta da música
              <select value={folders.some((f) => f.id === song.folderId) ? song.folderId : ''} onChange={(e) => onMoveFolder(e.target.value)}>
                <option value="">Sem pasta</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label>Tom<input value={song.key || ''} onChange={(e) => onChange({ key: e.target.value.slice(0, 8) })} placeholder="C" /></label>
            <label>Capotraste<input type="number" min="0" max="12" value={song.capo ?? 0} onChange={(e) => onChange({ capo: e.target.value })} /></label>
            <label>BPM<input type="number" min="20" max="300" value={song.bpm ?? ''} onChange={(e) => onChange({ bpm: e.target.value })} placeholder="92" /></label>
          </div>

          <button type="button" className={`organize-cifra-button${organizing ? ' loading' : ''}`} onClick={onOrganize} disabled={organizing}>
            {organizing
              ? <span><strong>Organizando a cifra…</strong><small>A IA está separando seções, letra e acordes</small></span>
              : <><span className="organize-cifra-icon" aria-hidden="true">✦</span><span><strong>Organizar cifra com IA</strong><small>Padroniza seções, letra e acordes para a rearmonização</small></span></>}
          </button>

          <div className="transpose-row">
            <span>Transpor</span>
            <button type="button" onClick={() => onTranspose(-1)} aria-label="Diminuir meio tom">−</button>
            <strong>{transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset}</strong>
            <button type="button" onClick={() => onTranspose(1)} aria-label="Aumentar meio tom">＋</button>
          </div>

          <label className="content-label">Conteúdo da cifra
            <textarea
              value={song.content}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={16}
              placeholder={'# Verso\n[C]Comece a escrever sua [G]cifra aqui…'}
              spellCheck={false}
            />
          </label>

          <div className="editor-actions no-print">
            <button type="button" className="danger-button" onClick={onDelete}>Excluir cifra</button>
          </div>
        </>
      )}
    </section>
  );
}
