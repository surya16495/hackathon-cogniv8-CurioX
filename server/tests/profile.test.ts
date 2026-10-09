import { describe, expect, it } from 'vitest';
import { Conversation, Message } from '../src/db/models';
import { chatStream, client, makeApp } from './helpers';

describe('/api/profile', () => {
  const { app } = makeApp();

  it('GET returns an empty profile for a new device', async () => {
    const res = await client(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile.interests).toEqual([]);
    expect(res.body.onboarding.status).toBe('not_started');
  });

  it('PUT merges a partial update and keeps other fields', async () => {
    const c = client(app);
    await c.put('/api/profile').send({ interests: ['Physics'], tone: 'formal' });
    const res = await c.put('/api/profile').send({ goals: ['Pass my exam'] });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ interests: ['Physics'], tone: 'formal', goals: ['Pass my exam'] });
  });

  it('PUT trims and de-duplicates list items', async () => {
    const res = await client(app).put('/api/profile').send({ interests: ['  AI ', 'ai', 'Art'] });
    expect(res.body.profile.interests).toEqual(['AI', 'Art']);
  });

  it.each([
    [{ knowledgeLevels: [{ topic: 'AI', level: 'guru' }] }],
    [{ interests: 'not-an-array' }],
    [{ interests: [''] }],
    [{ hacker: true }],
    [{ interests: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
  ])('PUT rejects invalid input %j', async (body) => {
    const res = await client(app).put('/api/profile').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE clears the profile and restarts onboarding but keeps history by default', async () => {
    const c = client(app);
    await c.post('/api/onboarding/message').send({ skip: 'all' });
    await c.put('/api/profile').send({ interests: ['Physics'] });
    await chatStream(c, { message: 'What is gravity?' });

    const res = await c.delete('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile.interests).toEqual([]);
    expect(res.body.onboarding).toMatchObject({ status: 'not_started', step: 0 });
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('DELETE ?history=true also deletes conversations and messages', async () => {
    const c = client(app);
    const other = client(app);
    await chatStream(c, { message: 'What is gravity?' });
    await chatStream(other, { message: 'What is light?' });

    await c.delete('/api/profile?history=true');
    expect(await Conversation.countDocuments()).toBe(1); // the other device's conversation stays
    expect(await Message.countDocuments()).toBe(2);
  });
});
