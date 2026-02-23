import { setTimeout as delay } from 'node:timers/promises';

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await delay(ms, undefined, signal ? { signal } : undefined);
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
