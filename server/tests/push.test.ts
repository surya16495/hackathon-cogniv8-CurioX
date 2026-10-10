import { describe, expect, it } from 'vitest';
import { User } from '../src/db/models';
import { checkUserUpdates } from '../src/services/push';
import { client, fakeProvider, fakeSearcher, makeApp } from './helpers';

/** A model that answers nothing useful: the checks here never need one, but demo mode would hide the search. */
const model = () => fakeProvider({ name: 'groq', complete: () => '{}' });

const token = 'ExponentPushToken[abcdefghijklmnop]';
const news = (topic: string) => [1, 2, 3].map((i) => ({ title: `${topic} story ${i}`, url: `https://news.example/${topic}/${i}`, snippet: `About ${topic} ${i}.` }));

describe('push updates', () => {
  it('registers a phone once, and rejects a token that is not from Expo', async () => {
    const { app } = makeApp();
    const c = client(app);
    expect((await c.get('/api/push')).body).toEqual({ tokens: 0, topics: [], lastCheckedAt: null });
    expect((await c.post('/api/push/token').send({ token, platform: 'android' })).body.tokens).toBe(1);
    expect((await c.post('/api/push/token').send({ token })).body.tokens).toBe(1);
    expect((await c.post('/api/push/token').send({ token: 'fcm:abc' })).status).toBe(400);
    expect((await c.delete('/api/push/token').send({ token })).body.tokens).toBe(0);
  });

  it('sends what is new on the followed topics, once, and drops tokens Expo no longer knows', async () => {
    const searcher = fakeSearcher(news('Cricket'));
    const { app, services } = makeApp({ providers: [model()], searcher });
    const c = client(app);
    await c.post('/api/onboarding/complete').send({ reader: { interests: ['Cricket'], level: [], goals: [], style: [], tone: [], curious: [] } });
    await c.post('/api/push/token').send({ token, platform: 'ios' });
    const user = (await User.findOne({ pushTokens: { $elemMatch: { token } } }))!;

    const sentBodies: unknown[] = [];
    const fetchFn = (async (_url: string, init: { body: string }) => {
      sentBodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
    }) as unknown as typeof fetch;

    const first = await checkUserUpdates(user, services, fetchFn);
    expect(first.sent).toEqual([{ topic: 'Cricket', title: 'Cricket story 1', deckId: null }]);
    expect(sentBodies[0]).toMatchObject([{ to: token, title: 'New in Cricket', body: 'Cricket story 1', channelId: 'issues' }]);
    expect(first.lastCheckedAt).not.toBeNull();

    // The same news again: nothing new, nothing sent.
    const again = await checkUserUpdates((await User.findById(user._id))!, services, fetchFn);
    expect(again.sent).toEqual([]);
    expect(sentBodies).toHaveLength(1);

    // A new topic (searches are cached per query), and a phone Expo no longer knows is forgotten.
    await User.updateOne({ _id: user._id }, { $set: { 'profile.interests': ['Space'] } });
    const gone = (async () => ({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) })) as unknown as typeof fetch;
    const fresh = fakeSearcher([{ title: 'Space story 9', url: 'https://news.example/Space/9', snippet: '' }]);
    const { services: s2 } = makeApp({ providers: [model()], searcher: fresh });
    const third = await checkUserUpdates((await User.findById(user._id))!, s2, gone);
    expect(third.sent).toHaveLength(1);
    expect(third.tokens).toBe(0);
  });
});
