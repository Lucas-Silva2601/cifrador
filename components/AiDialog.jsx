'use client';

import { useEffect, useState } from 'react';
import { extractChords } from '@/lib/chords';
import { requestAi } from '@/lib/ai-client';

export default function AiDialog({ open, onClose, song, aiCatalog, onApply }) {
  const [style, setStyle] = useState('MPB contemporânea');
  const [intensity, setIntensity] = useState('moderada');
  const [instructions, setInstructions] = useState('');
  const [melodyGuide, setMelodyGuide] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [meta, setMeta] = useState('');
  const [pendingVoicings, setPendingVoicings] = useState([]);
  const [pendingChords, setPendingChords] = useState([]);

  useEffect(() => {
    if (!open) return;
    setResult('');
    setMeta('');
    setPendingVoicings([]);
    setPendingChords([]);
    requestAi('status')
      .then(setStatus)
      .catch(() => setStatus({ configured: false, provider: 'Ollama', model: '—' }));
  }, [open]);

  if (!open) return null;

  const used = extractChords(song?.content || '');
  const known = used.filter((name) => aiCatalog.some((c) => c.name === name));

  async function generate() {
    if (!song) return;
    setLoading(true);
    try {
      const payload = await requestAi('reharmonize', {
        content: song.content,
        title: song.title,
        artist: song.artist,
        key: song.key,
        style,
        intensity,
        instructions,
        melodyGuide,
        chords: aiCatalog,
      });
      setResult(payload.content);
      setPendingVoicings(Array.isArray(payload.voicings) ? payload.voicings : []);
      setPendingChords(Array.isArray(payload.createdChords) ? payload.createdChords : []);
      const details = [
        payload.model && `Modelo ${payload.model}`,
        payload.voicings?.length && `${payload.voicings.length} posições escolhidas`,
        payload.createdChords?.length && `${payload.createdChords.length} acordes novos auditados`,
      ].filter(Boolean);
      setMeta(details.join(' · '));
    } catch (error) {
      setMeta(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Rearmonizar com IA">
      <div className="dialog">
        <header className="dialog-header">
          <div>
            <span className="section-kicker">INTELIGÊNCIA ARTIFICIAL</span>
            <h2>Rearmonizar cifra</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <p className={`ai-status ${status?.configured ? 'ready' : 'warning'}`}>
          <span /> {status ? `${status.configured ? 'Pronto' : 'Configuração pendente'} · ${status.provider} · ${status.model}` : 'Consultando Ollama…'}
        </p>
        <p className="ai-catalog-note"><strong>{aiCatalog.length} acordes disponíveis</strong><span>{known.length} dos {used.length} acordes atuais foram encontrados no banco.</span></p>

        <div className="dialog-grid">
          <label>Estilo<input value={style} onChange={(e) => setStyle(e.target.value)} /></label>
          <label>Intensidade
            <select value={intensity} onChange={(e) => setIntensity(e.target.value)}>
              <option value="leve">Leve</option>
              <option value="moderada">Moderada</option>
              <option value="intensa">Intensa</option>
            </select>
          </label>
        </div>
        <label className="dialog-label">Orientações adicionais<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Ex.: manter o refrão simples, usar mais inversões…" /></label>
        <label className="dialog-label">Guia melódico (opcional)<textarea value={melodyGuide} onChange={(e) => setMelodyGuide(e.target.value)} rows={2} placeholder={'Ex.: em "caminho" a nota é A'} /></label>

        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Fechar</button>
          <button type="button" className="primary-button" onClick={generate} disabled={loading || !status?.configured}>
            {loading ? 'Rearmonizando…' : '✦ Gerar rearmonização'}
          </button>
        </div>

        {!!result && (
          <div className="ai-result">
            <p className="ai-result-meta">{meta}</p>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={12} spellCheck={false} />
            <div className="dialog-actions">
              <button type="button" className="primary-button" onClick={() => onApply({ content: result, voicings: pendingVoicings, createdChords: pendingChords })}>Aplicar rearmonização</button>
            </div>
          </div>
        )}
        {!result && !!meta && <p className="map-feedback error">{meta}</p>}
      </div>
    </div>
  );
}
