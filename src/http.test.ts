import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from './http.js';
import { HttpError, TimeoutError, RateLimitError, NetworkError } from './errors.js';

function mockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? responses[responses.length - 1]!;
    const headers = new Headers(resp.headers ?? {});
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: `Status ${resp.status}`,
      headers,
      json: async () => resp.body,
      blob: async () => new Blob([JSON.stringify(resp.body)]),
    } as unknown as Response;
  });
}

describe('HttpClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes a successful GET request', async () => {
    globalThis.fetch = mockFetch([{ status: 200, body: { data: [1, 2, 3] } }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api' });
    const result = await client.request({ method: 'GET', path: 'products' });

    expect(result.data).toEqual({ data: [1, 2, 3] });
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('makes a POST request with body', async () => {
    globalThis.fetch = mockFetch([{ status: 201, body: { data: { id: 1, name: 'Test' } } }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api' });
    const result = await client.request({
      method: 'POST',
      path: 'products',
      body: { name: 'Test', price: 10 },
    });

    expect(result.data).toEqual({ data: { id: 1, name: 'Test' } });
    expect(result.status).toBe(201);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(call[1].body as string)).toEqual({ name: 'Test', price: 10 });
  });

  it('handles 204 No Content', async () => {
    globalThis.fetch = mockFetch([{ status: 204 }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api' });
    const result = await client.request({ method: 'DELETE', path: 'products/1' });

    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it('throws HttpError on 4xx', async () => {
    globalThis.fetch = mockFetch([{ status: 404, body: { error: 'Not found', status: 404 } }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api', retries: 0 });

    await expect(client.request({ method: 'GET', path: 'products/999' }))
      .rejects.toBeInstanceOf(HttpError);
  });

  it('retries on 503 and succeeds', async () => {
    globalThis.fetch = mockFetch([
      { status: 503, body: { error: 'Service unavailable' } },
      { status: 200, body: { data: 'ok' } },
    ]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api', retries: 2 });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const promise = client.request({ method: 'GET', path: 'test' });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.data).toEqual({ data: 'ok' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 and respects Retry-After', async () => {
    globalThis.fetch = mockFetch([
      { status: 429, body: { error: 'Too many requests' }, headers: { 'Retry-After': '2', 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1700000000' } },
      { status: 200, body: { data: 'ok' } },
    ]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api', retries: 2 });

    const promise = client.request({ method: 'GET', path: 'test' });
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.data).toEqual({ data: 'ok' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after max retries on 429', async () => {
    globalThis.fetch = mockFetch([
      { status: 429, body: { error: 'Rate limited' }, headers: { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1700000000' } },
      { status: 429, body: { error: 'Rate limited' }, headers: { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1700000000' } },
    ]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api', retries: 1 });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const promise = client.request({ method: 'GET', path: 'test' });
    // Attach the rejection handler immediately to prevent unhandled rejection
    const assertion = expect(promise).rejects.toBeInstanceOf(RateLimitError);
    await vi.runAllTimersAsync();

    await assertion;
  });

  it('applies bearer auth', async () => {
    globalThis.fetch = mockFetch([{ status: 200, body: { data: 'ok' } }]);

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080/api',
      auth: { type: 'bearer', token: 'my-token' },
    });
    await client.request({ method: 'GET', path: 'test' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = call[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('applies custom header auth', async () => {
    globalThis.fetch = mockFetch([{ status: 200, body: { data: 'ok' } }]);

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080/api',
      auth: { type: 'header', name: 'X-API-Key', value: 'secret' },
    });
    await client.request({ method: 'GET', path: 'test' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = call[1].headers as Headers;
    expect(headers.get('X-API-Key')).toBe('secret');
  });

  it('parses rate limit headers', async () => {
    globalThis.fetch = mockFetch([{
      status: 200,
      body: { data: 'ok' },
      headers: { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '95', 'X-RateLimit-Reset': '1700000000' },
    }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api' });
    const result = await client.request({ method: 'GET', path: 'test' });

    expect(result.rateLimit).toEqual({ limit: 100, remaining: 95, reset: 1700000000 });
  });

  it('validates baseUrl', () => {
    expect(() => new HttpClient({ baseUrl: '' })).toThrow();
    expect(() => new HttpClient({ baseUrl: 'ftp://invalid' })).toThrow();
    expect(() => new HttpClient({ baseUrl: 'not-a-url' })).toThrow();
  });

  it('handles blob response type', async () => {
    globalThis.fetch = mockFetch([{ status: 200, body: 'csv data' }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api' });
    const result = await client.request({ method: 'GET', path: 'products/export', responseType: 'blob' });

    expect(result.data).toBeInstanceOf(Blob);
  });

  it('throws when signal is already aborted', async () => {
    globalThis.fetch = mockFetch([{ status: 200, body: { data: 'ok' } }]);

    const client = new HttpClient({ baseUrl: 'http://localhost:8080/api', retries: 0 });
    const controller = new AbortController();
    controller.abort();

    await expect(client.request({ method: 'GET', path: 'test', signal: controller.signal }))
      .rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
