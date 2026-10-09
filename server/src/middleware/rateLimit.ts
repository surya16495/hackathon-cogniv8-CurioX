import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { DEVICE_ID_HEADER } from '@curiox/shared';

const handler: Options['handler'] = (_req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
  });
};

// Judges on one venue Wi-Fi share an IP, so the IP-wide limit is generous.
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler,
});

/** Per-device limit for routes that spend AI or search quota. */
export function quotaLimiter(limitPerMinute: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const device = req.get(DEVICE_ID_HEADER)?.trim();
      return device ? `d:${device}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    handler,
  });
}
