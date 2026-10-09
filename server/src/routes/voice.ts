import express, { Router } from 'express';
import type { TranscribeResponse } from '@curiox/shared';
import { quotaLimiter } from '../middleware/rateLimit';
import { AUDIO_TYPES, baseMime } from '../services/voice/stt';
import { AppError, badRequest, describeError } from '../utils/errors';
import type { Services } from '../services';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // about 2-5 minutes of compressed speech

export function voiceRouter(services: Services): Router {
  const router = Router();

  // POST /api/voice/transcribe: raw audio body (Content-Type audio/webm, audio/mp4, …) -> { text }.
  router.post(
    '/transcribe',
    quotaLimiter(30),
    express.raw({ type: (req) => baseMime(req.headers['content-type']).startsWith('audio/'), limit: MAX_AUDIO_BYTES }),
    async (req, res) => {
      if (!services.stt.available()) {
        throw new AppError(503, 'VOICE_UNAVAILABLE', 'Voice typing is not available on this server. Please type instead.');
      }
      const mime = baseMime(req.get('content-type'));
      if (!AUDIO_TYPES[mime]) throw badRequest(`Unsupported audio type "${mime || 'none'}"`);
      const audio = req.body;
      if (!Buffer.isBuffer(audio) || audio.length < 512) throw badRequest('No audio received');

      const lang = req.get('x-voice-lang')?.trim().toLowerCase().slice(0, 2);
      try {
        const text = await services.stt.transcribe(audio, mime, lang && /^[a-z]{2}$/.test(lang) ? lang : undefined);
        const body: TranscribeResponse = { text };
        res.json(body);
      } catch (err) {
        console.warn(`[voice] transcription failed (${describeError(err)})`);
        throw new AppError(502, 'TRANSCRIBE_FAILED', "Couldn't catch that. Please try again.");
      }
    },
  );

  return router;
}
