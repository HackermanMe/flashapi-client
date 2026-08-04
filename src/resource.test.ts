import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from './http.js';
import { EntityResource } from './resource.js';

function createMockHttpClient() {
  return {
    request: vi.fn(),
  } as unknown as HttpClient;
}

describe('EntityResource', () => {
  let http: ReturnType<typeof createMockHttpClient>;
  let resource: EntityResource<{ id: number; name: string; price: number }>;

  beforeEach(() => {
    http = createMockHttpClient();
    resource = new EntityResource(http, 'products');
  });

  afterEach(() => vi.restoreAllMocks());

  describe('list', () => {
    it('calls GET with correct path and params', async () => {
      const mockResponse = { data: { data: [], meta: { page: 0, size: 10, totalElements: 0, totalPages: 0 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.list({ page: 0, size: 10, sort: 'name,asc', search: 'phone' });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products',
        params: { page: '0', size: '10', sort: 'name,asc', search: 'phone' },
        signal: undefined,
      });
    });

    it('passes filters as query params', async () => {
      const mockResponse = { data: { data: [], meta: { page: 0, size: 10, totalElements: 0, totalPages: 0 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.list({ filters: { price: { gte: 100 } } });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products',
        params: { 'price__gte': '100' },
        signal: undefined,
      });
    });

    it('passes deleted flag', async () => {
      const mockResponse = { data: { data: [], meta: { page: 0, size: 10, totalElements: 0, totalPages: 0 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.list({ deleted: true });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products',
        params: { deleted: 'true' },
        signal: undefined,
      });
    });
  });

  describe('get', () => {
    it('calls GET with id', async () => {
      const mockResponse = { data: { data: { id: 1, name: 'Test', price: 10 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.get(1);

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products/1',
        params: undefined,
        signal: undefined,
      });
      expect(result).toEqual({ data: { id: 1, name: 'Test', price: 10 } });
    });

    it('passes expand option', async () => {
      const mockResponse = { data: { data: { id: 1, name: 'Test', price: 10 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.get(1, { expand: ['category', 'reviews'] });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products/1',
        params: { expand: 'category,reviews' },
        signal: undefined,
      });
    });
  });

  describe('create', () => {
    it('calls POST with body', async () => {
      const mockResponse = { data: { data: { id: 1, name: 'New', price: 99 } }, status: 201, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.create({ name: 'New', price: 99 });

      expect(http.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'products',
        body: { name: 'New', price: 99 },
        signal: undefined,
      });
      expect(result).toEqual({ data: { id: 1, name: 'New', price: 99 } });
    });
  });

  describe('update', () => {
    it('calls PUT with id and body', async () => {
      const mockResponse = { data: { data: { id: 1, name: 'Updated', price: 79 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.update(1, { price: 79 });

      expect(http.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: 'products/1',
        body: { price: 79 },
        signal: undefined,
      });
      expect(result).toEqual({ data: { id: 1, name: 'Updated', price: 79 } });
    });
  });

  describe('delete', () => {
    it('calls DELETE with id', async () => {
      const mockResponse = { data: undefined, status: 204, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.delete(1);

      expect(http.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: 'products/1',
        signal: undefined,
      });
    });
  });

  describe('restore', () => {
    it('calls POST to restore endpoint', async () => {
      const mockResponse = { data: undefined, status: 204, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.restore(1);

      expect(http.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'products/1/restore',
        signal: undefined,
      });
    });
  });

  describe('bulk operations', () => {
    it('bulkCreate sends array to bulk endpoint', async () => {
      const mockResponse = { data: { data: [{ id: 1 }, { id: 2 }], meta: { total: 2, succeeded: 2, failed: 0 } }, status: 201, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.bulkCreate([{ name: 'A', price: 10 }, { name: 'B', price: 20 }]);

      expect(http.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'products/bulk',
        body: [{ name: 'A', price: 10 }, { name: 'B', price: 20 }],
        signal: undefined,
      });
      expect(result.meta.succeeded).toBe(2);
    });

    it('bulkUpdate sends items with ids', async () => {
      const mockResponse = { data: { data: [], meta: { total: 1, succeeded: 1, failed: 0 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.bulkUpdate([{ id: 1, price: 50 }]);

      expect(http.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: 'products/bulk',
        body: [{ id: 1, price: 50 }],
        signal: undefined,
      });
    });

    it('bulkDelete sends array of ids', async () => {
      const mockResponse = { data: { data: [], meta: { total: 2, succeeded: 2, failed: 0 } }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.bulkDelete([1, 2]);

      expect(http.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: 'products/bulk',
        body: [1, 2],
        signal: undefined,
      });
    });
  });

  describe('export', () => {
    it('calls GET with format and returns blob', async () => {
      const blob = new Blob(['csv content']);
      const mockResponse = { data: blob, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.export({ format: 'csv' });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products/export',
        params: { format: 'csv' },
        responseType: 'blob',
        signal: undefined,
      });
      expect(result).toBeInstanceOf(Blob);
    });

    it('includes filters and sort in export', async () => {
      const blob = new Blob(['data']);
      const mockResponse = { data: blob, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await resource.export({ format: 'xlsx', filters: { price: { gte: 100 } }, sort: 'name,asc' });

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products/export',
        params: { format: 'xlsx', 'price__gte': '100', sort: 'name,asc' },
        responseType: 'blob',
        signal: undefined,
      });
    });
  });

  describe('history', () => {
    it('calls GET on history endpoint', async () => {
      const mockResponse = { data: { data: [{ action: 'CREATE', entityType: 'Product', entityId: '1', timestamp: '2024-01-01', performedBy: 'admin', changes: null }] }, status: 200, headers: new Headers(), rateLimit: null };
      (http.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await resource.history(1);

      expect(http.request).toHaveBeenCalledWith({
        method: 'GET',
        path: 'products/1/history',
        signal: undefined,
      });
      expect(result.data).toHaveLength(1);
    });
  });
});
