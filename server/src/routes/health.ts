import { Router } from 'express';
import type { HealthResponse } from '@lumora/shared';
import { dbState } from '../db/connect';
import type { Services } from '../services';

// No device ID and no DB query: this is what the web app calls to wake Render.
export function healthRouter(services: Services): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      db: dbState(),
      demoMode: services.llm.demoMode,
      providers: { ...services.llm.configured(), tavily: services.tavilyConfigured },
      version: process.env.npm_package_version ?? '0.1.0',
    };
    res.set('Cache-Control', 'no-store').json(body);
  });
  return router;
}
