import { Router } from 'express';
import { completeOnboardingSchema, onboardingMessageSchema, tailorRequestSchema, type ProfileResponse } from '@curiox/shared';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { handleOnboardingMessage, onboardingState, userProfile } from '../services/onboarding/steps';
import { completeOnboarding, tailor } from '../services/onboarding/reader';
import type { Services } from '../services';

export function onboardingRouter(services: Services): Router {
  const router = Router();

  // POST /api/onboarding/tailor: questions 2 to 6 for the interests picked in question 1.
  router.post('/tailor', quotaLimiter(20), async (req, res) => {
    const body = tailorRequestSchema.parse(req.body ?? {});
    res.json(await tailor(body.interests, services.llm, body.answers ?? {}));
  });

  // POST /api/onboarding/complete: save the finished reader card as the profile.
  router.post('/complete', async (req, res) => {
    const body = completeOnboardingSchema.parse(req.body ?? {});
    const user = await completeOnboarding(currentUser(req), body.reader);
    const payload: ProfileResponse = { profile: userProfile(user), onboarding: onboardingState(user) };
    res.json(payload);
  });

  // POST /api/onboarding/message: one turn of the older conversational onboarding.
  router.post('/message', async (req, res) => {
    const body = onboardingMessageSchema.parse(req.body ?? {});
    res.json(await handleOnboardingMessage(currentUser(req), body, services.llm));
  });
  return router;
}
