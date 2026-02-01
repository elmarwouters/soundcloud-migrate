export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const backoffDelay = (attempt: number, baseMs = 500, capMs = 10_000) => {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  const jitter = Math.random() * 0.3 * exp;
  return Math.round(exp + jitter);
};

export const withRetries = async <T>(
  fn: () => Promise<T>,
  options: { retries: number; baseMs?: number; capMs?: number }
): Promise<T> => {
  const { retries, baseMs, capMs } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const delay = backoffDelay(attempt, baseMs, capMs);
      await sleep(delay);
    }
  }
  throw lastError;
};
