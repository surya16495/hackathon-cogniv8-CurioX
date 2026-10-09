import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { signInSchema, signUpSchema, type Account, type AuthResponse } from '@curiox/shared';
import { User } from '../db/models';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { hashPassword, signToken, verifyPassword } from '../services/auth';
import { badRequest, unauthorized } from '../utils/errors';
import { sessionBody } from './session';

export function authRouter(authSecret: string): Router {
  const router = Router();

  // POST /api/auth/signup: the device's anonymous user becomes the account, so the reader card,
  // issues and pins made before signing up are kept. A device that already has an account makes a new user.
  router.post('/signup', quotaLimiter(10), async (req, res) => {
    const body = signUpSchema.parse(req.body ?? {});
    if (await User.exists({ email: body.email })) throw badRequest('There is already an account with that email. Sign in instead.');
    const current = currentUser(req);
    const fields = { email: body.email, name: body.name, passwordHash: hashPassword(body.password) };
    const user = current.email
      ? await User.create({ deviceId: `acct-${randomBytes(12).toString('hex')}`, ...fields })
      : await User.findByIdAndUpdate(current._id, { $set: fields }, { new: true });
    if (!user) throw new Error('Could not create the account');
    const account: Account = { name: user.name ?? '', email: user.email! };
    const payload: AuthResponse = { token: signToken(authSecret, user._id.toString()), account, session: sessionBody(user) };
    res.status(201).json(payload);
  });

  // POST /api/auth/signin
  router.post('/signin', quotaLimiter(10), async (req, res) => {
    const body = signInSchema.parse(req.body ?? {});
    const user = await User.findOne({ email: body.email });
    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) throw unauthorized('Wrong email or password.');
    const account: Account = { name: user.name ?? '', email: user.email! };
    const payload: AuthResponse = { token: signToken(authSecret, user._id.toString()), account, session: sessionBody(user) };
    res.json(payload);
  });

  // GET /api/auth/me: who the token says we are (null when anonymous).
  router.get('/me', (req, res) => {
    const user = currentUser(req);
    res.json({ account: user.email ? { name: user.name ?? '', email: user.email } : null });
  });

  return router;
}
