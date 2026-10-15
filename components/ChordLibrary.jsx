'use client';

import { useMemo, useState } from 'react';
import { classifyChord, getChordLibrary, renderChordDiagram } from '@/lib/chords';

const CATEGORIES = ['Todos', 'Maiores', 'Menores', 'Com sétima', 'Sétimas maiores', 'Menores com sétima', 'Com sexta', 'Adicionados', 'Quartas suspensas', 'Segundas suspensas', 'Diminutos', 'Aumentados', 'Outros'];

export default function ChordLibrary({ customChords, onBack, onNew, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');

  const library = useMemo(() => getChordLibrary(customChords), [customChords]);

  const filtered = useMemo(() => library.filter((chord) => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    if (q && !chord.name.toLocaleLowerCase('pt-BR').includes(q)) return false;
    if (category !== 'Todos' && classifyChord(chord) !== category) return false;
    return true;
  }), [library, search, category]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const chord of filtered) {
      const cat = classifyChord(chord);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(chord);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [filtered]);

  return (
    <section className="chord-library-view">
      <header className="library-hero">
        <div>
          <span className="section-kicker">BANCO DE ACORDES</span>
          <h1>Biblioteca de acordes</h1>
          <p>Explore por classificação ou clique em qualquer braço para editar a posição.</p>
        </div>
        <div className="library-hero-actions">
          <button className="quiet-button" type="button" onClick={onBack}>← Voltar às cifras</button>
          <button className="primary-button" type="button" onClick={onNew}>＋ Novo acorde</button>
        </div>
      </header>
      <div className="library-tools">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Buscar acorde (ex.: Am7, F#m)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="category-filters">
          {CATEGORIES.map((cat) => (
            <button key={cat} type="button" className={cat === category ? 'active' : ''} onClick={() => setCategory(cat)}>{cat}</button>
          ))}
        </div>
        <p className="library-summary">{filtered.length} de {library.length} acordes</p>
      </div>
      {grouped.map(([cat, chords]) => (
        <section key={cat} className="library-section">
          <h2>{cat} <small>{chords.length}</small></h2>
          <div className="chord-library-grid">
            {chords.map((chord) => (
              <div key={chord.id || chord.name} className="library-chord-card">
                <div dangerouslySetInnerHTML={{ __html: renderChordDiagram(chord, customChords) }} className="contents" />
                <div className="library-chord-actions">
                  {chord.source === 'Personalizado' && (
                    <>
                      <button type="button" onClick={() => onEdit(chord)}>Editar</button>
                      <button type="button" className="danger-link" onClick={() => onDelete(chord)}>Excluir</button>
                    </>
                  )}
                  {chord.source !== 'Personalizado' && (
                    <button type="button" onClick={() => onEdit(chord)}>Ver / variar</button>
                  )}
                </div>
                {chord.variant && <small className="chord-variant">{chord.variant}</small>}
              </div>
            ))}
          </div>
        </section>
      ))}
      {!filtered.length && <p className="empty-list">Nenhum acorde encontrado.</p>}
    </section>
  );
}
