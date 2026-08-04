import type { AuthConfig, FlashClientConfig, HttpResponse, RateLimitInfo, RequestConfig } from './types.js';
import { HttpError, NetworkError, RateLimitError, TimeoutError } from './errors.js';
import { computeDelay, getRetryConfig, isRetryable, sleep } from './retry.js';

function normalizeBaseUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('baseUrl is required and must be a non-empty string');
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('baseUrl must use http or https protocol');
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch (e) {
    if (e instanceof Error && e.message.includes('baseUrl must use')) throw e;
    throw new Error(`Invalid baseUrl: ${url}`);
  }
}

function applyAuth(headers: Headers, auth?: AuthConfig): Headers | Promise<Headers> {
  if (!auth) return headers;
  switch (auth.type) {
    case 'bearer':
      headers.set('Authorization', `Bearer ${auth.token}`);
      return headers;
    case 'header':
      headers.set(auth.name, auth.value);
      return headers;
    case 'custom':
      return auth.interceptor(headers);
  }
}

function parseRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');

  if (limit === null || remaining === null || reset === null) return null;

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    reset: parseInt(reset, 10),
  };
}

function getRetryAfter(headers: Headers): number | null {
  const value = headers.get('Retry-After');
  if (!value) return null;
  const seconds = parseInt(value, 10);
  return isNaN(seconds) ? null : seconds;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly auth?: AuthConfig;
  private readonly defaultTimeout: number;
  private readonly retries: number;
  private readonly debug: boolean;
  private readonly logger: (message: string, context?: Record<string, unknown>) => void;

  constructor(config: FlashClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.auth = config.auth;
    this.defaultTimeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? console.debug;
  }

  private log(message: string, context?: Record<string, unknown>): void {
    if (this.debug) {
      this.logger(`[flashapi] ${message}`, context);
    }
  }

  async request<T>(config: RequestConfig): Promise<HttpResponse<T>> {
    const url = this.buildUrl(config.path, config.params);
    const timeout = config.timeout ?? this.defaultTimeout;
    const retryConfig = getRetryConfig(this.retries);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      const controller = new AbortController();
      const signal = config.signal;

      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }

      signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

      const timer = setTimeout(() => controller.abort(new TimeoutError(timeout)), timeout);

      try {
        this.log(`${config.method} ${config.path}`, { attempt });

        const headers = new Headers({ 'Content-Type': 'application/json' });
        const authedHeaders = await applyAuth(headers, this.auth);

        const response = await fetch(url, {
          method: config.method,
          headers: authedHeaders,
          body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        const rateLimit = parseRateLimit(response.headers);

        if (response.status === 429) {
          const retryAfter = getRetryAfter(response.headers);
          const body = await response.json().catch(() => null);

          if (attempt < retryConfig.maxRetries) {
            const delay = computeDelay(attempt, retryConfig, retryAfter);
            this.log(`Rate limited, retrying in ${Math.round(delay)}ms`);
            await sleep(delay, signal);
            continue;
          }

          throw new RateLimitError(
            response.statusText,
            body,
            rateLimit ?? { limit: 0, remaining: 0, reset: 0 },
            retryAfter,
          );
        }

        if (response.status === 204) {
          return { data: undefined as T, status: 204, headers: response.headers, rateLimit };
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null);

          if (isRetryable(response.status) && attempt < retryConfig.maxRetries) {
            const delay = computeDelay(attempt, retryConfig);
            this.log(`HTTP ${response.status}, retrying in ${Math.round(delay)}ms`);
            await sleep(delay, signal);
            lastError = new HttpError(response.status, response.statusText, body);
            continue;
          }

          throw new HttpError(response.status, response.statusText, body);
        }

        if (config.responseType === 'blob') {
          const blob = await response.blob();
          return { data: blob as T, status: response.status, headers: response.headers, rateLimit };
        }

        const data = await response.json() as T;
        return { data, status: response.status, headers: response.headers, rateLimit };

      } catch (error) {
        clearTimeout(timer);

        if (error instanceof TimeoutError || error instanceof HttpError || error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          if (config.signal?.aborted) throw error;
          throw new TimeoutError(timeout);
        }

        if (attempt < retryConfig.maxRetries) {
          const delay = computeDelay(attempt, retryConfig);
          this.log(`Network error, retrying in ${Math.round(delay)}ms`);
          await sleep(delay, config.signal);
          lastError = new NetworkError(error);
          continue;
        }

        throw new NetworkError(error);
      }
    }

    throw lastError ?? new NetworkError(new Error('Max retries exceeded'));
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const url = new URL(`${this.baseUrl}/${encodedPath}/`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}
