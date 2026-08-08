import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
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

export interface UseEntityReturn<T> {
  // Data
  data: Ref<T[]>;
  meta: Ref<ListResponse<T>['meta'] | null>;
  selectedItem: Ref<T | null>;

  // Loading states
  isLoading: Ref<boolean>;
  isRefreshing: Ref<boolean>;
  isMutating: Ref<boolean>;

  // Error
  error: Ref<Error | null>;

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
  isConnected: Ref<boolean>;

  // Computed
  isEmpty: ComputedRef<boolean>;
  hasData: ComputedRef<boolean>;
}

/**
 * Vue composable for FlashAPI entity with real-time updates and optimistic mutations.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useFlashEntity } from '@flashapi/client/vue';
 *
 * const products = useFlashEntity(client, 'products', { realtime: true, optimistic: true });
 *
 * onMounted(() => products.list());
 * </script>
 *
 * <template>
 *   <div v-if="products.isLoading.value">Loading...</div>
 *   <div v-for="item in products.data.value" :key="item.id">{{ item.name }}</div>
 * </template>
 * ```
 */
export function useFlashEntity<T extends Record<string, any>>(
  client: FlashClient,
  entityName: string,
  options: UseEntityOptions = {}
): UseEntityReturn<T> {
  const { realtime = false, optimistic = false, initialOptions = {}, pollInterval } = options;

  const resource = client.entity<T>(entityName);

  const data = ref<T[]>([]) as Ref<T[]>;
  const meta = ref<ListResponse<T>['meta'] | null>(null);
  const selectedItem = ref<T | null>(null) as Ref<T | null>;
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const isMutating = ref(false);
  const error = ref<Error | null>(null);
  const isConnected = ref(false);
  const listOptions = ref<Partial<ListOptions>>(initialOptions);

  let unsub: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  // List action
  const list = async (opts?: Partial<ListOptions>) => {
    try {
      isLoading.value = true;
      error.value = null;
      const mergedOpts = { ...listOptions.value, ...opts };
      listOptions.value = mergedOpts;
      const result = await resource.list(mergedOpts);
      data.value = result.data;
      meta.value = result.meta;
    } catch (err) {
      error.value = err as Error;
    } finally {
      isLoading.value = false;
    }
  };

  // Refresh (doesn't show initial loading spinner)
  const refresh = async () => {
    try {
      isRefreshing.value = true;
      const result = await resource.list(listOptions.value);
      data.value = result.data;
      meta.value = result.meta;
    } catch (err) {
      // Silent fail on refresh
    } finally {
      isRefreshing.value = false;
    }
  };

  // Get single item
  const get = async (id: string | number) => {
    try {
      isLoading.value = true;
      error.value = null;
      const result = await resource.get(id);
      selectedItem.value = result.data;
    } catch (err) {
      error.value = err as Error;
    } finally {
      isLoading.value = false;
    }
  };

  // Create
  const create = async (body: Partial<T>): Promise<T | null> => {
    try {
      isMutating.value = true;
      error.value = null;

      // Optimistic update
      if (optimistic) {
        const tempItem = { ...body, id: `temp-${Date.now()}` } as unknown as T;
        data.value = [tempItem, ...data.value];
      }

      const result = await resource.create(body);

      // Real update
      if (optimistic) {
        data.value = [result.data, ...data.value.filter((item) => !String(item.id).startsWith('temp-'))];
      } else {
        data.value = [result.data, ...data.value];
      }

      return result.data;
    } catch (err) {
      error.value = err as Error;
      // Rollback optimistic
      if (optimistic) {
        data.value = data.value.filter((item) => !String(item.id).startsWith('temp-'));
      }
      return null;
    } finally {
      isMutating.value = false;
    }
  };

  // Update
  const update = async (id: string | number, body: Partial<T>): Promise<T | null> => {
    try {
      isMutating.value = true;
      error.value = null;

      // Optimistic update
      if (optimistic) {
        data.value = data.value.map((item) => (item.id === id ? { ...item, ...body } : item));
        if (selectedItem.value && selectedItem.value.id === id) {
          selectedItem.value = { ...selectedItem.value, ...body };
        }
      }

      const result = await resource.update(id, body);

      // Real update
      data.value = data.value.map((item) => (item.id === id ? result.data : item));
      if (selectedItem.value && selectedItem.value.id === id) {
        selectedItem.value = result.data;
      }

      return result.data;
    } catch (err) {
      error.value = err as Error;
      // Rollback optimistic (refetch)
      if (optimistic) {
        await refresh();
      }
      return null;
    } finally {
      isMutating.value = false;
    }
  };

  // Delete
  const remove = async (id: string | number): Promise<boolean> => {
    try {
      isMutating.value = true;
      error.value = null;

      // Optimistic delete
      if (optimistic) {
        data.value = data.value.filter((item) => item.id !== id);
        if (selectedItem.value && selectedItem.value.id === id) {
          selectedItem.value = null;
        }
      }

      await resource.delete(id);

      // Real delete
      if (!optimistic) {
        data.value = data.value.filter((item) => item.id !== id);
        if (selectedItem.value && selectedItem.value.id === id) {
          selectedItem.value = null;
        }
      }

      return true;
    } catch (err) {
      error.value = err as Error;
      // Rollback optimistic
      if (optimistic) {
        await refresh();
      }
      return false;
    } finally {
      isMutating.value = false;
    }
  };

  // Filter/sort/search helpers
  const setFilters = (filters: ListOptions['filters']) => {
    listOptions.value = { ...listOptions.value, filters, page: 0 };
  };

  const setSort = (sort: string) => {
    listOptions.value = { ...listOptions.value, sort, page: 0 };
  };

  const setSearch = (search: string) => {
    listOptions.value = { ...listOptions.value, search, page: 0 };
  };

  const setPage = (page: number) => {
    listOptions.value = { ...listOptions.value, page };
  };

  // Computed helpers
  const isEmpty = computed(() => data.value.length === 0);
  const hasData = computed(() => data.value.length > 0);

  // Watch listOptions for auto-refetch (skip initial)
  let isFirstWatch = true;
  watch(
    () => listOptions.value,
    () => {
      if (isFirstWatch) {
        isFirstWatch = false;
        return;
      }
      if (data.value.length > 0 || meta.value) {
        list(listOptions.value);
      }
    },
    { deep: true }
  );

  // WebSocket real-time
  onMounted(() => {
    if (!realtime) return;

    const topic = `/topic/${entityName.toLowerCase()}`;
    unsub = client.subscribe<T>(topic, (event: FlashEvent<T>) => {
      isConnected.value = true;

      // Update data based on event type
      if (event.type === 'ENTITY_CREATED') {
        data.value = [event.data, ...data.value];
      } else if (event.type === 'ENTITY_UPDATED') {
        data.value = data.value.map((item) => (item.id === event.data.id ? event.data : item));
        if (selectedItem.value && selectedItem.value.id === event.data.id) {
          selectedItem.value = event.data;
        }
      } else if (event.type === 'ENTITY_DELETED') {
        data.value = data.value.filter((item) => item.id !== event.data.id);
        if (selectedItem.value && selectedItem.value.id === event.data.id) {
          selectedItem.value = null;
        }
      } else if (event.type === 'ENTITY_RESTORED') {
        // Refetch to get the restored item
        refresh();
      }
    });
  });

  // Polling fallback
  onMounted(() => {
    if (!pollInterval || realtime) return;

    pollTimer = setInterval(() => {
      refresh();
    }, pollInterval);
  });

  // Cleanup
  onUnmounted(() => {
    if (unsub) {
      unsub();
      isConnected.value = false;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
    }
  });

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
    isEmpty,
    hasData,
  };
}
