import { Router } from 'express';
import { pinSchema, type PinsResponse } from '@curiox/shared';
import { PinModel, toPin } from '../db/models';
import { currentUser } from '../middleware/session';

/** Pins are saved per user: per account once signed in, per device before that. */
export function pinsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const pins = await PinModel.find({ userId: currentUser(req)._id }).sort({ createdAt: -1 }).limit(500);
    const body: PinsResponse = { pins: pins.map(toPin) };
    res.json(body);
  });

  // PUT /api/pins: add (or refresh) one pin.
  router.put('/', async (req, res) => {
    const pin = pinSchema.parse(req.body ?? {});
    const userId = currentUser(req)._id;
    const { id, videoId, card, ...rest } = pin;
    await PinModel.updateOne({ userId, pinId: id }, { $set: { ...rest, videoId: videoId ?? null, card: card ?? null }, $setOnInsert: { userId, pinId: id } }, { upsert: true });
    res.status(204).end();
  });

  router.delete('/:id', async (req, res) => {
    await PinModel.deleteOne({ userId: currentUser(req)._id, pinId: req.params.id });
    res.status(204).end();
  });

  return router;
}
