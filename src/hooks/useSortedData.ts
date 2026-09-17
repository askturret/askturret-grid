import { useMemo, useCallback } from 'react';
import { filterAndSort, isWasmAvailable, type SortDirection as WasmSortDirection } from '../wasm';
import { getNestedValue } from '../utils/nested';
import type { SortState } from './useSortState';

export interface ColumnDef<T> {
  field: keyof T | string;
}

export interface UseSortedDataParams<T> {
  data: T[];
  filter: string;
  filterFields?: (keyof T)[] | undefined;
  columns: ColumnDef<T>[];
  sort: SortState;
  wasmCoreReady: boolean;
  wasmIndices: number[] | null;
  shouldVirtualize: boolean;
  passthrough?: boolean | undefined;
  /** Total view size when data is a slice (worker store controlled mode) */
  rowCount?: number | undefined;
  /** Absolute index of data[0] in the full view (worker store controlled mode) */
  viewportStart?: number | undefined;
}

export interface UseSortedDataReturn<T> {
  sortedData: T[];
  visibleCount: number;
  getRowAtIndex: (index: number) => T | undefined;
}

/**
 * Hook for computing sorted/filtered data.
 *
 * Extracted from DataGrid.tsx per Architect's refactor plan (#33).
 * Pure derivation over data, filter, sort, and WASM view — no ref writes,
 * no setState. Returns sortedData for non-virtualized rendering, visibleCount
 * for virtualizer sizing, and getRowAtIndex for efficient virtualized access.
 *
 * Strategy:
 * - Passthrough mode (controlled-by-store) → return data as-is, no filter/sort
 * - WASM indices (when available) → use cached view from GridCore
 * - Legacy WASM filterAndSort (medium datasets, filter/sort active) → old path
 * - JavaScript fallback → filter then sort in-memory
 */
export function useSortedData<T>({
  data,
  filter,
  filterFields,
  columns,
  sort,
  wasmCoreReady,
  wasmIndices,
  shouldVirtualize,
  passthrough = false,
  rowCount,
  viewportStart,
}: UseSortedDataParams<T>): UseSortedDataReturn<T> {
  // Slice mode: data is a viewport slice of a larger view (worker store controlled mode)
  const isSliceMode = rowCount !== undefined && viewportStart !== undefined;
  // sortedData for non-virtualized mode (still needed for table rendering)
  // For virtualized mode, we use getRowAtIndex directly
  const sortedData = useMemo(() => {
    // Slice mode: data is a viewport slice, not the full view
    // Rendering a slice as if it were the whole table is nonsense - return empty
    if (isSliceMode) {
      return [] as T[];
    }
    // Passthrough mode: controlled-by-store — data is already filtered/sorted by the engine
    // Short-circuit to avoid redundant filter+sort pass that could diverge when filterFields
    // is narrower than the store's indexed columns (#32 divergence bug)
    if (passthrough) {
      return data;
    }
    // For WASM mode with virtualization, return empty - we'll use getRowAtIndex
    if (wasmCoreReady && wasmIndices && shouldVirtualize) {
      // Return a sparse proxy array that uses cached indices
      // This avoids creating 10k item array on every render
      return [] as T[];
    }

    const fieldsToSearch = filterFields || columns.map((c) => c.field as keyof T);
    const hasFilter = filter.trim().length > 0;
    const hasSort = sort.field && sort.direction;

    // Use WASM indices if available (non-virtualized mode)
    if (wasmCoreReady && wasmIndices) {
      return wasmIndices.map((i) => data[i]).filter((row): row is T => row !== undefined);
    }

    // Fallback: Try old WASM filterAndSort for medium datasets
    if (isWasmAvailable() && data.length > 1000 && (hasFilter || hasSort)) {
      const filterColumns = fieldsToSearch.map((field) =>
        data.map((row) => getNestedValue(row, String(field)))
      );
      const sortValues = sort.field
        ? data.map((row) => getNestedValue(row, sort.field!))
        : data.map((_, i) => i);
      const direction: WasmSortDirection = sort.direction === 'desc' ? 'desc' : 'asc';
      const indices = filterAndSort(sortValues, filterColumns, filter, direction);
      return indices.map((i) => data[i]).filter((row): row is T => row !== undefined);
    }

    // JavaScript fallback
    let result = data;

    if (hasFilter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((row) =>
        fieldsToSearch.some((field) => {
          const value = getNestedValue(row, String(field));
          if (value == null) return false;
          return String(value).toLowerCase().includes(lowerFilter);
        })
      );
    }

    if (hasSort) {
      result = [...result].sort((a, b) => {
        const aVal = getNestedValue(a, sort.field!);
        const bVal = getNestedValue(b, sort.field!);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sort.direction === 'asc' ? 1 : -1;
        if (bVal == null) return sort.direction === 'asc' ? -1 : 1;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [
    data,
    filter,
    filterFields,
    columns,
    sort,
    wasmCoreReady,
    wasmIndices,
    shouldVirtualize,
    passthrough,
    isSliceMode,
  ]);

  // Get row at index - uses WASM indices or direct data access
  const getRowAtIndex = useCallback(
    (index: number): T | undefined => {
      // Slice mode: map absolute view index to data slice offset
      // Returns undefined for out-of-slice indices (DataGrid renders placeholder)
      if (isSliceMode) {
        const offset = index - (viewportStart ?? 0);
        return offset >= 0 && offset < data.length ? data[offset] : undefined;
      }
      // Passthrough mode: data is already in final order, no index mapping needed
      if (passthrough) {
        return data[index];
      }
      if (wasmCoreReady && wasmIndices) {
        const dataIndex = wasmIndices[index];
        return dataIndex !== undefined ? data[dataIndex] : undefined;
      }
      return data[index];
    },
    [data, wasmCoreReady, wasmIndices, passthrough, isSliceMode, viewportStart]
  );

  // Get total visible count
  const visibleCount = useMemo(() => {
    // Slice mode: use the total row count, not data.length
    if (isSliceMode) {
      return rowCount ?? 0;
    }
    // Passthrough mode: data is already filtered, count is just data.length
    if (passthrough) {
      return data.length;
    }
    if (wasmCoreReady && wasmIndices) {
      return wasmIndices.length;
    }

    const fieldsToSearch = filterFields || columns.map((c) => c.field as keyof T);
    const hasFilter = filter.trim().length > 0;

    if (!hasFilter) {
      return data.length;
    }

    // For JS fallback with filter, we need to count
    const lowerFilter = filter.toLowerCase();
    return data.filter((row) =>
      fieldsToSearch.some((field) => {
        const value = getNestedValue(row, String(field));
        if (value == null) return false;
        return String(value).toLowerCase().includes(lowerFilter);
      })
    ).length;
  }, [data, filter, filterFields, columns, wasmCoreReady, wasmIndices, passthrough, isSliceMode, rowCount]);

  return {
    sortedData,
    visibleCount,
    getRowAtIndex,
  };
}
