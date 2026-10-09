import { describe, expect, it } from 'vitest';
import { quizSchema } from '@curiox/shared';
import { client, fakeProvider, makeApp } from './helpers';

const q = (i: number, options = ['A', 'B', 'C', 'D']) => ({ question: `Q${i}?`, options, answerIndex: i % 4, explanation: 'Because.' });

describe('POST /api/learn/quiz', () => {
  it('demo mode returns a valid quiz for a topic', async () => {
    const { app } = makeApp();
    const res = await client(app).post('/api/learn/quiz').send({ topic: 'Black holes', count: 3 });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('demo');
    expect(res.body.questions).toHaveLength(3);
    expect(quizSchema.safeParse(res.body).success).toBe(true);
  });

  it('uses the conversation title and recent messages as the topic and context', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: (req) => (req.system.includes('quiz') ? JSON.stringify({ topic: 'Tides', questions: [q(0), q(1), q(2), q(3)] }) : '{"needsSearch":false,"query":""}'),
      stream: async function* () {
        yield 'Tides come from the moon.';
      },
    });
    const { app } = makeApp({ providers: [gemini] });
    const c = client(app);
    const chat = await c.post('/api/chat').send({ message: 'Why are there tides?', stream: false });
    const res = await c.post('/api/learn/quiz').send({ conversationId: chat.body.conversationId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'gemini', topic: 'Tides' });
    expect(res.body.questions).toHaveLength(4); // default count
    const quizCall = gemini.completeCalls.at(-1)!;
    expect(quizCall.messages[0]!.content).toContain('Topic: Why are there tides?');
    expect(quizCall.messages[0]!.content).toContain('Tides come from the moon.');
  });

  it('drops questions with duplicate options and falls back if too few remain', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => JSON.stringify({ topic: 'X', questions: [q(0), q(1, ['A', 'A', 'B', 'C']), q(2, ['a', 'A', 'b', 'c'])] }),
    });
    const { app } = makeApp({ providers: [gemini] });
    const res = await client(app).post('/api/learn/quiz').send({ topic: 'X', count: 3 });
    expect(res.body.provider).toBe('demo');
    expect(res.body.questions).toHaveLength(3);
  });

  it('invalid model JSON (wrong option count, bad index) falls back to the demo quiz', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => '```json\n{"topic":"X","questions":[{"question":"?","options":["a","b"],"answerIndex":7,"explanation":"e"}]}\n```',
    });
    const groq = fakeProvider({ name: 'groq', complete: () => 'not json at all' });
    const { app } = makeApp({ providers: [gemini, groq] });
    const res = await client(app).post('/api/learn/quiz').send({ topic: 'X' });
    expect(res.body.provider).toBe('demo');
    expect(groq.completeCalls).toHaveLength(1);
  });

  it('accepts fenced JSON and trims extra questions to the requested count', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => `Here you go:\n\`\`\`json\n${JSON.stringify({ topic: 'X', questions: [q(0), q(1), q(2), q(3), q(4)] })}\n\`\`\``,
    });
    const { app } = makeApp({ providers: [gemini] });
    const res = await client(app).post('/api/learn/quiz').send({ topic: 'X', count: 3 });
    expect(res.body.provider).toBe('gemini');
    expect(res.body.questions).toHaveLength(3);
  });

  it.each([[{}], [{ topic: '' }], [{ topic: 'x', count: 2 }], [{ topic: 'x', count: 6 }], [{ topic: 'x', count: 3.5 }]])(
    'rejects %j',
    async (body) => {
      const { app } = makeApp();
      expect((await client(app).post('/api/learn/quiz').send(body)).status).toBe(400);
    },
  );

  it("404s for another device's conversation", async () => {
    const { app } = makeApp();
    const chat = await client(app).post('/api/chat').send({ message: 'Hi', stream: false });
    const res = await client(app).post('/api/learn/quiz').send({ conversationId: chat.body.conversationId });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/topics/suggested', () => {
  it('returns generic topics before onboarding', async () => {
    const { app } = makeApp();
    const res = await client(app).get('/api/topics/suggested');
    expect(res.status).toBe(200);
    expect(res.body.topics.length).toBeGreaterThanOrEqual(4);
    expect(res.body.topics.length).toBeLessThanOrEqual(6);
  });

  it('builds fallback topics from the profile in demo mode', async () => {
    const { app } = makeApp();
    const c = client(app);
    await c.put('/api/profile').send({ interests: ['Chess'], curiosities: ['Why is the sky blue?'] });
    const res = await c.get('/api/topics/suggested');
    expect(res.body.topics[0]).toEqual({ title: 'Why is the sky blue?', prompt: 'Why is the sky blue?' });
    expect(res.body.topics[1].title).toBe('Chess: the big ideas');
  });

  it('uses the model, caps at 6, and caches per profile', async () => {
    const topics = Array.from({ length: 8 }, (_, i) => ({ title: `Topic ${i}`, prompt: `Tell me about ${i}?` }));
    const gemini = fakeProvider({ name: 'gemini', complete: () => JSON.stringify({ topics }) });
    const { app } = makeApp({ providers: [gemini] });
    const c = client(app);
    await c.put('/api/profile').send({ interests: ['Chess'] });
    const a = await c.get('/api/topics/suggested');
    const b = await c.get('/api/topics/suggested');
    expect(a.body.provider).toBe('gemini');
    expect(a.body.topics).toHaveLength(6);
    expect(b.body).toEqual(a.body);
    expect(gemini.completeCalls).toHaveLength(1);

    await c.put('/api/profile').send({ interests: ['Go'] });
    await c.get('/api/topics/suggested');
    expect(gemini.completeCalls).toHaveLength(2); // profile changed -> regenerated
  });
});
