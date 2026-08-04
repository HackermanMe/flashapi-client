export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

export function computeDelay(attempt: number, config: RetryConfig = DEFAULT_CONFIG, retryAfter?: number | null): number {
  if (retryAfter && retryAfter > 0) {
    return retryAfter * 1000;
  }
  const exponential = config.baseDelay * Math.pow(2, attempt);
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(jitter, config.maxDelay);
}

export function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function getRetryConfig(retries?: number): RetryConfig {
  return {
    ...DEFAULT_CONFIG,
    maxRetries: retries ?? DEFAULT_CONFIG.maxRetries,
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
