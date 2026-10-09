import type { Source } from '@lumora/shared';

export const ROUTER_PROMPT = `You decide whether answering a learner's message needs a live web search.
Search ONLY when the answer depends on current or fast-changing information: news, recent events, prices,
releases, sports results, "latest", "today", "this year", or a specific recent fact you may not know.
Do NOT search for stable concepts (science, history, how things work, definitions, maths, advice).

Reply with JSON only: {"needsSearch": boolean, "query": string}
"query" is a concise web search query (max 12 words) that would find the answer, or "" when needsSearch is false.
Resolve pronouns using the conversation, e.g. "what about its price?" -> a query naming the product.`;

/** Instructions plus the numbered sources, appended to the chat system prompt. */
export function sourcesBlock(sources: Source[], searchAttempted: boolean): string {
  if (sources.length) {
    const list = sources.map((s) => `[${s.id}] ${s.title}\nURL: ${s.url}\n${s.snippet}`).join('\n\n');
    return `WEB SOURCES (retrieved just now):
${list}

Use these sources for any current facts. Cite them inline as [1], [2] matching the numbers above.
Only cite a number when that source actually supports the sentence. If the sources disagree or do not answer
the question, say so. Do not list the URLs at the end; the app shows source cards.`;
  }
  if (searchAttempted) {
    return 'A live web search was attempted but returned nothing usable. Answer from general knowledge, and say clearly that you could not check the latest information, so details may be out of date.';
  }
  return 'No web sources are attached. Answer from general knowledge and do not use [n] citations.';
}
