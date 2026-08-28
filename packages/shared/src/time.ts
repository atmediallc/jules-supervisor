export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("Operation aborted"));
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Operation aborted"));
        },
        { once: true },
      );
    }
  });
}

export function calculateBackoff(
  attempt: number,
  baseMs = 500,
  maxMs = 15000,
  jitter = true,
): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  if (!jitter) return exponential;
  // Full jitter: uniformly distributed between 0 and exponential backoff
  return Math.floor(Math.random() * exponential);
}
