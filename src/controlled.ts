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
 * For worker stores (viewport mode), also returns viewport props (rowCount,
 * viewportStart, onViewportChange) enabling slice-mode rendering with placeholders.
 *
 * @example
 * ```tsx
 * const store = useGridStore({ storeType: 'worker', schema, initialData });
 * <DataGrid data={store.data} columns={cols} showFilter {...controlledBy(store)} />
 * // Worker store: data is a viewport slice, DataGrid renders placeholders for out-of-range rows
 * ```
 */
export function controlledBy<T>(store: GridStoreResult<T>) {
  return {
    // Filter/sort controlled mode
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
    // Viewport controlled mode (worker stores only - wasm/js always have startIndex=0)
    // When startIndex > 0, DataGrid enters slice mode and renders placeholders for out-of-range rows
    rowCount: store.viewCount,
    viewportStart: store.startIndex,
    onViewportChange: store.setViewport,
  } as const;
}
