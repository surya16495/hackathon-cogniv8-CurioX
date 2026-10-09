import { describe, expect, it } from 'vitest';
import { Conversation, Message, SearchCache } from '../src/db/models';
import { DEMO_LABEL } from '../src/services/llm/demo';
import {
  chatStream,
  client,
  eventsOf,
  fakeProvider,
  fakeSearcher,
  httpError,
  makeApp,
  tokens,
  tokensThenFail,
} from './helpers';

const noSearch = JSON.stringify({ needsSearch: false, query: '' });
const yesSearch = (q: string) => JSON.stringify({ needsSearch: true, query: q });

describe('POST /api/chat in demo mode', () => {
  const { app } = makeApp();

  it('streams status, token and done events in order, then saves both messages', async () => {
    const c = client(app);
    const { res, events } = await chatStream(c, { message: 'How do rainbows form?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('status');
    expect(names.at(-1)).toBe('done');
    expect(names.indexOf('token')).toBeGreaterThan(names.lastIndexOf('status'));

    const done = eventsOf(events, 'done')[0]!;
    expect(done).toMatchObject({ provider: 'demo', demo: true });
    const text = eventsOf(events, 'token').map((t) => t.text).join('');
    expect(text.startsWith(DEMO_LABEL)).toBe(true);

    const history = await c.get(`/api/conversations/${done.conversationId}/messages`);
    expect(history.status).toBe(200);
    expect(history.body.title).toBe('How do rainbows form?');
    expect(history.body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(history.body.messages[1].content).toBe(text);
    expect(history.body.messages[1].provider).toBe('demo');
  });

  it('demo mode attaches clickable demo sources to current-events questions', async () => {
    const { events } = await chatStream(client(app), { message: 'What is the latest news about Mars missions?' });
    const sources = eventsOf(events, 'sources')[0]!.sources;
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].title).toMatch(/^Demo source/);
    expect(sources[0].url).toMatch(/^https:\/\//);
  });

  it('stream=false returns one JSON body (body flag and query flag)', async () => {
    const c = client(app);
    const a = await c.post('/api/chat').send({ message: 'What is entropy?', stream: false });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ provider: 'demo', demo: true, userMessage: { role: 'user', content: 'What is entropy?' } });
    expect(a.body.assistantMessage.content.length).toBeGreaterThan(20);

    const b = await c.post('/api/chat?stream=false').send({ message: 'And enthalpy?', conversationId: a.body.conversationId });
    expect(b.body.conversationId).toBe(a.body.conversationId);
    expect(await Message.countDocuments({ conversationId: a.body.conversationId })).toBe(4);
  });

  it('a learn action applies to the previous answer and reuses its sources', async () => {
    const c = client(app);
    const first = await c.post('/api/chat').send({ message: 'Latest news on fusion energy?', stream: false });
    const { events } = await chatStream(c, { action: 'simplify', conversationId: first.body.conversationId });
    expect(eventsOf(events, 'done')[0]).toBeTruthy();
    expect(eventsOf(events, 'sources')[0]!.sources).toEqual(first.body.assistantMessage.sources);
    const text = eventsOf(events, 'token').map((t) => t.text).join('');
    expect(text).toContain('(Simplify)');

    const msgs = await Message.find({ conversationId: first.body.conversationId }).sort({ createdAt: 1 });
    expect(msgs[2]!.content).toBe('[Simplify]');
    expect(msgs[2]!.action).toBe('simplify');
  });

  it('a learn action plus a message works in a new conversation', async () => {
    const res = await client(app).post('/api/chat').send({ message: 'Photosynthesis', action: 'real_world_example', stream: false });
    expect(res.status).toBe(200);
    expect(res.body.assistantMessage.action).toBe('real_world_example');
  });

  it.each([
    [{}, /message, an action, or both/],
    [{ message: '   ' }, /message, an action, or both/],
    [{ action: 'simplify' }, /needs a conversationId/],
    [{ message: 'hi', action: 'teleport' }, /Invalid enum value/],
    [{ message: 'x'.repeat(4001) }, /4000/],
    [{ message: 'hi', conversationId: 'abc' }, /Invalid conversationId/],
    [{ message: 'hi', extra: true }, /Unrecognized key/],
  ])('rejects invalid body %j', async (body, msg) => {
    const res = await client(app).post('/api/chat').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(msg);
  });

  it('an action on a conversation with no answer yet is a 400', async () => {
    const c = client(app);
    const conv = await Conversation.create({ userId: (await c.post('/api/session')).body.userId, title: 'empty' });
    const res = await c.post('/api/chat').send({ action: 'go_deeper', conversationId: conv._id.toString() });
    expect(res.status).toBe(400);
  });

  it("another device's conversation is a 404 for chat and history", async () => {
    const owner = client(app);
    const intruder = client(app);
    const first = await owner.post('/api/chat').send({ message: 'Secret topic', stream: false });
    const id = first.body.conversationId;
    expect((await intruder.post('/api/chat').send({ message: 'hi', conversationId: id })).status).toBe(404);
    expect((await intruder.get(`/api/conversations/${id}/messages`)).status).toBe(404);
    expect((await intruder.get('/api/conversations/not-an-id/messages')).status).toBe(404);
    expect((await intruder.post('/api/chat').send({ message: 'hi', conversationId: '0'.repeat(24) })).status).toBe(404);
  });

  it('lists conversations newest first', async () => {
    const c = client(app);
    await c.post('/api/chat').send({ message: 'First', stream: false });
    await c.post('/api/chat').send({ message: 'Second', stream: false });
    const res = await c.get('/api/conversations');
    expect(res.body.conversations.map((x: any) => x.title)).toEqual(['Second', 'First']);
  });
});

describe('POST /api/chat fallback chain', () => {
  it('uses Gemini when it works and sends history + profile in the prompt', async () => {
    const gemini = fakeProvider({ name: 'gemini', complete: () => noSearch, stream: () => tokens('Hello ', 'there.') });
    const groq = fakeProvider({ name: 'groq', stream: () => tokens('groq') });
    const { app } = makeApp({ providers: [gemini, groq] });
    const c = client(app);
    await c.put('/api/profile').send({ interests: ['Football'] });
    const first = await c.post('/api/chat').send({ message: 'What is inertia?', stream: false });
    expect(first.body.provider).toBe('gemini');
    expect(first.body.assistantMessage.content).toBe('Hello there.');

    await c.post('/api/chat').send({ message: 'Example please', conversationId: first.body.conversationId, stream: false });
    const req = gemini.streamCalls[1]!;
    expect(req.system).toContain('Interests: Football');
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(groq.streamCalls).toHaveLength(0);
  });

  it('falls back to Groq on a Gemini 429, with a trimmed prompt', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => yesSearch('ai news'),
      stream: () => {
        throw httpError(429, 'quota');
      },
    });
    const groq = fakeProvider({ name: 'groq', stream: () => tokens('From ', 'Groq [1].') });
    const searcher = fakeSearcher(
      Array.from({ length: 5 }, (_, i) => ({ title: `T${i}`, url: `https://example.com/${i}`, snippet: `S${i}` })),
    );
    const { app } = makeApp({ providers: [gemini, groq], searcher });
    const { events } = await chatStream(client(app), { message: 'Latest AI news?' });

    expect(eventsOf(events, 'done')[0]).toMatchObject({ provider: 'groq', demo: false });
    const retry = eventsOf(events, 'status').find((s) => s.stage === 'retrying')!;
    expect(retry).toMatchObject({ provider: 'groq', reset: false });
    expect(eventsOf(events, 'sources')[0]!.sources).toHaveLength(5);
    // Groq gets 3 snippets, not 5.
    expect(groq.streamCalls[0]!.system).toContain('[3] T2');
    expect(groq.streamCalls[0]!.system).not.toContain('[4] T3');
  });

  it('a mid-stream failure tells the client to reset, then falls through to a demo answer', async () => {
    const gemini = fakeProvider({ name: 'gemini', complete: () => noSearch, stream: () => tokensThenFail(['Partial '], httpError(503)) });
    const groq = fakeProvider({ name: 'groq', stream: () => tokensThenFail(['Also partial '], httpError(500)) });
    const { app } = makeApp({ providers: [gemini, groq] });
    const c = client(app);
    const { events } = await chatStream(c, { message: 'Explain gravity' });

    const retries = eventsOf(events, 'status').filter((s) => s.stage === 'retrying');
    expect(retries.map((r) => [r.provider, r.reset])).toEqual([
      ['groq', true],
      ['demo', true],
    ]);
    const done = eventsOf(events, 'done')[0]!;
    expect(done).toMatchObject({ provider: 'demo', demo: true });
    const saved = await Message.findById(done.messageId);
    expect(saved!.content.startsWith(DEMO_LABEL)).toBe(true); // partial text was not saved
  });

  it('skips providers without keys, and an empty stream counts as a failure', async () => {
    const gemini = fakeProvider({ name: 'gemini', available: false });
    const groq = fakeProvider({ name: 'groq', complete: () => noSearch, stream: () => tokens('', '  ') });
    const { app } = makeApp({ providers: [gemini, groq] });
    const res = await client(app).post('/api/chat').send({ message: 'Hi', stream: false });
    expect(res.body.provider).toBe('demo');
    expect(gemini.streamCalls).toHaveLength(0);
  });

  it('a stalled provider times out and falls back', async () => {
    async function* stall(): AsyncGenerator<string> {
      yield 'Start ';
      await new Promise((r) => setTimeout(r, 5000));
      yield 'never';
    }
    const gemini = fakeProvider({ name: 'gemini', complete: () => noSearch, stream: () => stall() });
    const groq = fakeProvider({ name: 'groq', stream: () => tokens('Recovered.') });
    const { app } = makeApp({ providers: [gemini, groq], timeoutMs: 300 });
    const res = await client(app).post('/api/chat').send({ message: 'Hi', stream: false });
    expect(res.body.provider).toBe('groq');
    expect(res.body.assistantMessage.content).toBe('Recovered.');
  });
});

describe('provider order and quick calls', () => {
  it('LLM_CHAT_ORDER=groq,gemini streams from Groq first', async () => {
    const gemini = fakeProvider({ name: 'gemini', complete: () => noSearch, stream: () => tokens('gemini') });
    const groq = fakeProvider({ name: 'groq', stream: () => tokens('groq') });
    const { app } = makeApp({ providers: [gemini, groq], chatOrder: ['groq', 'gemini'], searcher: fakeSearcher([]) });
    const res = await client(app).post('/api/chat').send({ message: 'Hi', stream: false });
    expect(res.body.provider).toBe('groq');
    expect(gemini.streamCalls).toHaveLength(0);
    expect(gemini.completeCalls).toHaveLength(1); // the router still uses Gemini lite
  });

  it('the router makes one quick attempt, then uses the heuristic instead of trying Groq', async () => {
    const gemini = fakeProvider({ name: 'gemini', complete: () => { throw httpError(503); }, stream: () => tokens('ok') });
    const groq = fakeProvider({ name: 'groq', complete: () => yesSearch('x'), stream: () => tokens('groq') });
    const searcher = fakeSearcher([{ title: 'A', url: 'https://a.example', snippet: 'a' }]);
    const { app } = makeApp({ providers: [gemini, groq], searcher });
    await client(app).post('/api/chat').send({ message: 'Explain gravity', stream: false });
    expect(groq.completeCalls).toHaveLength(0);
    expect(searcher.calls).toHaveLength(0); // heuristic: stable concept, no search
  });
});

describe('POST /api/chat research', () => {
  const results = [
    { title: 'A', url: 'https://a.example/x', snippet: 'aaa' },
    { title: 'A dup', url: 'https://a.example/x#frag', snippet: 'dup' },
    { title: 'Bad', url: 'javascript:alert(1)', snippet: 'bad' },
    { title: 'B', url: 'https://b.example/', snippet: 'b'.repeat(2000) },
  ];

  it('stable questions do not search', async () => {
    const searcher = fakeSearcher(results);
    const gemini = fakeProvider({ name: 'gemini', complete: () => noSearch, stream: () => tokens('ok') });
    const { app } = makeApp({ providers: [gemini], searcher });
    const { events } = await chatStream(client(app), { message: 'What is a prime number?' });
    expect(searcher.calls).toHaveLength(0);
    expect(eventsOf(events, 'sources')).toHaveLength(0);
  });

  it('current questions search once, clean results, and hit the cache next time', async () => {
    const searcher = fakeSearcher(results);
    const gemini = fakeProvider({ name: 'gemini', complete: () => yesSearch('  Mars Mission NEWS '), stream: () => tokens('ok [1]') });
    const { app } = makeApp({ providers: [gemini], searcher });
    const c = client(app);

    const { events } = await chatStream(c, { message: 'Mars news?' });
    const sources = eventsOf(events, 'sources')[0]!.sources;
    expect(sources.map((s: any) => s.title)).toEqual(['A', 'B']); // dup and javascript: dropped
    expect(sources.map((s: any) => s.id)).toEqual([1, 2]);
    expect(sources[1].snippet.length).toBeLessThanOrEqual(500);
    expect(eventsOf(events, 'status').some((s) => s.stage === 'searching')).toBe(true);

    await new Promise((r) => setTimeout(r, 50)); // cache write is fire-and-forget
    expect(await SearchCache.countDocuments()).toBe(1);
    await chatStream(c, { message: 'Mars news again?' });
    expect(searcher.calls).toHaveLength(1); // same normalized query -> cache

    const saved = await Message.findOne({ role: 'assistant' });
    expect(saved!.sources).toHaveLength(2);
  });

  it('a search failure still answers, without sources, and is not cached', async () => {
    const searcher = fakeSearcher(httpError(432, 'credits exhausted'));
    const gemini = fakeProvider({ name: 'gemini', complete: () => yesSearch('ai'), stream: () => tokens('ok') });
    const { app } = makeApp({ providers: [gemini], searcher });
    const { events } = await chatStream(client(app), { message: 'AI news today?' });
    expect(eventsOf(events, 'done')).toHaveLength(1);
    expect(eventsOf(events, 'sources')).toHaveLength(0);
    expect(gemini.streamCalls[0]!.system).toContain('could not check the latest information');
    expect(await SearchCache.countDocuments()).toBe(0);
  });

  it('a router that returns garbage falls back to the keyword heuristic', async () => {
    const searcher = fakeSearcher(results);
    const gemini = fakeProvider({ name: 'gemini', complete: () => 'sure thing!', stream: () => tokens('ok') });
    const { app } = makeApp({ providers: [gemini], searcher });
    await chatStream(client(app), { message: 'What happened in the election today?' });
    expect(searcher.calls).toEqual(['What happened in the election today?']);
  });
});

describe('POST /api/chat client disconnect', () => {
  it('stops the model, does not fall back, and saves the partial answer', async () => {
    let groqCalled = false;
    let geminiAborted = false;
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => noSearch,
      stream: (req) =>
        (async function* () {
          yield 'First part. ';
          await new Promise<void>((resolve) => {
            req.signal?.addEventListener('abort', () => {
              geminiAborted = true;
              resolve();
            });
          });
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        })(),
    });
    const groq = fakeProvider({
      name: 'groq',
      stream: () => {
        groqCalled = true;
        return tokens('nope');
      },
    });
    const { app } = makeApp({ providers: [gemini, groq] });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'disconnect-test-1' },
        body: JSON.stringify({ message: 'Tell me a long story' }),
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      let seen = '';
      while (!seen.includes('First part')) seen += new TextDecoder().decode((await reader.read()).value);
      controller.abort();

      // Wait for the server to notice and save.
      for (let i = 0; i < 50 && !(await Message.findOne({ role: 'assistant' })); i++) await new Promise((r) => setTimeout(r, 20));
      const saved = await Message.findOne({ role: 'assistant' });
      expect(geminiAborted).toBe(true);
      expect(groqCalled).toBe(false);
      expect(saved!.content).toBe('First part. …');
    } finally {
      server.close();
    }
  });
});
