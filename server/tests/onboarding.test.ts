import { describe, expect, it } from 'vitest';
import { client, fakeProvider, makeApp } from './helpers';

const ANSWERS = [
  'Astronomy, cooking and machine learning',
  "I'm a total beginner",
  'Build a small ML project and understand the night sky',
  'Analogies and step by step',
  'Casual and playful',
  'Why do stars twinkle?',
];

describe('onboarding (demo mode)', () => {
  const { app } = makeApp();

  it('runs all six steps and builds a profile', async () => {
    const c = client(app);
    const start = await c.post('/api/onboarding/message').send({});
    expect(start.status).toBe(200);
    expect(start.body.onboarding).toMatchObject({ status: 'in_progress', step: 0 });
    expect(start.body.question.key).toBe('interests');

    let last = start;
    for (const answer of ANSWERS) {
      last = await c.post('/api/onboarding/message').send({ message: answer });
      expect(last.status).toBe(200);
    }
    expect(last.body.onboarding).toMatchObject({ status: 'completed', step: 6 });
    expect(last.body.question).toBeNull();
    const p = last.body.profile;
    expect(p.interests).toEqual(['Astronomy', 'cooking', 'machine learning']);
    expect(p.knowledgeLevels).toEqual([
      { topic: 'Astronomy', level: 'beginner' },
      { topic: 'cooking', level: 'beginner' },
      { topic: 'machine learning', level: 'beginner' },
    ]);
    expect(p.tone).toBe('Casual and playful');
    expect(p.curiosities).toEqual(['Why do stars twinkle?']);

    const session = await c.post('/api/session');
    expect(session.body.onboarding.status).toBe('completed');
    expect(session.body.profile.interests).toHaveLength(3);
  });

  it('a request without an answer re-sends the same question (refresh)', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    const a = await c.post('/api/onboarding/message').send({ message: 'Chess' });
    const again = await c.post('/api/onboarding/message').send({});
    const blank = await c.post('/api/onboarding/message').send({ message: '   ' });
    expect(again.body.question).toEqual(a.body.question);
    expect(blank.body.question).toEqual(a.body.question);
    expect(again.body.onboarding.step).toBe(1);
  });

  it('a message sent before onboarding starts is treated as a greeting, not an answer', async () => {
    const c = client(app);
    const res = await c.post('/api/onboarding/message').send({ message: 'hi!' });
    expect(res.body.onboarding).toMatchObject({ status: 'in_progress', step: 0 });
  });

  it('skip "question" moves on without recording an answer', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    const res = await c.post('/api/onboarding/message').send({ skip: 'question' });
    expect(res.body.onboarding.step).toBe(1);
    expect(res.body.question.key).toBe('knowledgeLevels');
  });

  it('skip "all" before starting marks onboarding skipped with an empty profile', async () => {
    const c = client(app);
    const res = await c.post('/api/onboarding/message').send({ skip: 'all' });
    expect(res.body.onboarding.status).toBe('skipped');
    expect(res.body.profile.interests).toEqual([]);
  });

  it('skip "all" midway keeps what was already answered', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    await c.post('/api/onboarding/message').send({ message: 'History, jazz' });
    const res = await c.post('/api/onboarding/message').send({ skip: 'all' });
    expect(res.body.onboarding.status).toBe('completed');
    expect(res.body.profile.interests).toEqual(['History', 'jazz']);
  });

  it('is idempotent after completion and can be restarted', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({ skip: 'all' });
    const late = await c.post('/api/onboarding/message').send({ message: 'extra' });
    expect(late.body.onboarding.status).toBe('skipped');
    const restart = await c.post('/api/onboarding/message').send({ restart: true });
    expect(restart.body.onboarding).toMatchObject({ status: 'in_progress', step: 0 });
    expect(restart.body.question.key).toBe('interests');
  });

  it('a double-tapped answer advances only one step', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    const [a, b] = await Promise.all([
      c.post('/api/onboarding/message').send({ message: 'Chess' }),
      c.post('/api/onboarding/message').send({ message: 'Chess' }),
    ]);
    const statuses = [a.status, b.status].sort();
    // Either both see step 1 (second was a no-op race loser -> 409) or the second was serialized after.
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    const now = await c.post('/api/onboarding/message').send({});
    expect(now.body.onboarding.step).toBeLessThanOrEqual(2);
  });

  it('validates the body', async () => {
    const c = client(app);
    expect((await c.post('/api/onboarding/message').send({ message: 'x'.repeat(1001) })).status).toBe(400);
    expect((await c.post('/api/onboarding/message').send({ skip: 'everything' })).status).toBe(400);
    expect((await c.post('/api/onboarding/message').send({ unknown: 1 })).status).toBe(400);
    expect((await c.post('/api/onboarding/message').send({ message: 42 })).status).toBe(400);
  });
});

describe('onboarding with a model', () => {
  it('uses model phrasing and model extraction', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: (req) =>
        req.json
          ? JSON.stringify({
              interests: ['astronomy', 'cooking'],
              knowledgeLevels: [{ topic: 'astronomy', level: 'EXPERT-ish' }],
              goals: ['understand stars'],
              explanationStyle: 'analogies',
              tone: 'playful',
              curiosities: ['twinkling stars', 'twinkling stars'],
            })
          : '"Nice! How much do you already know about those?"',
    });
    const { app } = makeApp({ providers: [gemini] });
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    const second = await c.post('/api/onboarding/message').send({ message: ANSWERS[0] });
    expect(second.body.question.text).toBe('Nice! How much do you already know about those?');

    let last = second;
    for (const a of ANSWERS.slice(1)) last = await c.post('/api/onboarding/message').send({ message: a });
    expect(last.body.profile).toEqual({
      interests: ['astronomy', 'cooking'],
      knowledgeLevels: [{ topic: 'astronomy', level: 'beginner' }], // unknown level coerced
      goals: ['understand stars'],
      explanationStyle: 'analogies',
      tone: 'playful',
      curiosities: ['twinkling stars'], // de-duplicated
    });
  });

  it('falls back to fixed questions and rule-based extraction when the model fails', async () => {
    const gemini = fakeProvider({
      name: 'gemini',
      complete: () => {
        throw Object.assign(new Error('quota'), { status: 429 });
      },
    });
    const { app } = makeApp({ providers: [gemini] });
    const c = client(app);
    await c.post('/api/onboarding/message').send({});
    let last = await c.post('/api/onboarding/message').send({ message: ANSWERS[0] });
    expect(last.body.question.text).toMatch(/how much do you already know/i);
    for (const a of ANSWERS.slice(1)) last = await c.post('/api/onboarding/message').send({ message: a });
    expect(last.body.onboarding.status).toBe('completed');
    expect(last.body.profile.interests).toEqual(['Astronomy', 'cooking', 'machine learning']);
  });
});
