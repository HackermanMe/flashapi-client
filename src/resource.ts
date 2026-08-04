import type {
  AuditResponse,
  BulkResponse,
  ExportOptions,
  GetOptions,
  ItemResponse,
  ListOptions,
  ListResponse,
} from './types.js';
import type { HttpClient } from './http.js';
import { serializeFilters } from './filters.js';

export class EntityResource<T> {
  private readonly http: HttpClient;
  private readonly entity: string;

  constructor(http: HttpClient, entity: string) {
    this.http = http;
    this.entity = entity;
  }

  async list(options: ListOptions = {}, signal?: AbortSignal): Promise<ListResponse<T>> {
    const params = this.buildListParams(options);
    const response = await this.http.request<ListResponse<T>>({
      method: 'GET',
      path: this.entity,
      params,
      signal,
    });
    return response.data;
  }

  async get(id: string | number, options: GetOptions = {}, signal?: AbortSignal): Promise<ItemResponse<T>> {
    const params: Record<string, string> = {};
    if (options.expand) {
      params['expand'] = Array.isArray(options.expand) ? options.expand.join(',') : options.expand;
    }
    const response = await this.http.request<ItemResponse<T>>({
      method: 'GET',
      path: `${this.entity}/${id}`,
      params: Object.keys(params).length > 0 ? params : undefined,
      signal,
    });
    return response.data;
  }

  async create(body: Partial<T>, signal?: AbortSignal): Promise<ItemResponse<T>> {
    const response = await this.http.request<ItemResponse<T>>({
      method: 'POST',
      path: this.entity,
      body,
      signal,
    });
    return response.data;
  }

  async update(id: string | number, body: Partial<T>, signal?: AbortSignal): Promise<ItemResponse<T>> {
    const response = await this.http.request<ItemResponse<T>>({
      method: 'PUT',
      path: `${this.entity}/${id}`,
      body,
      signal,
    });
    return response.data;
  }

  async delete(id: string | number, signal?: AbortSignal): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: `${this.entity}/${id}`,
      signal,
    });
  }

  async restore(id: string | number, signal?: AbortSignal): Promise<void> {
    await this.http.request<void>({
      method: 'POST',
      path: `${this.entity}/${id}/restore`,
      signal,
    });
  }

  async bulkCreate(items: Partial<T>[], signal?: AbortSignal): Promise<BulkResponse<T>> {
    const response = await this.http.request<BulkResponse<T>>({
      method: 'POST',
      path: `${this.entity}/bulk`,
      body: items,
      signal,
    });
    return response.data;
  }

  async bulkUpdate(items: (Partial<T> & { id: string | number })[], signal?: AbortSignal): Promise<BulkResponse<T>> {
    const response = await this.http.request<BulkResponse<T>>({
      method: 'PUT',
      path: `${this.entity}/bulk`,
      body: items,
      signal,
    });
    return response.data;
  }

  async bulkDelete(ids: (string | number)[], signal?: AbortSignal): Promise<BulkResponse<T>> {
    const response = await this.http.request<BulkResponse<T>>({
      method: 'DELETE',
      path: `${this.entity}/bulk`,
      body: ids,
      signal,
    });
    return response.data;
  }

  async export(options: ExportOptions, signal?: AbortSignal): Promise<Blob> {
    const params: Record<string, string> = { format: options.format };
    if (options.filters) {
      Object.assign(params, serializeFilters(options.filters));
    }
    if (options.sort) {
      params['sort'] = options.sort;
    }
    const response = await this.http.request<Blob>({
      method: 'GET',
      path: `${this.entity}/export`,
      params,
      responseType: 'blob',
      signal,
    });
    return response.data;
  }

  async history(id: string | number, signal?: AbortSignal): Promise<AuditResponse> {
    const response = await this.http.request<AuditResponse>({
      method: 'GET',
      path: `${this.entity}/${id}/history`,
      signal,
    });
    return response.data;
  }

  private buildListParams(options: ListOptions): Record<string, string> {
    const params: Record<string, string> = {};

    if (options.page !== undefined) params['page'] = String(options.page);
    if (options.size !== undefined) params['size'] = String(options.size);
    if (options.sort) params['sort'] = options.sort;
    if (options.search) params['search'] = options.search;
    if (options.deleted) params['deleted'] = 'true';
    if (options.expand) {
      params['expand'] = Array.isArray(options.expand) ? options.expand.join(',') : options.expand;
    }
    if (options.filters) {
      Object.assign(params, serializeFilters(options.filters));
    }

    return params;
  }
}
