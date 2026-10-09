import type { Response } from 'express';
import type { SseEvent } from '@lumora/shared';

export interface SseChannel {
  send: <E extends SseEvent>(event: E['event'], data: E['data']) => void;
  close: () => void;
  readonly closed: boolean;
}

/**
 * Turn an Express response into a Server-Sent Events channel.
 * Sends a comment heartbeat so proxies (Render, Vercel rewrites) do not cut an idle stream.
 */
export function openSse(res: Response, heartbeatMs = 15000): SseChannel {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, heartbeatMs);
  heartbeat.unref();

  const stop = () => {
    closed = true;
    clearInterval(heartbeat);
  };
  res.on('close', stop);

  return {
    send(event, data) {
      if (closed || res.writableEnded) return;
      res.write(formatSse(event, data));
    },
    close() {
      if (closed && res.writableEnded) return;
      stop();
      if (!res.writableEnded) res.end();
    },
    get closed() {
      return closed || res.writableEnded;
    },
  };
}

export function formatSse(event: string, data: unknown): string {
  // JSON.stringify never emits raw newlines, so one `data:` line is always enough.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Parse an SSE text stream into events. Used by tests and the smoke script. */
export function parseSse(text: string): { event: string; data: unknown }[] {
  const out: { event: string; data: unknown }[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':') || !line) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    const raw = dataLines.join('\n');
    try {
      out.push({ event, data: JSON.parse(raw) });
    } catch {
      out.push({ event, data: raw });
    }
  }
  return out;
}
