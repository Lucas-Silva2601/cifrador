'use client';

import { useMemo } from 'react';
import { renderChordDiagram } from '@/lib/chords';

export default function ChordDiagram({ chord, customChords = [] }) {
  const html = useMemo(
    () => renderChordDiagram(chord, customChords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeof chord === 'string' ? chord : chord?.id ?? chord?.name, customChords.length],
  );
  return <div dangerouslySetInnerHTML={{ __html: html }} className="contents" />;
}
