// Chat state: messages, streaming, learn actions, quizzes and history reload.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatStage, LearnActionId, Provider, QuizResponse, SseEvent, Source } from '@curiox/shared';
import { ApiError, api, streamChat } from '../api/client';
import { KEYS, storage } from '../lib/storage';

export interface UiMessage {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  action: LearnActionId | null;
  provider: Provider | null;
  streaming?: boolean;
  stopped?: boolean;
  error?: string;
}

export interface QuizItem {
  kind: 'quiz';
  id: string;
  status: 'loading' | 'ready' | 'error';
  quiz?: QuizResponse;
  error?: string;
  /** question index -> chosen option index */
  answers: Record<number, number>;
  ended?: boolean;
}

export type ChatItem = UiMessage | QuizItem;

export interface ChatStatus {
  stage: ChatStage;
  message: string;
}

interface SendInput {
  message?: string;
  action?: LearnActionId;
}

const CONVERSATION_KEY = KEYS.conversationId;
let localId = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++localId}`;

function fromServer(m: ChatMessage): UiMessage {
  return { kind: 'message', id: m.id, role: m.role, content: m.content, sources: m.sources, action: m.action, provider: m.provider };
}

export function useChatStream() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => storage.get(CONVERSATION_KEY));
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(conversationId));
  const controllerRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<SendInput | null>(null);

  // Typewriter: the server text goes into `target`; the visible text catches up each animation frame.
  // Gemini sends a few big chunks, so without this answers would appear in jumps.
  const typing = useRef<{ id: string; target: string; shown: number; finished: boolean; raf: number | null }>({
    id: '',
    target: '',
    shown: 0,
    finished: false,
    raf: null,
  });

  const patchMessage = useCallback((id: string, patch: Partial<UiMessage>) => {
    setItems((list) => list.map((it) => (it.kind === 'message' && it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const tick = useCallback(() => {
    const t = typing.current;
    const remaining = t.target.length - t.shown;
    if (remaining > 0) {
      t.shown += Math.max(2, Math.ceil(remaining / 18));
      patchMessage(t.id, { content: t.target.slice(0, t.shown) });
    }
    if (t.shown < t.target.length || !t.finished) {
      t.raf = requestAnimationFrame(tick);
    } else {
      t.raf = null;
      patchMessage(t.id, { content: t.target, streaming: false });
    }
  }, [patchMessage]);

  const startTyping = useCallback(
    (id: string) => {
      const t = typing.current;
      if (t.raf !== null) cancelAnimationFrame(t.raf);
      typing.current = { id, target: '', shown: 0, finished: false, raf: requestAnimationFrame(tick) };
    },
    [tick],
  );

  useEffect(() => () => {
    if (typing.current.raf !== null) cancelAnimationFrame(typing.current.raf);
    controllerRef.current?.abort();
  }, []);

  // Reload the last conversation after a refresh.
  useEffect(() => {
    if (!conversationId || items.length) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    api
      .messages(conversationId)
      .then((res) => !cancelled && setItems(res.messages.map(fromServer)))
      .catch((err) => {
        // Deleted, cleared, or from another device: start fresh.
        if (!cancelled && err instanceof ApiError && err.status === 404) {
          storage.remove(CONVERSATION_KEY);
          setConversationId(null);
        }
      })
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => {
      cancelled = true;
    };
    // Only on first mount; later conversation changes come from our own sends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberConversation = useCallback((id: string) => {
    setConversationId(id);
    storage.set(CONVERSATION_KEY, id);
  }, []);

  const send = useCallback(
    async (input: SendInput) => {
      const message = input.message?.trim();
      if ((!message && !input.action) || controllerRef.current) return;
      lastSendRef.current = input;

      const userItem: UiMessage = {
        kind: 'message',
        id: nextId('u'),
        role: 'user',
        content: message || '',
        sources: [],
        action: input.action ?? null,
        provider: null,
      };
      const assistantId = nextId('a');
      const assistantItem: UiMessage = { kind: 'message', id: assistantId, role: 'assistant', content: '', sources: [], action: input.action ?? null, provider: null, streaming: true };
      setItems((list) => [...list, userItem, assistantItem]);
      setBusy(true);
      setStatus({ stage: 'thinking', message: 'Thinking…' });
      startTyping(assistantId);

      const controller = new AbortController();
      controllerRef.current = controller;
      let gotDone = false;

      const onEvent = (e: SseEvent) => {
        switch (e.event) {
          case 'status':
            setStatus({ stage: e.data.stage, message: e.data.message });
            if (e.data.conversationId) rememberConversation(e.data.conversationId);
            if (e.data.reset) {
              typing.current.target = '';
              typing.current.shown = 0;
              patchMessage(assistantId, { content: '' });
            }
            break;
          case 'sources':
            patchMessage(assistantId, { sources: e.data.sources });
            break;
          case 'token':
            typing.current.target += e.data.text;
            setStatus(null);
            break;
          case 'done':
            gotDone = true;
            rememberConversation(e.data.conversationId);
            patchMessage(assistantId, { id: e.data.messageId, provider: e.data.provider });
            typing.current.id = e.data.messageId;
            break;
          case 'error':
            if (e.data.conversationId) rememberConversation(e.data.conversationId);
            throw new ApiError(500, e.data.code, e.data.message);
        }
      };

      try {
        await streamChat({ message, action: input.action, conversationId: conversationId ?? undefined }, onEvent, controller.signal);
        if (!gotDone) throw new ApiError(0, 'INCOMPLETE', 'The answer was cut off. Please try again.');
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong.');
        const id = typing.current.id;
        if (e.code === 'ABORTED') {
          patchMessage(id, { stopped: true });
        } else {
          if (e.status === 404) {
            // The conversation disappeared (profile cleared elsewhere): next message starts a new one.
            storage.remove(CONVERSATION_KEY);
            setConversationId(null);
          }
          patchMessage(id, { error: e.message });
        }
      } finally {
        typing.current.finished = true;
        if (typing.current.raf === null) typing.current.raf = requestAnimationFrame(tick);
        controllerRef.current = null;
        setBusy(false);
        setStatus(null);
      }
    },
    [conversationId, patchMessage, rememberConversation, startTyping, tick],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const retryLast = useCallback(() => {
    const last = lastSendRef.current;
    if (!last || controllerRef.current) return;
    // Drop the failed pair, then send again.
    setItems((list) => {
      const copy = [...list];
      const lastAssistant = copy.length - 1;
      if (copy[lastAssistant]?.kind === 'message' && (copy[lastAssistant] as UiMessage).error) copy.splice(lastAssistant - 1, 2);
      return copy;
    });
    void send(last);
  }, [send]);

  const newChat = useCallback(() => {
    controllerRef.current?.abort();
    storage.remove(CONVERSATION_KEY);
    setConversationId(null);
    setItems([]);
    setStatus(null);
  }, []);

  const startQuiz = useCallback(
    async (topic?: string) => {
      if (!conversationId && !topic) return;
      const id = nextId('q');
      setItems((list) => [...list, { kind: 'quiz', id, status: 'loading', answers: {} }]);
      try {
        const quiz = await api.quiz(conversationId ? { conversationId } : { topic });
        setItems((list) => list.map((it) => (it.id === id ? { kind: 'quiz', id, status: 'ready', quiz, answers: {} } : it)));
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Could not make a quiz right now.';
        setItems((list) => list.map((it) => (it.id === id ? { kind: 'quiz', id, status: 'error', error: message, answers: {} } : it)));
      }
    },
    [conversationId],
  );

  /** Record an answer once; later taps on the same question are ignored. */
  const answerQuiz = useCallback((id: string, question: number, option: number) => {
    setItems((list) =>
      list.map((it) => (it.kind === 'quiz' && it.id === id && it.answers[question] === undefined ? { ...it, answers: { ...it.answers, [question]: option } } : it)),
    );
  }, []);

  const endQuiz = useCallback((id: string) => {
    setItems((list) => list.map((it) => (it.kind === 'quiz' && it.id === id ? { ...it, ended: true } : it)));
  }, []);

  /** Show a ready-made exchange without a model call: "Explain that one another way" after a quiz. */
  const addCanned = useCallback((question: string, answer: string) => {
    setItems((list) => [
      ...list,
      { kind: 'message', id: nextId('u'), role: 'user', content: question, sources: [], action: null, provider: null },
      { kind: 'message', id: nextId('a'), role: 'assistant', content: answer, sources: [], action: null, provider: null },
    ]);
  }, []);

  const hasAnswer = items.some((it) => it.kind === 'message' && it.role === 'assistant' && it.content && !it.error);

  return { items, conversationId, status, busy, loadingHistory, hasAnswer, send, stop, retryLast, newChat, startQuiz, answerQuiz, endQuiz, addCanned };
}
