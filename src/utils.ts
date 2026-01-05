export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(t);
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });
}

export function jitteredBackoffMs(attempt: number): number {
  const base = Math.min(30_000, 1_000 * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

