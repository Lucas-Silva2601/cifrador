'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractChords, getChordLibrary, renderChordDiagram } from '@/lib/chords';
import { selectChordVoicings } from '@/lib/voicings';
import { renderSongLineHtml } from '@/lib/render-song';

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.85;

function clampRatio(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export default function Preview({ song, customChords, customChordVersion, previewWidthRatio, onPreviewWidthChange }) {
  const { headerMeta, bodyHtml, voicings, chordCountLabel } = useMemo(() => {
    if (!song) return { headerMeta: [], bodyHtml: '', voicings: [], chordCountLabel: '0 acordes' };
    const metadata = [
      song.key && `Tom ${song.key}`,
      song.capo > 0 && `Capo ${song.capo}ª casa`,
      song.bpm && `${song.bpm} BPM`,
    ].filter(Boolean);
    const body = song.content.trim()
      ? song.content.split('\n').map(renderSongLineHtml).join('')
      : '<p class="empty-preview">Sua cifra aparecerá aqui enquanto você escreve.</p>';
    const chords = extractChords(song.content);
    const library = getChordLibrary(customChords);
    const selected = selectChordVoicings(song.content || chords, library, song.chordVoicings || []);
    return {
      headerMeta: metadata,
      bodyHtml: body,
      voicings: selected,
      chordCountLabel: chords.length ? `${selected.length} ${selected.length === 1 ? 'acorde escolhido' : 'acordes escolhidos'}` : '0 acordes',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, song?.title, song?.artist, song?.key, song?.capo, song?.bpm, song?.content, customChords, customChordVersion]);

  const layoutRef = useRef(null);
  const dragState = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [liveRatio, setLiveRatio] = useState(null);

  const ratio = liveRatio ?? (Number.isFinite(previewWidthRatio) ? previewWidthRatio : null);

  const stopDrag = useCallback(() => {
    if (!dragState.current) return;
    const finalRatio = dragState.current.ratio;
    dragState.current = null;
    setDragging(false);
    setLiveRatio(null);
    if (finalRatio != null) onPreviewWidthChange?.(clampRatio(finalRatio));
  }, [onPreviewWidthChange]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event) => {
      const state = dragState.current;
      const container = layoutRef.current;
      if (!state || !container) return;
      const rect = container.getBoundingClientRect();
      const pointerX = event.touches?.[0]?.clientX ?? event.clientX;
      if (!Number.isFinite(pointerX) || rect.width <= 0) return;
      const next = clampRatio((pointerX - rect.left - state.grabOffset) / rect.width);
      if (next == null) return;
      state.ratio = next;
      setLiveRatio(next);
    };
    const handleUp = () => stopDrag();
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, stopDrag]);

  const startDrag = useCallback((event) => {
    const container = layoutRef.current;
    if (!container) return;
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const songEl = container.querySelector('.song-preview');
    const songWidth = songEl ? songEl.getBoundingClientRect().width : rect.width * (ratio ?? 0.7);
    const pointerX = event.clientX;
    dragState.current = {
      grabOffset: Number.isFinite(pointerX) ? pointerX - rect.left - songWidth : 9,
      ratio: ratio ?? songWidth / Math.max(1, rect.width),
    };
    setDragging(true);
    event.target.setPointerCapture?.(event.pointerId);
  }, [ratio]);

  if (!song) return null;

  return (
    <section className="preview-panel">
      <div className="preview-content-layout" ref={layoutRef}>
        <div
          className="song-preview"
          id="song-preview"
          style={ratio != null ? { '--song-preview-width': `${(ratio * 100).toFixed(2)}%` } : undefined}
        >
          <header>
            <p className="preview-eyebrow">CIFRA</p>
            <h1>{song.title || 'Sem título'}</h1>
            <p className="preview-artist">{song.artist || 'Artista não informado'}</p>
            {!!headerMeta.length && (
              <div className="preview-meta">{headerMeta.map((item) => <span key={item}>{item}</span>)}</div>
            )}
          </header>
          <div className="formatted-song" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </div>
        <button
          type="button"
          className={`preview-resizer no-print${dragging ? ' dragging' : ''}`}
          aria-label="Redimensionar folha e diagramas"
          title="Arraste para redimensionar (duplo clique restaura)"
          onPointerDown={startDrag}
          onDoubleClick={() => onPreviewWidthChange?.(null)}
        >
          <span aria-hidden="true">⋮</span>
        </button>
        <aside className="chords-used">
          <div className="chords-heading"><h2>Diagramas</h2><span>{chordCountLabel}</span></div>
          <div className="chord-grid">
            {voicings.length
              ? voicings.map((chord, index) => {
                const key = typeof chord === 'string'
                  ? `unknown-${chord}-${index}`
                  : `${chord.id || chord.name}-${index}`;
                return (
                  <div key={key} dangerouslySetInnerHTML={{ __html: renderChordDiagram(chord, customChords) }} className="contents" />
                );
              })
              : <p className="empty-chords">Adicione acordes entre colchetes para ver os diagramas.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
