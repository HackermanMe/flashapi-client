import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { TableController } from '../table-controller.js';
import type { TableConfig, TableState } from '../types.js';
import type { Filters } from '../../types.js';

export function useFlashTable<T = any>(config: TableConfig<T>) {
  const controller = new TableController<T>(config);
  const state: Ref<TableState<T>> = ref(controller.getState()) as Ref<TableState<T>>;

  let unsub: (() => void) | null = null;

  onMounted(() => {
    unsub = controller.subscribe((newState) => {
      state.value = newState;
    });
    controller.fetch();
  });

  onUnmounted(() => {
    unsub?.();
    controller.destroy();
  });

  return {
    state,
    setPage: (page: number) => controller.setPage(page),
    setPageSize: (size: number) => controller.setPageSize(size),
    setSearch: (search: string) => controller.setSearch(search),
    setSort: (key: string) => controller.setSort(key),
    setFilters: (filters: Filters) => controller.setFilters(filters),
    refresh: () => controller.refresh(),
    deleteRow: (row: T) => controller.deleteRow(row),
    selectRow: (row: T) => controller.selectRow(row),
    selectAll: () => controller.selectAll(),
    clearSelection: () => controller.clearSelection(),
    bulkDelete: () => controller.bulkDelete(),
    exportData: (format: 'csv' | 'xlsx' | 'pdf' = 'csv') => controller.exportData(format),
    downloadExport: (format: 'csv' | 'xlsx' | 'pdf' = 'csv', filename?: string) => controller.downloadExport(format, filename),
  };
}
