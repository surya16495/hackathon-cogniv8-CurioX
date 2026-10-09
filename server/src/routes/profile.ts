import { Router } from 'express';
import { profileUpdateSchema, type ProfileResponse } from '@curiox/shared';
import { Conversation, Message, User } from '../db/models';
import { currentUser } from '../middleware/session';
import { sanitizeProfile } from '../services/onboarding/extract';
import { onboardingState, userProfile } from '../services/onboarding/steps';
import { notFound } from '../utils/errors';

export function profileRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const user = currentUser(req);
    const body: ProfileResponse = { profile: userProfile(user), onboarding: onboardingState(user) };
    res.json(body);
  });

  // PUT /api/profile: any subset of profile fields; the rest are kept.
  router.put('/', async (req, res) => {
    const user = currentUser(req);
    const patch = profileUpdateSchema.parse(req.body ?? {});
    const profile = sanitizeProfile({ ...userProfile(user), ...patch });
    const updated = await User.findByIdAndUpdate(user._id, { $set: { profile } }, { new: true });
    if (!updated) throw notFound('User not found');
    const body: ProfileResponse = { profile: userProfile(updated), onboarding: onboardingState(updated) };
    res.json(body);
  });

  // DELETE /api/profile: clear the profile and restart onboarding.
  // ?history=true also deletes every conversation and message for this device.
  router.delete('/', async (req, res) => {
    const user = currentUser(req);
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { profile: {}, onboarding: { status: 'not_started', step: 0, answers: [], currentQuestion: '' } } },
      { new: true },
    );
    if (!updated) throw notFound('User not found');
    if (req.query.history === 'true') {
      const ids = await Conversation.find({ userId: user._id }).distinct('_id');
      await Message.deleteMany({ conversationId: { $in: ids } });
      await Conversation.deleteMany({ userId: user._id });
    }
    const body: ProfileResponse = { profile: userProfile(updated), onboarding: onboardingState(updated) };
    res.json(body);
  });

  return router;
}
