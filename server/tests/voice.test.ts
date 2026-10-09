import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { SttService } from '../src/services/voice/stt';
import { baseMime } from '../src/services/voice/stt';
import { client, makeApp, newDevice } from './helpers';

const audio = Buffer.alloc(4096, 1);

function fakeStt(impl: (audio: Buffer, mime: string, lang?: string) => Promise<string>): SttService & { calls: { size: number; mime: string; lang?: string }[] } {
  const calls: { size: number; mime: string; lang?: string }[] = [];
  return {
    calls,
    available: () => true,
    async transcribe(a, mime, lang) {
      calls.push({ size: a.length, mime, lang });
      return impl(a, mime, lang);
    },
  };
}

describe('POST /api/voice/transcribe', () => {
  it('transcribes raw audio and passes the language hint', async () => {
    const stt = fakeStt(async () => 'simplify that please');
    const { app } = makeApp({ stt });
    const res = await client(app)
      .post('/api/voice/transcribe')
      .set('Content-Type', 'audio/webm;codecs=opus')
      .set('X-Voice-Lang', 'en-IN')
      .send(audio);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'simplify that please' });
    expect(stt.calls).toEqual([{ size: 4096, mime: 'audio/webm', lang: 'en' }]);
  });

  it('needs a device ID', async () => {
    const { app } = makeApp({ stt: fakeStt(async () => 'x') });
    const res = await request(app).post('/api/voice/transcribe').set('Content-Type', 'audio/webm').send(audio);
    expect(res.status).toBe(401);
  });

  it('returns 503 when transcription is not configured', async () => {
    const { app } = makeApp();
    const res = await client(app).post('/api/voice/transcribe').set('Content-Type', 'audio/webm').send(audio);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VOICE_UNAVAILABLE');
  });

  it.each([
    ['application/json', JSON.stringify({ a: 1 }), /Unsupported audio type/],
    ['audio/flac', audio, /Unsupported audio type/],
    ['audio/webm', Buffer.alloc(10), /No audio/],
  ])('rejects %s bodies', async (type, body, msg) => {
    const { app } = makeApp({ stt: fakeStt(async () => 'x') });
    const res = await client(app).post('/api/voice/transcribe').set('Content-Type', type).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(msg);
  });

  it('rejects audio over 5 MB', async () => {
    const { app } = makeApp({ stt: fakeStt(async () => 'x') });
    const res = await client(app).post('/api/voice/transcribe').set('Content-Type', 'audio/webm').send(Buffer.alloc(5 * 1024 * 1024 + 10));
    expect(res.status).toBe(413);
  });

  it('turns provider failures into a friendly 502', async () => {
    const { app } = makeApp({ stt: fakeStt(async () => Promise.reject(Object.assign(new Error('boom'), { status: 500 }))) });
    const res = await client(app).post('/api/voice/transcribe').set('Content-Type', 'audio/mp4').send(audio);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRANSCRIBE_FAILED');
  });

  it('ignores a malformed language hint', async () => {
    const stt = fakeStt(async () => 'ok');
    const { app } = makeApp({ stt });
    await client(app, newDevice()).post('/api/voice/transcribe').set('Content-Type', 'audio/ogg').set('X-Voice-Lang', '12').send(audio);
    expect(stt.calls[0]!.lang).toBeUndefined();
  });

  it('baseMime strips parameters and case', () => {
    expect(baseMime('Audio/WebM; codecs=opus')).toBe('audio/webm');
    expect(baseMime(undefined)).toBe('');
  });
});
