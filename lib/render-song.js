import { escapeHtml } from './chords.js';

export function renderSongLineHtml(line) {
  if (!line.trim()) return '<div class="song-spacer" aria-hidden="true"></div>';
  const displayLine = line.trimStart();
  if (/^#/.test(displayLine)) {
    return `<h3 class="song-section">${escapeHtml(displayLine.replace(/^#+\s*/, ''))}</h3>`;
  }
  const chordPattern = /\[([^\]\n]+)]/g;
  const matches = [...displayLine.matchAll(chordPattern)];
  if (matches.length === 0) return `<div class="lyric-line">${escapeHtml(displayLine)}</div>`;
  const onlyChords = displayLine.replace(chordPattern, '').trim() === '';
  const lead = displayLine.slice(0, matches[0].index);
  const pairEntries = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? displayLine.length;
    const lyric = displayLine.slice(start, end);
    return {
      hasLyric: Boolean(lyric.trim()),
      html: `<span class="chord-pair${lyric.trim() ? '' : ' chord-pair--transition'}"><b>${escapeHtml(match[1])}</b><span>${escapeHtml(lyric) || '&nbsp;'}</span></span>`,
    };
  });

  let pairs;
  if (onlyChords) {
    pairs = pairEntries.map((entry) => entry.html).join('');
  } else {
    const phrases = [];
    let preparation = '';
    for (const entry of pairEntries) {
      if (!entry.hasLyric) {
        preparation += entry.html;
        continue;
      }
      phrases.push(`<span class="chord-phrase">${preparation}${entry.html}</span>`);
      preparation = '';
    }
    if (preparation) phrases.push(`<span class="chord-phrase">${preparation}</span>`);
    pairs = phrases.join('');
  }
  return `<div class="song-line${onlyChords ? ' instrumental-line' : ''}">${lead ? `<span class="lyric-lead">${escapeHtml(lead)}</span>` : ''}${pairs}</div>`;
}
