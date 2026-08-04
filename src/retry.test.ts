import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDelay, isRetryable, getRetryConfig, sleep } from './retry.js';

describe('retry', () => {
  describe('isRetryable', () => {
    it('returns true for 429', () => expect(isRetryable(429)).toBe(true));
    it('returns true for 502', () => expect(isRetryable(502)).toBe(true));
    it('returns true for 503', () => expect(isRetryable(503)).toBe(true));
    it('returns true for 504', () => expect(isRetryable(504)).toBe(true));
    it('returns false for 400', () => expect(isRetryable(400)).toBe(false));
    it('returns false for 401', () => expect(isRetryable(401)).toBe(false));
    it('returns false for 404', () => expect(isRetryable(404)).toBe(false));
    it('returns false for 500', () => expect(isRetryable(500)).toBe(false));
  });

  describe('getRetryConfig', () => {
    it('returns default config when no retries specified', () => {
      const config = getRetryConfig();
      expect(config.maxRetries).toBe(3);
      expect(config.baseDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
    });

    it('overrides maxRetries', () => {
      const config = getRetryConfig(5);
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('computeDelay', () => {
    beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
    afterEach(() => vi.restoreAllMocks());

    it('uses Retry-After when provided', () => {
      const delay = computeDelay(0, getRetryConfig(), 5);
      expect(delay).toBe(5000);
    });

    it('computes exponential backoff with jitter', () => {
      const config = getRetryConfig();
      const delay = computeDelay(0, config);
      // base=1000, 2^0=1, exponential=1000, jitter=1000*(0.5+0.5*0.5)=750
      expect(delay).toBe(750);
    });

    it('increases delay with attempts', () => {
      const config = getRetryConfig();
      const delay0 = computeDelay(0, config);
      const delay1 = computeDelay(1, config);
      const delay2 = computeDelay(2, config);
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('caps at maxDelay', () => {
      const config = getRetryConfig();
      const delay = computeDelay(20, config);
      expect(delay).toBeLessThanOrEqual(config.maxDelay);
    });
  });

  describe('sleep', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves after the specified delay', async () => {
      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(sleep(1000, controller.signal)).rejects.toThrow();
    });

    it('rejects when signal aborts during sleep', async () => {
      const controller = new AbortController();
      const promise = sleep(5000, controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow();
    });
  });
});
