import { describe, expect, it } from 'vitest';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../src/services/auth';
import { client, makeApp } from './helpers';

const reader = { interests: ['Cricket'], level: [], goals: [], style: [], tone: [], curious: [] };

describe('accounts', () => {
  it('passwords and tokens round-trip, and bad ones fail', () => {
    const h = hashPassword('secret-1');
    expect(verifyPassword('secret-1', h)).toBe(true);
    expect(verifyPassword('secret-2', h)).toBe(false);
    const t = signToken('k', 'abc');
    expect(verifyToken('k', t)).toBe('abc');
    expect(verifyToken('other', t)).toBeNull();
    expect(verifyToken('k', t.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyToken('k', signToken('k', 'abc', Date.now() - 100 * 86_400_000))).toBeNull();
  });

  it('signing up keeps the device\'s reader card and returns a token that works on another device', async () => {
    const { app } = makeApp();
    const phone = client(app);
    await phone.post('/api/onboarding/complete').send({ reader });
    const up = await phone.post('/api/auth/signup').send({ name: 'Surya', email: 'S@Example.com', password: 'secret-1' });
    expect(up.status).toBe(201);
    expect(up.body.account).toEqual({ name: 'Surya', email: 's@example.com' });
    expect(up.body.session.profile.interests).toEqual(['Cricket']);
    expect(up.body.session.account.email).toBe('s@example.com');

    const tablet = client(app);
    const anon = await tablet.post('/api/session');
    expect(anon.body.account).toBeNull();
    const withToken = await tablet.post('/api/session').set('Authorization', `Bearer ${up.body.token}`);
    expect(withToken.body.account.email).toBe('s@example.com');
    expect(withToken.body.profile.interests).toEqual(['Cricket']);
    expect(withToken.body.userId).toBe(up.body.session.userId);
  });

  it('sign in needs the right password; a stale token falls back to the device', async () => {
    const { app } = makeApp();
    const c = client(app);
    await c.post('/api/auth/signup').send({ name: 'A', email: 'a@x.com', password: 'secret-1' });
    expect((await c.post('/api/auth/signin').send({ email: 'a@x.com', password: 'nope' })).status).toBe(401);
    expect((await c.post('/api/auth/signin').send({ email: 'nobody@x.com', password: 'secret-1' })).status).toBe(401);
    const ok = await c.post('/api/auth/signin').send({ email: 'A@x.com', password: 'secret-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.account.name).toBe('A');
    const other = client(app);
    const res = await other.post('/api/session').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(201);
    expect(res.body.account).toBeNull();
  });

  it('a second account on the same device gets its own user; duplicate emails are refused', async () => {
    const { app } = makeApp();
    const c = client(app);
    const first = await c.post('/api/auth/signup').send({ name: 'A', email: 'a@x.com', password: 'secret-1' });
    expect((await c.post('/api/auth/signup').send({ name: 'B', email: 'a@x.com', password: 'secret-2' })).status).toBe(400);
    const second = await c.post('/api/auth/signup').send({ name: 'B', email: 'b@x.com', password: 'secret-2' });
    expect(second.status).toBe(201);
    expect(second.body.session.userId).not.toBe(first.body.session.userId);
    expect((await c.get('/api/auth/me').set('Authorization', `Bearer ${second.body.token}`)).body.account.email).toBe('b@x.com');
  });

  it('validates sign-up input', async () => {
    const { app } = makeApp();
    const c = client(app);
    expect((await c.post('/api/auth/signup').send({ name: '', email: 'x', password: '123' })).status).toBe(400);
  });
});

describe('pins', () => {
  const pin = { id: 'https://example.com/a', kind: 'article', title: 'A', site: 'example.com', summary: 's', url: 'https://example.com/a', deckId: 'd1', deckNo: 3, deckTitle: 'Deck' };

  it('are saved per user and follow the account across devices', async () => {
    const { app } = makeApp();
    const phone = client(app);
    expect((await phone.put('/api/pins').send(pin)).status).toBe(204);
    await phone.put('/api/pins').send({ ...pin, id: 'vid1', kind: 'video', videoId: 'vid1', url: 'https://www.youtube.com/watch?v=vid1', card: 7 });
    await phone.put('/api/pins').send(pin); // again: no duplicate
    const mine = await phone.get('/api/pins');
    expect(mine.body.pins).toHaveLength(2);
    expect(mine.body.pins.find((p: { id: string }) => p.id === 'vid1')).toMatchObject({ kind: 'video', videoId: 'vid1', card: 7 });

    const up = await phone.post('/api/auth/signup').send({ name: 'P', email: 'p@x.com', password: 'secret-1' });
    const tablet = client(app);
    expect((await tablet.get('/api/pins')).body.pins).toHaveLength(0);
    expect((await tablet.get('/api/pins').set('Authorization', `Bearer ${up.body.token}`)).body.pins).toHaveLength(2);

    expect((await phone.delete(`/api/pins/${encodeURIComponent(pin.id)}`)).status).toBe(204);
    expect((await phone.get('/api/pins')).body.pins).toHaveLength(1);
  });

  it('rejects a malformed pin', async () => {
    const { app } = makeApp();
    expect((await client(app).put('/api/pins').send({ id: 'x', kind: 'thing' })).status).toBe(400);
  });
});
