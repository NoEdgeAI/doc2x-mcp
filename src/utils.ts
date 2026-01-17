export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(t);
      reject(new Error('aborted'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

export function jitteredBackoffMs(attempt: number): number {
  const capMs = 30_000;
  const baseMs = 1_000;

  const n = Math.max(0, Math.floor(attempt));
  const expMs = Math.min(capMs, baseMs * Math.pow(2, n));

  // Exponential backoff with jitter (bounded to [exp/2, exp)).
  const half = Math.max(1, Math.floor(expMs / 2));
  return half + Math.floor(Math.random() * half);
}
