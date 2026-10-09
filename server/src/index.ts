import { loadEnv } from './config/env';
import { connectDb, disconnectDb } from './db/connect';
import { createApp } from './app';
import { buildServices } from './services';

async function main() {
  const env = loadEnv();
  const services = buildServices(env);
  const app = createApp(env, services);

  // Listen first so Render's health check and the web app's wake-up call succeed
  // while MongoDB is still connecting; /api/health reports the DB state.
  const server = app.listen(env.PORT, () => {
    const providers = services.llm.configured();
    console.info(
      `[curiox] API on http://localhost:${env.PORT} | demoMode=${env.DEMO_MODE} gemini=${providers.gemini} groq=${providers.groq} tavily=${services.tavilyConfigured}`,
    );
  });
  // SSE answers can run long; do not let Node cut them off.
  server.requestTimeout = 0;
  server.keepAliveTimeout = 65_000;

  await connectDb(env.MONGODB_URI);

  const shutdown = (signal: string) => {
    console.info(`[curiox] ${signal} received, shutting down`);
    server.close(() => {
      disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[curiox] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
