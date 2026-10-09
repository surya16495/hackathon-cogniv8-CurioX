// Match what someone said against on-screen options: "cricket and space" picks two chips.
import { normalize } from '@curiox/shared';

const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'my', 'i', 'im', 'it', 'is', 'with', 'about', 'some', 'like', 'please', 'also']);
const words = (s: string) => normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

/** Options whose words were (nearly all) said. Short names like "AI" match on their own. */
export function matchOptions(said: string, options: string[]): string[] {
  const heard = new Set(words(said));
  const flat = ` ${normalize(said)} `;
  const hits: { o: string; score: number }[] = [];
  for (const o of options) {
    const w = words(o);
    if (!w.length) continue;
    const exact = flat.includes(` ${normalize(o)} `);
    const covered = w.filter((x) => heard.has(x) || heard.has(`${x}s`) || heard.has(x.replace(/s$/, ''))).length / w.length;
    if (exact || covered >= 0.67) hits.push({ o, score: exact ? 2 : covered });
  }
  // "artificial intelligence" also says "AI".
  if (/\b(ai|a i)\b/.test(flat) && options.includes('Artificial intelligence') && !hits.some((h) => h.o === 'Artificial intelligence')) hits.push({ o: 'Artificial intelligence', score: 1 });
  return hits.sort((a, b) => b.score - a.score).map((h) => h.o);
}

/** Spoken list: "Cricket, Space and Music". */
export function sayList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
