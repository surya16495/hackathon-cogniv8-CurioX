import type { UserDoc } from '../db/models/User';

declare global {
  namespace Express {
    interface Request {
      /** Set by the deviceSession middleware. */
      user?: UserDoc;
      deviceId?: string;
      isNewUser?: boolean;
    }
  }
}

export {};
