import { Router } from 'express';
import { signalSchema, type SignalResponse } from '@curiox/shared';
import { currentUser } from '../middleware/session';
import { recordSignal } from '../services/interests';

/** POST /api/signals: the reader read, asked or talked about a topic. */
export function signalsRouter(): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const body = signalSchema.parse(req.body ?? {});
    const payload: SignalResponse = await recordSignal(currentUser(req), body.topic, body.kind);
    res.json(payload);
  });
  return router;
}
