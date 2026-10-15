'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderChordDiagram } from '@/lib/chords';
import { describeChord, parseChordMaps } from '@/lib/chord-map';
import { requestAi } from '@/lib/ai-client';
import { createId } from '@/lib/songs';

function blankChord(name) {
  return {
    id: createId(),
    name: name || 'Novo acorde',
    frets: [-1, -1, -1, -1, -1, -1],
    fingers: [0, 0, 0, 0, 0, 0],
    barres: [],
    startFret: 1,
    custom: true,
    updatedAt: new Date().toISOString(),
  };
}

function clampFretWindow(chord) {
  const pressed = chord.frets.filter((f) => f > 0);
  const startFret = pressed.length ? Math.min(...pressed) : 1;
  return { ...chord, startFret };
}

export default function ChordDialog({ open, initial, onClose, onSave }) {
  const [name, setName] = useState('');
  const [mapText, setMapText] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState({ type: '', text: 'Digite um nome ou cole uma lista de acordes para começar.' });
  const [mode, setMode] = useState('note');
  const [startFret, setStartFret] = useState(1);
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setMapText(initial && !initial.custom ? '' : '');
    if (initial) {
      const base = { ...initial, id: initial.id || createId() };
      setDrafts([base]);
      setStartFret(base.startFret || 1);
      setFeedback({ type: 'success', text: describeChordSafe(base) });
    } else {
      setDrafts([]);
      setFeedback({ type: '', text: 'Digite um nome ou cole uma lista de acordes para começar.' });
    }
    setActiveIndex(0);
    setMode('note');
  }, [open, initial]);

  const draft = drafts[activeIndex] ?? null;

  const batchMode = drafts.length > 1;

  function describeChordSafe(chord) {
    try {
      return describeChord(chord);
    } catch {
      return 'Acorde pronto para salvar.';
    }
  }

  function reparse(nextName, nextMap, keepId = null) {
    if (!nextName.trim() && !nextMap.trim()) {
      setDrafts([]);
      setFeedback({ type: '', text: 'Digite um nome ou cole uma lista de acordes para começar.' });
      return;
    }
    if (!nextMap.trim()) {
      const base = keepId && draft ? { ...blankChord(nextName.trim() || 'Novo acorde'), id: keepId } : blankChord(nextName.trim() || 'Novo acorde');
      setDrafts([base]);
      setActiveIndex(0);
      setStartFret(1);
      setFeedback({ type: 'success', text: 'Braço vazio criado. Clique nas casas para montar o acorde.' });
      return;
    }
    try {
      const chords = parseChordMaps(nextMap, nextName);
      if (chords.length === 1 && keepId) chords[0].id = keepId;
      setDrafts(chords);
      setActiveIndex(0);
      setStartFret(chords[0].startFret || 1);
      setFeedback({
        type: 'success',
        text: chords.length > 1 ? `${chords.length} acordes reconhecidos. Confira todos antes de salvar.` : describeChordSafe(chords[0]),
      });
    } catch (error) {
      setDrafts([]);
      setFeedback({ type: 'error', text: error.message });
    }
  }

  function updateDraft(mutator) {
    setDrafts((prev) => prev.map((chord, index) => {
      if (index !== activeIndex) return chord;
      const next = mutator({ ...chord, frets: [...chord.frets], fingers: [...(chord.fingers || [0, 0, 0, 0, 0, 0])] });
      return clampFretWindow({ ...next, startFret });
    }));
  }

  function toggleCell(stringIndex, fretOffset) {
    const fret = startFret + fretOffset;
    updateDraft((chord) => {
      if (mode === 'barre') {
        const existing = (chord.barres || []).findIndex((b) => b.fret === fret);
        if (existing >= 0) {
          chord.barres = chord.barres.filter((_, i) => i !== existing);
        } else {
          chord.barres = [...(chord.barres || []), { fret, fromString: Math.min(stringIndex, 5), toString: Math.max(stringIndex, 0), finger: 1 }];
        }
        return chord;
      }
      chord.frets[stringIndex] = chord.frets[stringIndex] === fret ? -1 : fret;
      return chord;
    });
    setMapText((prev) => prev);
  }

  function toggleString(stringIndex) {
    updateDraft((chord) => {
      const current = chord.frets[stringIndex];
      chord.frets[stringIndex] = current === 0 ? -1 : 0;
      return chord;
    });
  }

  async function correctWithAi() {
    if (!mapText.trim()) return;
    setCorrecting(true);
    try {
      const payload = await requestAi('chord-map', { name: name.trim(), map: mapText });
      const entries = Array.isArray(payload.chords) ? payload.chords : [payload];
      if (entries[0]?.map) {
        setMapText(entries.map((e) => `${e.name || name}\n${e.map}`).join('\n\n'));
        reparse(name, entries.map((e) => `${e.name || name}\n${e.map}`).join('\n\n'));
        setFeedback({ type: 'success', text: 'Mapa revisado pela IA. Confira antes de salvar.' });
      }
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setCorrecting(false);
    }
  }

  const previewHtml = useMemo(
    () => (draft ? renderChordDiagram({ ...draft, startFret }, []) : ''),
    [draft, startFret],
  );

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Cadastrar acorde">
      <div className="dialog wide">
        <header className="dialog-header">
          <div>
            <span className="section-kicker">ACORDE</span>
            <h2>{initial ? 'Editar acorde' : 'Cadastrar acorde'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="dialog-grid">
          <label>Nome do acorde<input value={name} onChange={(e) => { setName(e.target.value); reparse(e.target.value, mapText, draft?.id); }} placeholder="Ex.: C, Am7, F#m" /></label>
          <label>Posição inicial (casa)
            <input type="number" min="1" max="20" value={startFret} onChange={(e) => {
              const next = Math.min(20, Math.max(1, Number(e.target.value) || 1));
              setStartFret(next);
              updateDraft((chord) => ({ ...chord, startFret: next }));
            }} />
          </label>
        </div>

        <label className="dialog-label">Mapa textual (opcional)
          <textarea
            value={mapText}
            onChange={(e) => { setMapText(e.target.value); reparse(name, e.target.value, draft?.id); }}
            rows={5}
            spellCheck={false}
            placeholder={'Ex.:\nE  A  D  G  B  e\nX  3  5  5  5  3\nou X-3-5-5-5-3'}
          />
        </label>

        <p className={`map-feedback ${feedback.type}`}>{feedback.text}</p>

        {batchMode && (
          <div className="batch-chord-grid">
            {drafts.map((chord, index) => (
              <button key={chord.id || index} type="button" className={`batch-chord-preview${index === activeIndex ? ' active' : ''}`} onClick={() => { setActiveIndex(index); setStartFret(chord.startFret || 1); }}>
                <strong>{chord.name}</strong>
                <code>{chord.frets.map((f) => (f < 0 ? 'X' : f)).join('-')}</code>
              </button>
            ))}
          </div>
        )}

        {draft && (
          <>
            <p className="map-edit-hint">O braço abaixo é editável: clique nas casas. No topo, alterne corda solta/abafada. Use o modo Pestana para marcar pestanas.</p>
            <div className="neck-toolbar">
              <button type="button" className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')}>Notas</button>
              <button type="button" className={mode === 'barre' ? 'active' : ''} onClick={() => setMode('barre')}>Pestana</button>
            </div>
            <div className="interactive-neck">
              <div className="neck-strings">
                {draft.frets.map((fret, stringIndex) => (
                  <button
                    key={stringIndex}
                    type="button"
                    className={`string-toggle ${fret === 0 ? 'open' : fret === -1 ? 'muted' : 'fretted'}`}
                    onClick={() => toggleString(stringIndex)}
                    title="Alternar corda solta/abafada"
                  >
                    {fret === 0 ? '○' : fret === -1 ? '×' : fret}
                  </button>
                ))}
              </div>
              <div className="neck-grid">
                {[0, 1, 2, 3, 4].map((offset) => (
                  <div key={offset} className="neck-row">
                    <span className="neck-fret-label">{startFret + offset}ª</span>
                    {draft.frets.map((fret, stringIndex) => (
                      <button
                        key={stringIndex}
                        type="button"
                        className={`neck-cell ${fret === startFret + offset ? 'active' : ''}`}
                        onClick={() => toggleCell(stringIndex, offset)}
                        aria-label={`Corda ${6 - stringIndex}, casa ${startFret + offset}`}
                      >
                        {fret === startFret + offset ? '●' : ''}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="chord-map-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <label className="dialog-label">Casas (6ª → 1ª corda, -1 = X, 0 = solta)
              <input
                value={draft.frets.join(' ')}
                onChange={(e) => {
                  const parts = e.target.value.trim().split(/[\s-]+/).map((p) => (p.toUpperCase() === 'X' ? -1 : Number(p)));
                  if (parts.length === 6 && parts.every((n) => Number.isInteger(n) && n >= -1 && n <= 24)) {
                    updateDraft((chord) => ({ ...chord, frets: parts }));
                  }
                }}
              />
            </label>
          </>
        )}

        <div className="dialog-actions">
          {mapText.trim() && (
            <button type="button" className="secondary-button" onClick={correctWithAi} disabled={correcting}>
              {correcting ? 'Revisando…' : '✦ Revisar mapa com IA'}
            </button>
          )}
          <span className="dialog-spacer" />
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-button"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              const finalName = name.trim() || draft.name;
              if (batchMode) onSave(drafts.map((d) => ({ ...d, name: d.name || finalName })));
              else onSave([{ ...draft, name: finalName, startFret }]);
            }}
          >
            {batchMode ? `Salvar ${drafts.length} acordes` : 'Salvar acorde'}
          </button>
        </div>
      </div>
    </div>
  );
}
