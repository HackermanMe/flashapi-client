import type { FlashClient } from '../client.js';
import type { Filters } from '../types.js';
export type { Filters } from '../types.js';

// ─── Table ──────────────────────────────────────────────────────────────────

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'badge';

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T = any> {
  key: keyof T & string;
  label: string;
  type?: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T) => any;
  width?: string;
}

export interface TableAction<T = any> {
  key: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'danger';
  onClick: (row: T) => void;
  visible?: (row: T) => boolean;
}

export interface TableConfig<T = any> {
  client: FlashClient;
  entity: string;
  columns: ColumnDef<T>[];
  actions?: TableAction<T>[];
  searchable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  defaultSort?: { key: string; direction: SortDirection };
  filters?: Filters;
  expand?: string | string[];
  deletable?: boolean;
  editable?: boolean;
  exportable?: boolean;
  bulkActions?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void | Promise<void>;
}

export interface TableState<T = any> {
  data: T[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  search: string;
  sort: { key: string; direction: SortDirection } | null;
  filters: Filters;
  selectedRows: T[];
}

// ─── Form ───────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'email' | 'password' | 'date' |
  'datetime' | 'textarea' | 'select' | 'checkbox' | 'relation';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface FieldDef<T = any> {
  key: keyof T & string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  options?: SelectOption[];
  entity?: string;
  display?: string;
  min?: number;
  max?: number;
  defaultValue?: any;
}

export type FormMode = 'create' | 'edit';

export interface FormConfig<T = any> {
  client: FlashClient;
  entity: string;
  fields: FieldDef<T>[];
  mode?: FormMode;
  initialData?: Partial<T>;
  id?: string | number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  submitLabel?: string;
}

export interface FormState<T = any> {
  values: Partial<T>;
  errors: Partial<Record<keyof T & string, string>>;
  loading: boolean;
  submitting: boolean;
}
