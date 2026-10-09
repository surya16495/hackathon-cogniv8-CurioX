// Anonymous identity: the client generates a device ID once, keeps it in storage,
// and sends it as the X-Device-Id header. The user is created on first sight.
import type { RequestHandler } from 'express';
import { DEVICE_ID_HEADER, LIMITS } from '@lumora/shared';
import { User } from '../db/models';
import { unauthorized } from '../utils/errors';

export const deviceSession: RequestHandler = async (req, _res, next) => {
  const deviceId = req.get(DEVICE_ID_HEADER)?.trim();
  if (!deviceId) throw unauthorized(`Missing ${DEVICE_ID_HEADER} header`);
  if (!LIMITS.deviceIdPattern.test(deviceId)) {
    throw unauthorized(`${DEVICE_ID_HEADER} must be 8-128 letters, digits, "-" or "_"`);
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
  req.deviceId = deviceId;
  req.isNewUser = isNew;
  next();
};

/** Narrow req.user for route handlers that run after deviceSession. */
export function currentUser(req: Express.Request) {
  if (!req.user) throw unauthorized('No session');
  return req.user;
}
