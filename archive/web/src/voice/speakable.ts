// Turn a Markdown answer into something pleasant to hear.

const DEMO_LABEL = /^_Demo answer:[^\n]*_\s*/;

export function toSpeech(markdown: string, maxChars = 1200): string {
  let t = markdown
    .replace(DEMO_LABEL, 'This is a demo answer. ')
    .replace(/```[\s\S]*?```/g, ' (code example on screen) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:|cite:)[^)]*\)/g, '$1')
    .replace(/\s?\[\d{1,2}\](?!\()/g, '') // citation markers
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^#{1,6}\s+(.*)$/gm, '$1.')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*(\d+)\.\s+/gm, '$1. ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\|/g, ', ')
    .replace(/[—–]/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s*\.\s*(\.\s*)+/g, '. ')
    .replace(/([!?:])\./g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = `${(end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut).trim()} The rest is on your screen.`;
  }
  return t;
}

/** Split into sentence-sized chunks: Chrome stops reading utterances longer than about 15 seconds. */
export function chunkForSpeech(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((current + ' ' + piece).trim().length <= max) {
      current = (current + ' ' + piece).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (piece.length <= max) {
      current = piece;
    } else {
      // A very long sentence: break on commas, then on spaces.
      let rest = piece;
      while (rest.length > max) {
        let at = rest.lastIndexOf(', ', max);
        if (at < max * 0.4) at = rest.lastIndexOf(' ', max);
        if (at <= 0) at = max;
        chunks.push(rest.slice(0, at + 1).trim());
        rest = rest.slice(at + 1).trim();
      }
      current = rest;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** "A: first option. B: second option." */
export function speakOptions(options: string[]): string {
  return options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o.replace(/[.?!]+$/, '')}.`).join(' ');
}
