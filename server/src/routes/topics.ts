import { Router } from 'express';
import { currentUser } from '../middleware/session';
import { suggestTopics } from '../services/learn/topics';
import { userProfile } from '../services/onboarding/steps';
import type { Services } from '../services';

export function topicsRouter(services: Services): Router {
  const router = Router();
  // GET /api/topics/suggested: 4 to 6 starter topics from the profile's interests.
  router.get('/suggested', async (req, res) => {
    const user = currentUser(req);
    res.json(await suggestTopics(user._id.toString(), userProfile(user), services.llm));
  });
  return router;
}
