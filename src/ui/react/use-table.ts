import { useCallback, useEffect, useRef, useState } from 'react';
import { TableController } from '../table-controller.js';
import type { TableConfig, TableState } from '../types.js';

export function useFlashTable<T = any>(config: TableConfig<T>) {
  const controllerRef = useRef<TableController<T> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new TableController<T>(config);
  }

  const [state, setState] = useState<TableState<T>>(controllerRef.current.getState());

  useEffect(() => {
    const controller = controllerRef.current!;
    const unsub = controller.subscribe(setState);
    controller.fetch();
    return () => {
      unsub();
      controller.destroy();
    };
  }, []);

  const setPage = useCallback((page: number) => controllerRef.current!.setPage(page), []);
  const setPageSize = useCallback((size: number) => controllerRef.current!.setPageSize(size), []);
  const setSearch = useCallback((search: string) => controllerRef.current!.setSearch(search), []);
  const setSort = useCallback((key: string) => controllerRef.current!.setSort(key), []);
  const refresh = useCallback(() => controllerRef.current!.refresh(), []);
  const deleteRow = useCallback((row: T) => controllerRef.current!.deleteRow(row), []);
  const selectRow = useCallback((row: T) => controllerRef.current!.selectRow(row), []);
  const selectAll = useCallback(() => controllerRef.current!.selectAll(), []);
  const clearSelection = useCallback(() => controllerRef.current!.clearSelection(), []);
  const bulkDelete = useCallback(() => controllerRef.current!.bulkDelete(), []);
  const exportData = useCallback((format: 'csv' | 'xlsx' | 'pdf' = 'csv') => controllerRef.current!.exportData(format), []);
  const downloadExport = useCallback((format: 'csv' | 'xlsx' | 'pdf' = 'csv', filename?: string) => controllerRef.current!.downloadExport(format, filename), []);

  return {
    ...state,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    refresh,
    deleteRow,
    selectRow,
    selectAll,
    clearSelection,
    bulkDelete,
    exportData,
    downloadExport,
  };
}
