import { Router } from 'express';
import { onboardingMessageSchema } from '@lumora/shared';
import { currentUser } from '../middleware/session';
import { handleOnboardingMessage } from '../services/onboarding/steps';
import type { Services } from '../services';

export function onboardingRouter(services: Services): Router {
  const router = Router();
  // POST /api/onboarding/message: one onboarding turn.
  router.post('/message', async (req, res) => {
    const body = onboardingMessageSchema.parse(req.body ?? {});
    res.json(await handleOnboardingMessage(currentUser(req), body, services.llm));
  });
  return router;
}
