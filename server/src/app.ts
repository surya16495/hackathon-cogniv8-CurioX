import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { DEVICE_ID_HEADER } from '@curiox/shared';
import type { Env } from './config/env';
import type { Services } from './services';
import { randomBytes } from 'node:crypto';
import { sessionMiddleware } from './middleware/session';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRouter } from './routes/health';
import { sessionRouter } from './routes/session';
import { onboardingRouter } from './routes/onboarding';
import { profileRouter } from './routes/profile';
import { topicsRouter } from './routes/topics';
import { chatRouter } from './routes/chat';
import { conversationsRouter } from './routes/conversations';
import { learnRouter } from './routes/learn';
import { voiceRouter } from './routes/voice';
import { authRouter } from './routes/auth';
import { pinsRouter } from './routes/pins';
import { signalsRouter } from './routes/signals';
import { decksRouter, issuesRouter, talkRouter } from './routes/issues';
import { pushRouter } from './routes/push';

export function createApp(env: Pick<Env, 'CORS_ORIGIN' | 'NODE_ENV'> & { AUTH_SECRET?: string }, services: Services): Express {
  const app = express();
  const authSecret = env.AUTH_SECRET ?? randomBytes(32).toString('hex');
  if (!env.AUTH_SECRET && env.NODE_ENV === 'production') console.warn('[auth] AUTH_SECRET is not set: sign-ins will not survive a restart.');
  const deviceSession = sessionMiddleware(authSecret);
  app.disable('x-powered-by');
  // Render and Vercel sit behind one proxy hop; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header: curl, the smoke script, the native app. Allowed.
        const clean = origin?.replace(/\/$/, '') ?? '';
        if (!origin || env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(clean)) return cb(null, true);
        // Outside production, any localhost port: Expo's web preview picks whatever port is free.
        if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} is not allowed`));
      },
      allowedHeaders: ['Content-Type', 'Authorization', DEVICE_ID_HEADER, 'X-Voice-Lang'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );
  if (env.NODE_ENV !== 'test') app.use(globalLimiter);
  app.use(express.json({ limit: '32kb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'CurioX API', health: '/api/health' });
  });
  app.use('/api/health', healthRouter(services));

  // Everything below needs an X-Device-Id header.
  app.use('/api/session', deviceSession, sessionRouter());
  app.use('/api/auth', deviceSession, authRouter(authSecret));
  app.use('/api/pins', deviceSession, pinsRouter());
  app.use('/api/signals', deviceSession, signalsRouter());
  app.use('/api/onboarding', deviceSession, onboardingRouter(services));
  app.use('/api/profile', deviceSession, profileRouter());
  app.use('/api/topics', deviceSession, topicsRouter(services));
  app.use('/api/chat', deviceSession, chatRouter(services));
  app.use('/api/conversations', deviceSession, conversationsRouter());
  app.use('/api/learn', deviceSession, learnRouter(services));
  app.use('/api/voice', deviceSession, voiceRouter(services));
  app.use('/api/issues', deviceSession, issuesRouter(services));
  app.use('/api/decks', deviceSession, decksRouter(services));
  app.use('/api/talk', deviceSession, talkRouter(services));
  app.use('/api/push', deviceSession, pushRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
