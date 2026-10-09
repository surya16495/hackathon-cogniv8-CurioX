export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message: string) => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

/** True when an error came from an AbortSignal (client disconnect or our own timeout). */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError' || name === 'APIUserAbortError';
}

/** Short, log-safe description of an upstream error (never includes keys or full bodies). */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    const msg = err.message.length > 200 ? `${err.message.slice(0, 200)}…` : err.message;
    return status ? `${status} ${msg}` : `${err.name}: ${msg}`;
  }
  return String(err);
}
