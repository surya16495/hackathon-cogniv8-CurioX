import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { User } from '../src/db/models';
import { client, makeApp, newDevice } from './helpers';

describe('health, errors and CORS', () => {
  const { app } = makeApp();

  it('GET /api/health answers without a device ID', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'connected', demoMode: true });
    expect(res.body.providers).toEqual({ gemini: false, groq: false, tavily: false });
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400 INVALID_JSON', async () => {
    const res = await client(app).post('/api/chat').set('Content-Type', 'application/json').send('{"message": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('oversized bodies return 413', async () => {
    const res = await client(app).post('/api/chat').send({ message: 'x'.repeat(40_000) });
    expect(res.status).toBe(413);
  });

  it('allows the configured origin and rejects others', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.status).toBe(403);
  });

  it('CORS preflight allows the device header', async () => {
    const res = await request(app)
      .options('/api/chat')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-device-id');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/x-device-id/i);
  });
});

describe('POST /api/session', () => {
  const { app } = makeApp();

  it('rejects a missing device ID', async () => {
    const res = await request(app).post('/api/session');
    expect(res.status).toBe(401);
  });

  it.each(['short', 'has spaces in it', 'semi;colon-1234', 'x'.repeat(129)])('rejects invalid device ID %j', async (id) => {
    const res = await request(app).post('/api/session').set('X-Device-Id', id);
    expect(res.status).toBe(401);
  });

  it('creates a user once, then loads it', async () => {
    const c = client(app);
    const first = await c.post('/api/session');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ isNew: true, deviceId: c.deviceId, onboarding: { status: 'not_started', step: 0, totalSteps: 6 } });
    expect(first.body.profile).toEqual({ interests: [], knowledgeLevels: [], goals: [], explanationStyle: '', tone: '', curiosities: [] });

    const second = await c.post('/api/session');
    expect(second.status).toBe(200);
    expect(second.body.isNew).toBe(false);
    expect(second.body.userId).toBe(first.body.userId);
  });

  it('concurrent first requests from one device create exactly one user', async () => {
    const deviceId = newDevice();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/session').set('X-Device-Id', deviceId)),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.userId)).size).toBe(1);
    expect(await User.countDocuments({ deviceId })).toBe(1);
  });
});
