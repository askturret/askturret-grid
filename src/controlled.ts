/**
 * Controlled-mode helpers for wiring DataGrid to external stores
 */

import type { GridStoreResult } from './hooks/useGridStore';
import type { SortDirection } from './wasm/WasmGridStore';

/**
 * Convenience helper: wire a DataGrid to a useGridStore result in one spread.
 *
 * Returns controlled props that make DataGrid trust the store's filter/sort state
 * and skip its own internal filter/sort passes.
 *
 * @example
 * ```tsx
 * const store = useGridStore({ storeType: 'wasm', schema, initialData });
 * <DataGrid data={store.data} columns={cols} showFilter {...controlledBy(store)} />
 * ```
 */
export function controlledBy<T>(store: GridStoreResult<T>) {
  return {
    filter: store.filter,
    onFilterChange: store.setFilter,
    sort: store.sort,
    onSortChange: ({ field, direction }: { field: string | null; direction: SortDirection }) => {
      if (field && direction) {
        store.setSort(field, direction);
      } else {
        store.clearSort();
      }
    },
  } as const;
}
