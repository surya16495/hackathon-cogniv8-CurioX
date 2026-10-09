// Identity. Anonymous by default: the client generates a device ID once, keeps it in storage, and
// sends it as the X-Device-Id header; the user is created on first sight. A signed-in client also
// sends `Authorization: Bearer <token>`, which wins: the account's user is used on any device.
import type { RequestHandler } from 'express';
import { DEVICE_ID_HEADER, LIMITS } from '@curiox/shared';
import { User } from '../db/models';
import { verifyToken } from '../services/auth';
import { unauthorized } from '../utils/errors';

export function sessionMiddleware(authSecret: string): RequestHandler {
  return async (req, _res, next) => {
    const deviceId = req.get(DEVICE_ID_HEADER)?.trim();
    if (!deviceId) throw unauthorized(`Missing ${DEVICE_ID_HEADER} header`);
    if (!LIMITS.deviceIdPattern.test(deviceId)) {
      throw unauthorized(`${DEVICE_ID_HEADER} must be 8-128 letters, digits, "-" or "_"`);
    }
    req.deviceId = deviceId;

    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (bearer) {
      const userId = verifyToken(authSecret, bearer);
      const account = userId && /^[a-f0-9]{24}$/i.test(userId) ? await User.findById(userId) : null;
      // A stale token (expired, or from before a restart) is ignored rather than refused:
      // the client notices `account: null` on the session and signs in again.
      if (account?.email) {
        req.user = account;
        req.isNewUser = false;
        return next();
      }
    }

    let user = await User.findOne({ deviceId });
    let isNew = false;
    if (!user) {
      try {
        user = await User.create({ deviceId });
        isNew = true;
      } catch (err) {
        // Two first requests from the same device raced; the other one created the user.
        if ((err as { code?: number }).code !== 11000) throw err;
        user = await User.findOne({ deviceId });
      }
    }
    if (!user) throw new Error('Could not load or create user');

    req.user = user;
    req.isNewUser = isNew;
    next();
  };
}

/** Narrow req.user for route handlers that run after the session middleware. */
export function currentUser(req: Express.Request) {
  if (!req.user) throw unauthorized('No session');
  return req.user;
}
