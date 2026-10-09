import { Router } from 'express';
import type { SessionResponse } from '@lumora/shared';
import { currentUser } from '../middleware/session';
import { onboardingState, userProfile } from '../services/onboarding/steps';

export function sessionRouter(): Router {
  const router = Router();
  // POST /api/session: create or load the user for this device ID.
  router.post('/', (req, res) => {
    const user = currentUser(req);
    const body: SessionResponse = {
      userId: user._id.toString(),
      deviceId: user.deviceId,
      profile: userProfile(user),
      onboarding: onboardingState(user),
      isNew: Boolean(req.isNewUser),
    };
    res.status(req.isNewUser ? 201 : 200).json(body);
  });
  return router;
}
