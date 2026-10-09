import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { DEVICE_ID_HEADER } from '@curiox/shared';
import type { Env } from './config/env';
import type { Services } from './services';
import { deviceSession } from './middleware/session';
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

export function createApp(env: Pick<Env, 'CORS_ORIGIN' | 'NODE_ENV'>, services: Services): Express {
  const app = express();
  app.disable('x-powered-by');
  // Render and Vercel sit behind one proxy hop; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header: curl, the smoke script, the native app. Allowed.
        if (!origin || env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin.replace(/\/$/, ''))) {
          return cb(null, true);
        }
        cb(new Error(`CORS: origin ${origin} is not allowed`));
      },
      allowedHeaders: ['Content-Type', DEVICE_ID_HEADER],
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
  app.use('/api/onboarding', deviceSession, onboardingRouter(services));
  app.use('/api/profile', deviceSession, profileRouter());
  app.use('/api/topics', deviceSession, topicsRouter(services));
  app.use('/api/chat', deviceSession, chatRouter(services));
  app.use('/api/conversations', deviceSession, conversationsRouter());
  app.use('/api/learn', deviceSession, learnRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
