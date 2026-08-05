import { EntityResource } from '../resource.js';
import type { SortDirection, TableConfig, TableState } from './types.js';
import type { ExportOptions, Filters } from '../types.js';

export type TableListener<T> = (state: TableState<T>) => void;

export class TableController<T = any> {
  private readonly resource: EntityResource<T>;
  private readonly config: TableConfig<T>;
  private state: TableState<T>;
  private listeners: Set<TableListener<T>> = new Set();
  private abortController: AbortController | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly searchDebounceMs: number;

  constructor(config: TableConfig<T>) {
    this.config = config;
    this.resource = config.client.entity<T>(config.entity);
    this.searchDebounceMs = config.searchDebounceMs ?? 300;
    this.state = {
      data: [],
      loading: true,
      error: null,
      page: 0,
      pageSize: config.pageSize ?? 20,
      totalElements: 0,
      totalPages: 0,
      search: '',
      sort: config.defaultSort ?? null,
      filters: config.filters ?? {},
      selectedRows: [],
    };
  }

  getState(): TableState<T> {
    return this.state;
  }

  subscribe(listener: TableListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async fetch(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    this.update({ loading: true, error: null });

    try {
      const result = await this.resource.list(
        {
          page: this.state.page,
          size: this.state.pageSize,
          search: this.state.search || undefined,
          sort: this.state.sort
            ? `${this.state.sort.key},${this.state.sort.direction}`
            : undefined,
          filters: Object.keys(this.state.filters).length > 0
            ? this.state.filters
            : undefined,
          expand: this.config.expand,
        },
        this.abortController.signal,
      );

      this.update({
        data: result.data,
        totalElements: result.meta.totalElements,
        totalPages: result.meta.totalPages,
        loading: false,
        selectedRows: [],
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      this.update({
        loading: false,
        error: error?.message ?? 'Failed to load data',
      });
    }
  }

  setPage(page: number): void {
    if (page < 0 || page >= this.state.totalPages) return;
    this.update({ page });
    this.fetch();
  }

  setPageSize(size: number): void {
    this.update({ pageSize: size, page: 0 });
    this.fetch();
  }

  setSearch(search: string): void {
    this.update({ search, page: 0 });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.fetch(), this.searchDebounceMs);
  }

  setSort(key: string, direction?: SortDirection): void {
    const current = this.state.sort;
    if (current?.key === key && !direction) {
      direction = current.direction === 'asc' ? 'desc' : 'asc';
    }
    this.update({ sort: { key, direction: direction ?? 'asc' }, page: 0 });
    this.fetch();
  }

  setFilters(filters: Filters): void {
    this.update({ filters, page: 0 });
    this.fetch();
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  selectRow(row: T): void {
    const id = this.getId(row);
    const already = this.state.selectedRows.some(r => this.getId(r) === id);
    if (already) {
      this.update({ selectedRows: this.state.selectedRows.filter(r => this.getId(r) !== id) });
    } else {
      this.update({ selectedRows: [...this.state.selectedRows, row] });
    }
  }

  selectAll(): void {
    if (this.state.selectedRows.length === this.state.data.length) {
      this.update({ selectedRows: [] });
    } else {
      this.update({ selectedRows: [...this.state.data] });
    }
  }

  clearSelection(): void {
    this.update({ selectedRows: [] });
  }

  // ─── Bulk operations ────────────────────────────────────────────────────────

  async bulkDelete(): Promise<boolean> {
    const ids = this.state.selectedRows.map(r => this.getId(r)).filter(id => id !== undefined);
    if (ids.length === 0) return false;

    if (this.config.confirmBulkDelete) {
      const confirmed = await this.config.confirmBulkDelete(ids.length);
      if (!confirmed) return false;
    }

    try {
      await this.resource.bulkDelete(ids);
      await this.fetch();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  async exportData(format: 'csv' | 'xlsx' | 'pdf' = 'csv'): Promise<Blob> {
    const options: ExportOptions = {
      format,
      filters: Object.keys(this.state.filters).length > 0 ? this.state.filters : undefined,
      sort: this.state.sort
        ? `${this.state.sort.key},${this.state.sort.direction}`
        : undefined,
    };
    return this.resource.export(options);
  }

  async downloadExport(format: 'csv' | 'xlsx' | 'pdf' = 'csv', filename?: string): Promise<void> {
    const blob = await this.exportData(format);
    const name = filename ?? `${this.config.entity}.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Single row ─────────────────────────────────────────────────────────────

  async deleteRow(row: T): Promise<boolean> {
    const id = this.getId(row);
    if (id === undefined) return false;

    if (this.config.confirmDelete) {
      const confirmed = await this.config.confirmDelete(row);
      if (!confirmed) return false;
    }

    try {
      await this.resource.delete(id);
      await this.fetch();
      return true;
    } catch {
      return false;
    }
  }

  refresh(): void {
    this.fetch();
  }

  destroy(): void {
    this.abortController?.abort();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.listeners.clear();
  }

  private getId(row: T): string | number {
    return (row as any).id ?? (row as any).tracking_id;
  }

  private update(partial: Partial<TableState<T>>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
