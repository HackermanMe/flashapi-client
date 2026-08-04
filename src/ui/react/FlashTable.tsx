import { useCallback, useRef, type ChangeEvent, type ReactNode } from 'react';
import type { ColumnDef, TableAction, TableConfig } from '../types.js';
import { useFlashTable } from './use-table.js';

export interface FlashTableProps<T = any> extends TableConfig<T> {
  className?: string;
  tableClassName?: string;
  emptyMessage?: string;
}

export function FlashTable<T = any>(props: FlashTableProps<T>) {
  const {
    className,
    tableClassName,
    emptyMessage = 'No data found',
    columns,
    actions,
    searchable = false,
    paginated = true,
    editable,
    deletable,
    exportable = false,
    bulkActions = false,
    onEdit,
    onDelete,
    ...config
  } = props;

  const tableConfig: TableConfig<T> = {
    ...config, columns, actions, searchable, paginated,
    editable, deletable, exportable, bulkActions, onEdit, onDelete,
  };
  const table = useFlashTable<T>(tableConfig);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => table.setSearch(value), 300);
  }, [table.setSearch]);

  const allActions: TableAction<T>[] = [];
  if (editable && onEdit) {
    allActions.push({ key: '_edit', label: 'Edit', onClick: onEdit });
  }
  if (deletable && onDelete) {
    allActions.push({ key: '_delete', label: 'Delete', variant: 'danger', onClick: onDelete });
  }
  if (actions) allActions.push(...actions);

  const hasSelection = bulkActions;
  const selectedCount = table.selectedRows.length;
  const allSelected = selectedCount > 0 && selectedCount === table.data.length;

  return (
    <div className={`flash-table-root ${className ?? ''}`}>
      {/* Toolbar: search + bulk actions + export */}
      <div className="flash-table-toolbar">
        {searchable && (
          <input
            type="text"
            placeholder="Search..."
            onChange={handleSearch}
            className="flash-table-search"
          />
        )}

        <div className="flash-table-toolbar-actions">
          {bulkActions && selectedCount > 0 && (
            <>
              <span className="flash-table-selected-count">{selectedCount} selected</span>
              <button
                onClick={() => table.bulkDelete()}
                className="flash-table-bulk-btn flash-table-bulk-delete"
              >
                Delete selected
              </button>
              <button
                onClick={() => table.clearSelection()}
                className="flash-table-bulk-btn"
              >
                Clear
              </button>
            </>
          )}

          {exportable && (
            <div className="flash-table-export">
              <button
                onClick={() => table.downloadExport('csv')}
                className="flash-table-export-btn"
              >
                CSV
              </button>
              <button
                onClick={() => table.downloadExport('xlsx')}
                className="flash-table-export-btn"
              >
                Excel
              </button>
              <button
                onClick={() => table.downloadExport('pdf')}
                className="flash-table-export-btn"
              >
                PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {table.error && (
        <div className="flash-table-error">{table.error}</div>
      )}

      <div className="flash-table-wrapper">
        <table className={`flash-table ${tableClassName ?? ''}`}>
          <thead>
            <tr>
              {hasSelection && (
                <th className="flash-table-checkbox-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => table.selectAll()}
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => table.setSort(col.key) : undefined}
                  className={col.sortable ? 'flash-table-sortable' : ''}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                  {table.sort?.key === col.key && (
                    <span className="flash-table-sort-icon">
                      {table.sort.direction === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
              ))}
              {allActions.length > 0 && <th className="flash-table-actions-header">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {table.loading && table.data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (allActions.length > 0 ? 1 : 0) + (hasSelection ? 1 : 0)} className="flash-table-loading">
                  Loading...
                </td>
              </tr>
            ) : table.data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (allActions.length > 0 ? 1 : 0) + (hasSelection ? 1 : 0)} className="flash-table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.data.map((row, idx) => {
                const rowId = (row as any).id ?? (row as any).tracking_id ?? idx;
                const isSelected = table.selectedRows.some(
                  r => ((r as any).id ?? (r as any).tracking_id) === rowId
                );
                return (
                  <tr key={rowId} className={isSelected ? 'flash-table-row-selected' : ''}>
                    {hasSelection && (
                      <td className="flash-table-checkbox-col">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => table.selectRow(row)}
                        />
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key}>
                        {renderCell(col, (row as any)[col.key], row)}
                      </td>
                    ))}
                    {allActions.length > 0 && (
                      <td className="flash-table-actions">
                        {allActions
                          .filter(a => !a.visible || a.visible(row))
                          .map(action => (
                            <button
                              key={action.key}
                              onClick={() => action.onClick(row)}
                              className={`flash-table-action-btn ${action.variant === 'danger' ? 'flash-table-action-danger' : ''}`}
                            >
                              {action.label}
                            </button>
                          ))}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginated && table.totalPages > 1 && (
        <div className="flash-table-pagination">
          <button
            onClick={() => table.setPage(table.page - 1)}
            disabled={table.page === 0}
            className="flash-table-page-btn"
          >
            Previous
          </button>
          <span className="flash-table-page-info">
            Page {table.page + 1} of {table.totalPages} ({table.totalElements} items)
          </span>
          <button
            onClick={() => table.setPage(table.page + 1)}
            disabled={table.page >= table.totalPages - 1}
            className="flash-table-page-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function renderCell<T>(col: ColumnDef<T>, value: any, row: T): ReactNode {
  if (col.render) return col.render(value, row);

  if (value === null || value === undefined) return '—';

  switch (col.type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : value;
    case 'badge':
      return <span className="flash-table-badge">{value}</span>;
    default:
      return String(value);
  }
}
