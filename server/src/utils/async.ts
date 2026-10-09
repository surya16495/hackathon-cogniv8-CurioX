export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/** Reject with a TimeoutError if `promise` does not settle within `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Iterate `source`, aborting `controller` if no chunk arrives for `idleMs`.
 * A total timeout would cut off long but healthy answers; an idle timeout only catches stalls.
 */
export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  controller: AbortController,
): AsyncGenerator<T> {
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const err = new Error(`No data for ${idleMs}ms`);
      err.name = 'TimeoutError';
      controller.abort(err);
    }, idleMs);
  };
  // Race every chunk against the abort, so a stream that ignores its signal still cannot hang us.
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(controller.signal.reason);
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => undefined);

  const iterator = source[Symbol.asyncIterator]();
  arm();
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), aborted]);
      if (next.done) break;
      arm();
      yield next.value;
    }
  } finally {
    clearTimeout(timer);
    // Ask the source to clean up, but do not wait on a source that may be stuck.
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
