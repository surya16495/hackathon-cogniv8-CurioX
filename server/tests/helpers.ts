import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { createLlmService } from '../src/services/llm';
import type { LlmProvider, LlmRequest } from '../src/services/llm/types';
import { createSearchService } from '../src/services/search';
import type { WebSearcher } from '../src/services/search/tavily';
import type { RawResult } from '../src/services/search/cache';
import type { Services } from '../src/services';
import type { SttService } from '../src/services/voice/stt';
import { parseSse } from '../src/utils/sse';

export interface FakeProviderSpec {
  name: 'gemini' | 'groq';
  available?: boolean;
  /** Tokens to stream, or a function deciding per request. Throw to simulate failure. */
  stream?: (req: LlmRequest) => AsyncIterable<string>;
  complete?: (req: LlmRequest) => Promise<string> | string;
}

export interface FakeProvider extends LlmProvider {
  streamCalls: LlmRequest[];
  completeCalls: LlmRequest[];
}

export function httpError(status: number, message = `HTTP ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

export async function* tokens(...parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}

export async function* tokensThenFail(parts: string[], err: Error): AsyncGenerator<string> {
  for (const p of parts) yield p;
  throw err;
}

export function fakeProvider(spec: FakeProviderSpec): FakeProvider {
  const streamCalls: LlmRequest[] = [];
  const completeCalls: LlmRequest[] = [];
  return {
    name: spec.name,
    streamCalls,
    completeCalls,
    available: () => spec.available ?? true,
    stream(req) {
      streamCalls.push(req);
      if (!spec.stream) throw httpError(500, 'no stream configured');
      return spec.stream(req);
    },
    async complete(req) {
      completeCalls.push(req);
      if (!spec.complete) throw httpError(500, 'no complete configured');
      return spec.complete(req);
    },
  };
}

export function fakeSearcher(results: RawResult[] | Error, available = true): WebSearcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    available: () => available,
    async search(query) {
      calls.push(query);
      if (results instanceof Error) throw results;
      return results;
    },
  };
}

export interface TestAppOptions {
  providers?: LlmProvider[];
  demoMode?: boolean;
  searcher?: WebSearcher;
  timeoutMs?: number;
  chatOrder?: string[];
  stt?: SttService;
}

export function makeApp(opts: TestAppOptions = {}): { app: Express; services: Services } {
  const demoMode = opts.demoMode ?? !opts.providers;
  const searcher = opts.searcher ?? fakeSearcher([], false);
  const services: Services = {
    llm: createLlmService({
      providers: opts.providers ?? [],
      demoMode,
      timeoutMs: opts.timeoutMs ?? 2000,
      demoDelayMs: 0,
      chatOrder: opts.chatOrder,
      log: () => undefined,
    }),
    search: createSearchService({ searcher, demoMode, ttlHours: 6 }),
    tavilyConfigured: searcher.available(),
    stt: opts.stt ?? { available: () => false, transcribe: async () => '' },
  };
  const app = createApp({ CORS_ORIGIN: ['http://localhost:5173'], NODE_ENV: 'test' }, services);
  return { app, services };
}

export const newDevice = () => `test-${randomUUID()}`;

/** supertest client with the device header already set. */
export function client(app: Express, deviceId = newDevice()) {
  const withDevice = (r: request.Test) => r.set('X-Device-Id', deviceId);
  const agent = request(app);
  return {
    deviceId,
    get: (url: string) => withDevice(agent.get(url)),
    post: (url: string) => withDevice(agent.post(url)),
    put: (url: string) => withDevice(agent.put(url)),
    delete: (url: string) => withDevice(agent.delete(url)),
  };
}

/** POST /api/chat as a stream and return the parsed SSE events. */
export async function chatStream(c: ReturnType<typeof client>, body: Record<string, unknown>) {
  const res = await c
    .post('/api/chat')
    .send(body)
    .buffer(true)
    .parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => (data += chunk));
      r.on('end', () => cb(null, data));
    });
  const events = typeof res.body === 'string' ? parseSse(res.body) : [];
  return { res, events };
}

export function eventsOf(events: { event: string; data: unknown }[], name: string) {
  return events.filter((e) => e.event === name).map((e) => e.data as Record<string, any>);
}
