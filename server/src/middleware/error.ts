import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Once an SSE stream has started the status is already sent; the chat route reports errors as events.
  if (res.headersSent) {
    console.error(`[error] after headers sent on ${req.method} ${req.path}:`, err);
    if (!res.writableEnded) res.end();
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  // body-parser errors
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Invalid ${err.path}` } });
    return;
  }
  if (err?.message?.startsWith('CORS')) {
    res.status(403).json({ error: { code: 'CORS_FORBIDDEN', message: err.message } });
    return;
  }

  console.error(`[error] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
};
