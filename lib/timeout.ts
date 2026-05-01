// Race a promise against a timer so a hung upstream call rejects cleanly
// into a caller's catch block instead of silently consuming the function's
// remaining lifetime. Used to guard Document AI / Claude calls inside
// background `after()` blocks where Vercel will kill the function at
// `maxDuration` and skip any catch handlers if a request is still pending.

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
