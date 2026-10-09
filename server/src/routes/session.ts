import { Router } from 'express';
import type { SessionResponse } from '@curiox/shared';
import type { UserDoc } from '../db/models';
import { currentUser } from '../middleware/session';
import { onboardingState, userProfile } from '../services/onboarding/steps';

export function sessionBody(user: UserDoc, isNew = false): SessionResponse {
  return {
    userId: user._id.toString(),
    deviceId: user.deviceId,
    profile: userProfile(user),
    onboarding: onboardingState(user),
    isNew,
    account: user.email ? { name: user.name ?? '', email: user.email } : null,
  };
}

export function sessionRouter(): Router {
  const router = Router();
  // POST /api/session: create or load the user for this device ID (or the signed-in account).
  router.post('/', (req, res) => {
    const user = currentUser(req);
    res.status(req.isNewUser ? 201 : 200).json(sessionBody(user, Boolean(req.isNewUser)));
  });
  return router;
}
