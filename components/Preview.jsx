'use client';

import { useMemo } from 'react';
import { extractChords, getChordLibrary, renderChordDiagram } from '@/lib/chords';
import { selectChordVoicings } from '@/lib/voicings';
import { renderSongLineHtml } from '@/lib/render-song';

export default function Preview({ song, customChords, customChordVersion }) {
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

  if (!song) return null;

  return (
    <section className="preview-column">
      <div className="song-preview" id="song-preview">
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
      <aside className="chords-used">
        <div className="chords-used-heading"><span>Diagramas</span><small>{chordCountLabel}</small></div>
        <div className="chord-grid">
          {voicings.length
            ? voicings.map((chord) => (
              <div key={chord.id || chord.name} dangerouslySetInnerHTML={{ __html: renderChordDiagram(chord, customChords) }} className="contents" />
            ))
            : <p className="empty-chords">Adicione acordes entre colchetes para ver os diagramas.</p>}
        </div>
      </aside>
    </section>
  );
}
