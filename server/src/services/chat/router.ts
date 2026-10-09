// Decide whether a message needs live search. One small Flash-Lite JSON call,
// with a keyword heuristic when no model is available.
import { z } from 'zod';
import { ROUTER_PROMPT } from '../../prompts/research';
import type { LlmMessage, LlmService } from '../llm';

export interface RouteDecision {
  needsSearch: boolean;
  query: string;
}

const decisionSchema = z.object({
  needsSearch: z.boolean(),
  query: z.string().default(''),
});

const CURRENT_INFO =
  /\b(latest|newest|recent(ly)?|today|tonight|yesterday|this (week|month|year)|right now|currently|news|update[sd]?|announce[ds]?|released?|launch(ed)?|price|stock|score|winner|won|election|weather|20[2-9]\d)\b/i;

export function heuristicRoute(message: string): RouteDecision {
  const needsSearch = CURRENT_INFO.test(message);
  return { needsSearch, query: needsSearch ? message.trim().slice(0, 200) : '' };
}

export async function routeMessage(
  message: string,
  history: LlmMessage[],
  llm: LlmService,
  opts: { searchAvailable: boolean; signal?: AbortSignal },
): Promise<RouteDecision> {
  if (!opts.searchAvailable || !message.trim()) return { needsSearch: false, query: '' };
  if (llm.demoMode) return heuristicRoute(message);

  const recent = history.slice(-4).map((m) => `${m.role === 'user' ? 'Learner' : 'CurioX'}: ${m.content.slice(0, 300)}`);
  const { data } = await llm.completeJson(
    {
      system: ROUTER_PROMPT,
      messages: [{ role: 'user', content: `Conversation:\n${recent.join('\n') || '(none)'}\n\nNew message: ${message}` }],
      temperature: 0,
      maxOutputTokens: 200,
      // Runs before every answer: if the model is slow, the keyword heuristic decides instead.
      timeoutMs: 4000,
      attempts: 1,
      signal: opts.signal,
    },
    decisionSchema,
    () => heuristicRoute(message),
  );
  const query = (data.query ?? '').trim().slice(0, 200);
  // A "yes" with no query still searches, using the message itself.
  return data.needsSearch ? { needsSearch: true, query: query || message.trim().slice(0, 200) } : { needsSearch: false, query: '' };
}
