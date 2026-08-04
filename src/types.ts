// ─── Auth ───────────────────────────────────────────────────────────────────

export type AuthConfig =
  | { type: 'bearer'; token: string }
  | { type: 'header'; name: string; value: string }
  | { type: 'custom'; interceptor: (headers: Headers) => Headers | Promise<Headers> };

// ─── Client Config ──────────────────────────────────────────────────────────

export interface FlashClientConfig {
  baseUrl: string;
  auth?: AuthConfig;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  logger?: (message: string, context?: Record<string, unknown>) => void;
  webSocketConstructor?: new (url: string) => WebSocket;
}

// ─── List/Query Options ─────────────────────────────────────────────────────

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' |
  'contains' | 'startswith' | 'endswith' | 'isnull' | 'in';

export type FilterValue = string | number | boolean | null | (string | number)[];

export type FieldFilters = Partial<Record<FilterOperator, FilterValue>>;

export type Filters = Record<string, FieldFilters>;

export interface ListOptions {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  filters?: Filters;
  expand?: string | string[];
  deleted?: boolean;
}

export interface GetOptions {
  expand?: string | string[];
}

export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf';
  filters?: Filters;
  sort?: string;
}

// ─── Response Envelopes ─────────────────────────────────────────────────────

export interface ListMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

export interface ItemResponse<T> {
  data: T;
}

export interface BulkMeta {
  total: number;
  succeeded: number;
  failed: number;
}

export interface BulkResponse<T> {
  data: T[];
  meta: BulkMeta;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId: string;
  timestamp: string;
  performedBy: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

export interface AuditResponse {
  data: AuditEntry[];
}

// ─── WebSocket ──────────────────────────────────────────────────────────────

export type FlashEventType = 'ENTITY_CREATED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED' | 'ENTITY_RESTORED';

export interface FlashEvent<T = unknown> {
  type: FlashEventType;
  entity: string;
  data: T;
  timestamp: string;
}

export type EventCallback<T = unknown> = (event: FlashEvent<T>) => void;

export type Unsubscribe = () => void;

// ─── Errors ─────────────────────────────────────────────────────────────────

export interface ErrorResponseBody {
  error: string;
  status: number;
}

// ─── Rate Limit ─────────────────────────────────────────────────────────────

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// ─── HTTP Layer ─────────────────────────────────────────────────────────────

export interface RequestConfig {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
  responseType?: 'json' | 'blob';
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
  rateLimit: RateLimitInfo | null;
}
