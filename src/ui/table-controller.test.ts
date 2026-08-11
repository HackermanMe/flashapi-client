import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TableController } from './table-controller.js';
import type { TableConfig } from './types.js';

function createMockClient(mockData: any[] = [], totalElements = 0) {
  const mockResource = {
    list: vi.fn().mockResolvedValue({
      data: mockData,
      meta: { page: 0, size: 20, totalElements, totalPages: Math.ceil(totalElements / 20) || 1 },
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkDelete: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, succeeded: 0, failed: 0 } }),
    export: vi.fn().mockResolvedValue(new Blob(['test'])),
  };

  return {
    client: { entity: vi.fn().mockReturnValue(mockResource) } as any,
    resource: mockResource,
  };
}

describe('TableController', () => {
  let controller: TableController<any>;
  let mockResource: any;

  beforeEach(() => {
    const { client, resource } = createMockClient(
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      2,
    );
    mockResource = resource;
    const config: TableConfig = {
      client,
      entity: 'students',
      columns: [{ key: 'name', label: 'Name' }],
    };
    controller = new TableController(config);
  });

  it('fetches data on fetch()', async () => {
    await controller.fetch();
    const state = controller.getState();
    expect(state.data).toHaveLength(2);
    expect(state.loading).toBe(false);
    expect(state.totalElements).toBe(2);
  });

  it('notifies listeners on state change', async () => {
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.fetch();
    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastCall.data).toHaveLength(2);
  });

  it('unsubscribes listeners', () => {
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);
    unsub();
    controller.setPage(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setSearch debounces fetch', async () => {
    vi.useFakeTimers();
    controller.setSearch('alice');
    controller.setSearch('alic');
    controller.setSearch('ali');
    expect(mockResource.list).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    await vi.runAllTimersAsync();
    expect(mockResource.list).toHaveBeenCalledTimes(1);
    expect(mockResource.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ali' }),
      expect.anything(),
    );
    vi.useRealTimers();
  });

  it('setPage fetches immediately', async () => {
    await controller.fetch();
    mockResource.list.mockClear();
    controller.setPage(0);
    expect(mockResource.list).toHaveBeenCalledTimes(1);
  });

  it('selectRow toggles selection', () => {
    const row = { id: 1, name: 'Alice' };
    controller.selectRow(row);
    expect(controller.getState().selectedRows).toHaveLength(1);
    controller.selectRow(row);
    expect(controller.getState().selectedRows).toHaveLength(0);
  });

  it('selectAll toggles all', async () => {
    await controller.fetch();
    controller.selectAll();
    expect(controller.getState().selectedRows).toHaveLength(2);
    controller.selectAll();
    expect(controller.getState().selectedRows).toHaveLength(0);
  });

  it('deleteRow calls resource.delete', async () => {
    await controller.fetch();
    const result = await controller.deleteRow({ id: 1, name: 'Alice' });
    expect(result).toBe(true);
    expect(mockResource.delete).toHaveBeenCalledWith(1);
  });

  it('deleteRow respects confirmDelete returning false', async () => {
    const { client, resource } = createMockClient([{ id: 1, name: 'A' }], 1);
    const config: TableConfig = {
      client,
      entity: 'students',
      columns: [{ key: 'name', label: 'Name' }],
      confirmDelete: () => false,
    };
    const ctrl = new TableController(config);
    const result = await ctrl.deleteRow({ id: 1, name: 'A' });
    expect(result).toBe(false);
    expect(resource.delete).not.toHaveBeenCalled();
  });

  it('bulkDelete respects confirmBulkDelete returning false', async () => {
    const { client, resource } = createMockClient([{ id: 1 }, { id: 2 }], 2);
    const config: TableConfig = {
      client,
      entity: 'students',
      columns: [{ key: 'id', label: 'ID' }],
      confirmBulkDelete: () => Promise.resolve(false),
    };
    const ctrl = new TableController(config);
    await ctrl.fetch();
    ctrl.selectAll();
    const result = await ctrl.bulkDelete();
    expect(result).toBe(false);
    expect(resource.bulkDelete).not.toHaveBeenCalled();
  });

  it('exportData returns a blob', async () => {
    const blob = await controller.exportData('csv');
    expect(blob).toBeInstanceOf(Blob);
    expect(mockResource.export).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv' }),
    );
  });

  it('destroy aborts pending requests', () => {
    controller.destroy();
    expect(controller.getState().loading).toBe(true);
  });

  it('handles fetch error', async () => {
    mockResource.list.mockRejectedValueOnce(new Error('Network fail'));
    await controller.fetch();
    expect(controller.getState().error).toBe('Network fail');
    expect(controller.getState().loading).toBe(false);
  });
});
