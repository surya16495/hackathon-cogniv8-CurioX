// One chat turn, as described in the architecture plan:
// load profile + last 10 messages -> route -> (search) -> build prompt -> stream with fallback -> save.
import {
  LIMITS,
  learnActionLabel,
  type ChatMessage,
  type ChatRequest,
  type Provider,
  type SseEvent,
  type Source,
} from '@curiox/shared';
import { Conversation, Message, toChatMessage, type ConversationDoc, type MessageDoc, type UserDoc } from '../../db/models';
import { ACTION_INSTRUCTIONS } from '../../prompts/actions';
import { CURIOX_PERSONA, profileSummary } from '../../prompts/persona';
import { sourcesBlock } from '../../prompts/research';
import { badRequest, notFound } from '../../utils/errors';
import { truncate } from '../../utils/async';
import { demoAnswer } from '../llm/demo';
import type { LlmMessage, LlmService } from '../llm';
import type { SearchService } from '../search';
import { userProfile } from '../onboarding/steps';
import { routeMessage } from './router';

export interface ChatServices {
  llm: LlmService;
  search: SearchService;
}

export type Emit = (event: SseEvent) => void;

export interface PreparedChat {
  user: UserDoc;
  conversation: ConversationDoc;
  isNewConversation: boolean;
  history: MessageDoc[];
  request: ChatRequest;
}

export interface ChatResult {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage | null;
  provider: Provider;
  aborted: boolean;
}

/**
 * Everything that can fail with a plain HTTP error happens here,
 * before the route switches the response to an SSE stream.
 */
export async function prepareChat(user: UserDoc, request: ChatRequest): Promise<PreparedChat> {
  let conversation: ConversationDoc | null = null;
  let isNew = false;

  if (request.conversationId) {
    conversation = await Conversation.findOne({ _id: request.conversationId, userId: user._id });
    // Same 404 for "missing" and "someone else's", so IDs cannot be probed.
    if (!conversation) throw notFound('Conversation not found');
  } else {
    const title = request.message ? truncate(request.message.replace(/\s+/g, ' '), 60) : learnActionLabel(request.action!);
    conversation = await Conversation.create({ userId: user._id, title });
    isNew = true;
  }

  const history = isNew
    ? []
    : (await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(LIMITS.historyMessages)).reverse();

  if (request.action && !request.message && !history.some((m) => m.role === 'assistant')) {
    if (isNew) await Conversation.deleteOne({ _id: conversation._id });
    throw badRequest('There is no earlier answer to apply this action to. Ask a question first.');
  }

  return { user, conversation, isNewConversation: isNew, history, request };
}

function buildSystemPrompt(opts: {
  profile: ReturnType<typeof userProfile>;
  sources: Source[];
  searchAttempted: boolean;
  action?: ChatRequest['action'];
}): string {
  const parts = [
    CURIOX_PERSONA,
    `LEARNER PROFILE:\n${profileSummary(opts.profile)}`,
    sourcesBlock(opts.sources, opts.searchAttempted),
  ];
  if (opts.action) parts.push(ACTION_INSTRUCTIONS[opts.action]);
  return parts.join('\n\n');
}

export async function runChat(
  prepared: PreparedChat,
  services: ChatServices,
  emit: Emit,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const { user, conversation, history, request } = prepared;
  const conversationId = conversation._id.toString();
  const profile = userProfile(user);
  const action = request.action ?? null;
  const message = request.message?.trim() ?? '';

  // Save the question first so it survives a failed or abandoned answer.
  const userDoc = await Message.create({
    conversationId: conversation._id,
    role: 'user',
    content: message || `[${learnActionLabel(action!)}]`,
    action,
  });

  emit({ event: 'status', data: { stage: 'thinking', message: 'Thinking…', conversationId } });

  const historyTurns: LlmMessage[] = history.map((m) => ({ role: m.role, content: m.content ?? '' }));

  // ---- Route and search ----
  let sources: Source[] = [];
  let searchAttempted = false;
  if (message) {
    const decision = await routeMessage(message, historyTurns, services.llm, {
      searchAvailable: services.search.available(),
      signal,
    });
    if (decision.needsSearch) {
      searchAttempted = true;
      emit({ event: 'status', data: { stage: 'searching', message: `Searching the web for “${truncate(decision.query, 80)}”…` } });
      const outcome = await services.search.search(decision.query);
      sources = outcome.sources;
    }
  } else if (action) {
    // An action on the previous answer keeps that answer's sources in play.
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
    sources = (lastAssistant?.sources ?? []).map((s) => ({ id: s.id, title: s.title ?? '', url: s.url, snippet: s.snippet ?? '' }));
  }
  if (sources.length) emit({ event: 'sources', data: { sources } });

  // ---- Prompt ----
  const currentTurn: LlmMessage = {
    role: 'user',
    content: message || `Apply the "${learnActionLabel(action!)}" learn action to your previous answer.`,
  };
  const build = (provider: Provider) => {
    // Groq's free tier allows 8,000 tokens a minute, so it gets a trimmed prompt.
    const lean = provider === 'groq';
    return {
      system: buildSystemPrompt({ profile, sources: lean ? sources.slice(0, 3) : sources, searchAttempted, action: request.action }),
      messages: [...(lean ? historyTurns.slice(-4) : historyTurns), currentTurn],
      tier: 'main' as const,
      temperature: action === 'challenge_me' ? 0.9 : 0.7,
    };
  };

  emit({ event: 'status', data: { stage: 'writing', message: 'Writing…' } });

  // ---- Stream ----
  let text = '';
  let provider: Provider = 'demo';
  let aborted = false;
  try {
    const result = await services.llm.streamAnswer({
      build,
      demo: () => demoAnswer({ question: message || conversation.title || 'this topic', action, profile, sources }),
      onToken: (t) => {
        text += t;
        emit({ event: 'token', data: { text: t } });
      },
      onSwitch: (next, reset) => {
        if (reset) text = '';
        emit({
          event: 'status',
          data: { stage: 'retrying', message: next === 'demo' ? 'Switching to a demo answer…' : `Retrying with ${next}…`, provider: next, reset },
        });
      },
      signal,
    });
    text = result.text;
    provider = result.provider;
  } catch (err) {
    if (!signal?.aborted) throw err;
    aborted = true;
  }

  // ---- Save ----
  let assistantDoc: MessageDoc | null = null;
  if (text.trim()) {
    assistantDoc = await Message.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: aborted ? `${text.trimEnd()} …` : text,
      sources,
      action,
      provider,
    });
  }
  await Conversation.updateOne({ _id: conversation._id }, { $set: { updatedAt: new Date() } });

  if (!aborted && assistantDoc) {
    emit({
      event: 'done',
      data: { conversationId, messageId: assistantDoc._id.toString(), provider, demo: provider === 'demo' },
    });
  }

  return {
    conversationId,
    userMessage: toChatMessage(userDoc),
    assistantMessage: assistantDoc ? toChatMessage(assistantDoc) : null,
    provider,
    aborted,
  };
}
