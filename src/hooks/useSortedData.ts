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
  filterFields?: (keyof T)[];
  columns: ColumnDef<T>[];
  sort: SortState;
  wasmCoreReady: boolean;
  wasmIndices: number[] | null;
  shouldVirtualize: boolean;
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
}: UseSortedDataParams<T>): UseSortedDataReturn<T> {
  // sortedData for non-virtualized mode (still needed for table rendering)
  // For virtualized mode, we use getRowAtIndex directly
  const sortedData = useMemo(() => {
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
      return wasmIndices.map((i) => data[i]);
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
      return indices.map((i) => data[i]);
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
  }, [data, filter, filterFields, columns, sort, wasmCoreReady, wasmIndices, shouldVirtualize]);

  // Get row at index - uses WASM indices or direct data access
  const getRowAtIndex = useCallback(
    (index: number): T | undefined => {
      if (wasmCoreReady && wasmIndices) {
        const dataIndex = wasmIndices[index];
        return dataIndex !== undefined ? data[dataIndex] : undefined;
      }
      return data[index];
    },
    [data, wasmCoreReady, wasmIndices]
  );

  // Get total visible count
  const visibleCount = useMemo(() => {
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
  }, [data, filter, filterFields, columns, wasmCoreReady, wasmIndices]);

  return {
    sortedData,
    visibleCount,
    getRowAtIndex,
  };
}
