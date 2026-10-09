// Accounts: scrypt password hashes and signed, expiring tokens. No extra dependencies.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_DAYS = 90;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sig = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(secret: string, userId: string, now = Date.now()): string {
  const body = b64(`${userId}.${now + TOKEN_DAYS * 86_400_000}`);
  return `${body}.${sig(secret, body)}`;
}

/** The user id inside a valid, unexpired token, else null. */
export function verifyToken(secret: string, token: string, now = Date.now()): string | null {
  const [body, s] = token.split('.');
  if (!body || !s) return null;
  const want = sig(secret, body);
  if (want.length !== s.length || !timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  const [userId, exp] = Buffer.from(body, 'base64url').toString().split('.');
  if (!userId || !exp || Number(exp) < now) return null;
  return userId;
}
