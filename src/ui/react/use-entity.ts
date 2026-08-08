import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlashClient } from '../../client.js';
import type { FlashEvent, ListOptions, ListResponse } from '../../types.js';

export interface UseEntityOptions {
  /**
   * Enable real-time updates via WebSocket.
   * When true, the entity list/item auto-updates on CRUD events.
   */
  realtime?: boolean;

  /**
   * Enable optimistic updates.
   * When true, mutations instantly update local state before server confirms.
   */
  optimistic?: boolean;

  /**
   * Initial list options (page, size, filters, sort, search).
   */
  initialOptions?: Partial<ListOptions>;

  /**
   * Poll interval in milliseconds (alternative to WebSocket).
   * Set to enable polling instead of WebSocket.
   */
  pollInterval?: number;
}

export interface UseEntityResult<T> {
  // Data
  data: T[];
  meta: ListResponse<T>['meta'] | null;
  selectedItem: T | null;

  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  isMutating: boolean;

  // Error
  error: Error | null;

  // Actions
  list: (options?: Partial<ListOptions>) => Promise<void>;
  get: (id: string | number) => Promise<void>;
  create: (body: Partial<T>) => Promise<T | null>;
  update: (id: string | number, body: Partial<T>) => Promise<T | null>;
  remove: (id: string | number) => Promise<boolean>;
  refresh: () => Promise<void>;
  setFilters: (filters: ListOptions['filters']) => void;
  setSort: (sort: string) => void;
  setSearch: (search: string) => void;
  setPage: (page: number) => void;

  // WebSocket state
  isConnected: boolean;
}

/**
 * React hook for FlashAPI entity with real-time updates and optimistic mutations.
 *
 * @example
 * ```tsx
 * const products = useFlashEntity(client, 'products', { realtime: true, optimistic: true });
 *
 * // List with auto-refresh on events
 * useEffect(() => { products.list(); }, []);
 *
 * // Optimistic create
 * await products.create({ name: 'New', price: 99 });
 * ```
 */
export function useFlashEntity<T extends Record<string, any>>(
  client: FlashClient,
  entityName: string,
  options: UseEntityOptions = {}
): UseEntityResult<T> {
  const { realtime = false, optimistic = false, initialOptions = {}, pollInterval } = options;

  const resource = useMemo(() => client.entity<T>(entityName), [client, entityName]);
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<ListResponse<T>['meta'] | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [listOptions, setListOptions] = useState<Partial<ListOptions>>(initialOptions);

  const unsubRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // List action
  const list = useCallback(
    async (opts?: Partial<ListOptions>) => {
      try {
        setIsLoading(true);
        setError(null);
        const mergedOpts = { ...listOptions, ...opts };
        setListOptions(mergedOpts);
        const result = await resource.list(mergedOpts);
        setData(result.data);
        setMeta(result.meta);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    },
    [resource, listOptions]
  );

  // Refresh (doesn't show initial loading spinner)
  const refresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const result = await resource.list(listOptions);
      setData(result.data);
      setMeta(result.meta);
    } catch (err) {
      // Silent fail on refresh
    } finally {
      setIsRefreshing(false);
    }
  }, [resource, listOptions]);

  // Get single item
  const get = useCallback(
    async (id: string | number) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await resource.get(id);
        setSelectedItem(result.data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    },
    [resource]
  );

  // Create
  const create = useCallback(
    async (body: Partial<T>): Promise<T | null> => {
      try {
        setIsMutating(true);
        setError(null);

        // Optimistic update
        if (optimistic) {
          const tempItem = { ...body, id: `temp-${Date.now()}` } as unknown as T;
          setData((prev) => [tempItem, ...prev]);
        }

        const result = await resource.create(body);

        // Real update
        if (optimistic) {
          setData((prev) => [result.data, ...prev.filter((item) => !String(item.id).startsWith('temp-'))]);
        } else {
          setData((prev) => [result.data, ...prev]);
        }

        return result.data;
      } catch (err) {
        setError(err as Error);
        // Rollback optimistic
        if (optimistic) {
          setData((prev) => prev.filter((item) => !String(item.id).startsWith('temp-')));
        }
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [resource, optimistic]
  );

  // Update
  const update = useCallback(
    async (id: string | number, body: Partial<T>): Promise<T | null> => {
      try {
        setIsMutating(true);
        setError(null);

        // Optimistic update
        if (optimistic) {
          setData((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...body } : item))
          );
          if (selectedItem && selectedItem.id === id) {
            setSelectedItem((prev) => (prev ? { ...prev, ...body } : null));
          }
        }

        const result = await resource.update(id, body);

        // Real update
        setData((prev) =>
          prev.map((item) => (item.id === id ? result.data : item))
        );
        if (selectedItem && selectedItem.id === id) {
          setSelectedItem(result.data);
        }

        return result.data;
      } catch (err) {
        setError(err as Error);
        // Rollback optimistic (refetch)
        if (optimistic) {
          await refresh();
        }
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [resource, optimistic, selectedItem, refresh]
  );

  // Delete
  const remove = useCallback(
    async (id: string | number): Promise<boolean> => {
      try {
        setIsMutating(true);
        setError(null);

        // Optimistic delete
        if (optimistic) {
          setData((prev) => prev.filter((item) => item.id !== id));
          if (selectedItem && selectedItem.id === id) {
            setSelectedItem(null);
          }
        }

        await resource.delete(id);

        // Real delete
        if (!optimistic) {
          setData((prev) => prev.filter((item) => item.id !== id));
          if (selectedItem && selectedItem.id === id) {
            setSelectedItem(null);
          }
        }

        return true;
      } catch (err) {
        setError(err as Error);
        // Rollback optimistic
        if (optimistic) {
          await refresh();
        }
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [resource, optimistic, selectedItem, refresh]
  );

  // Filter/sort/search helpers
  const setFilters = useCallback((filters: ListOptions['filters']) => {
    setListOptions((prev) => ({ ...prev, filters, page: 0 }));
  }, []);

  const setSort = useCallback((sort: string) => {
    setListOptions((prev) => ({ ...prev, sort, page: 0 }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setListOptions((prev) => ({ ...prev, search, page: 0 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setListOptions((prev) => ({ ...prev, page }));
  }, []);

  // Auto-refetch when listOptions change (except on initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (data.length > 0 || meta) {
      list(listOptions);
    }
  }, [listOptions.filters, listOptions.sort, listOptions.search, listOptions.page]);

  // WebSocket real-time
  useEffect(() => {
    if (!realtime) return;

    const topic = `/topic/${entityName.toLowerCase()}`;
    const unsub = client.subscribe<T>(topic, (event: FlashEvent<T>) => {
      setIsConnected(true);

      // Update data based on event type
      if (event.type === 'ENTITY_CREATED') {
        setData((prev) => [event.data, ...prev]);
      } else if (event.type === 'ENTITY_UPDATED') {
        setData((prev) =>
          prev.map((item) => (item.id === event.data.id ? event.data : item))
        );
        if (selectedItem && selectedItem.id === event.data.id) {
          setSelectedItem(event.data);
        }
      } else if (event.type === 'ENTITY_DELETED') {
        setData((prev) => prev.filter((item) => item.id !== event.data.id));
        if (selectedItem && selectedItem.id === event.data.id) {
          setSelectedItem(null);
        }
      } else if (event.type === 'ENTITY_RESTORED') {
        // Refetch to get the restored item
        refresh();
      }
    });

    unsubRef.current = unsub;

    return () => {
      unsub();
      setIsConnected(false);
    };
  }, [client, entityName, realtime, selectedItem, refresh]);

  // Polling fallback
  useEffect(() => {
    if (!pollInterval || realtime) return;

    pollTimerRef.current = setInterval(() => {
      refresh();
    }, pollInterval);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pollInterval, realtime, refresh]);

  return {
    data,
    meta,
    selectedItem,
    isLoading,
    isRefreshing,
    isMutating,
    error,
    list,
    get,
    create,
    update,
    remove,
    refresh,
    setFilters,
    setSort,
    setSearch,
    setPage,
    isConnected,
  };
}
