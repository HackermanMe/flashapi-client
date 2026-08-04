import type { RateLimitInfo } from './types.js';

export class FlashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlashError';
  }
}

export class HttpError extends FlashError {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: string }).error
      : `HTTP ${status}: ${statusText}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export class TimeoutError extends FlashError {
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

export class RateLimitError extends HttpError {
  readonly rateLimit: RateLimitInfo;
  readonly retryAfter: number | null;

  constructor(statusText: string, body: unknown, rateLimit: RateLimitInfo, retryAfter: number | null) {
    super(429, statusText, body);
    this.name = 'RateLimitError';
    this.rateLimit = rateLimit;
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends FlashError {
  readonly originalCause: unknown;

  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Network error';
    super(message);
    this.name = 'NetworkError';
    this.originalCause = cause;
  }
}
