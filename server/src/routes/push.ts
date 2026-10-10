import { Router } from 'express';
import { pushTokenSchema } from '@curiox/shared';
import { User } from '../db/models';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { checkUserUpdates, pushStatus } from '../services/push';
import type { Services } from '../services';

export function pushRouter(services: Services): Router {
  const router = Router();

  // GET /api/push: how many phones are registered and which topics are watched.
  router.get('/', (req, res) => res.json(pushStatus(currentUser(req))));

  // POST /api/push/token: register this phone (idempotent).
  router.post('/token', async (req, res) => {
    const body = pushTokenSchema.parse(req.body ?? {});
    const user = currentUser(req);
    const has = (user.pushTokens ?? []).some((t) => t.token === body.token);
    const updated = has ? user : await User.findByIdAndUpdate(user._id, { $push: { pushTokens: { token: body.token, platform: body.platform ?? '', addedAt: new Date() } } }, { new: true });
    res.json(pushStatus(updated ?? user));
  });

  // DELETE /api/push/token: forget this phone.
  router.delete('/token', async (req, res) => {
    const body = pushTokenSchema.parse(req.body ?? {});
    const updated = await User.findByIdAndUpdate(currentUser(req)._id, { $pull: { pushTokens: { token: body.token } } }, { new: true });
    res.json(pushStatus(updated ?? currentUser(req)));
  });

  // POST /api/push/check: look for updates on the watched topics right now.
  router.post('/check', quotaLimiter(6), async (req, res) => {
    res.json(await checkUserUpdates(currentUser(req), services));
  });

  return router;
}
