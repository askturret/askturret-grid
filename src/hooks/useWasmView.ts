import { useRef, useState, useEffect, useMemo } from 'react';
import { GridCore } from '../wasm/GridCore';
import { getNestedValue } from '../utils/nested';
import type { SortState } from './useSortState';

export interface ColumnDef<T> {
  field: keyof T | string;
}

export interface UseWasmViewParams<T> {
  data: T[];
  columns: ColumnDef<T>[];
  filter: string;
  sort: SortState;
  shouldUseWasmCore: boolean;
}

export interface UseWasmViewReturn {
  wasmCoreReady: boolean;
  wasmIndices: number[] | null;
}

/**
 * Hook for managing WASM GridCore integration.
 *
 * Extracted from DataGrid.tsx per Architect's refactor plan (#33).
 * Manages GridCore lifecycle (init/dispose), syncs data on structural changes,
 * and computes filtered/sorted indices via WASM.
 *
 * R1 PRESERVED: wasmIndices useMemo has intentional side effects (setFilter/setSort
 * calls). Moving these to useEffect would introduce a one-render lag on filter/sort
 * changes (indices from previous view rendered once, then corrected). The writes are
 * idempotent and single-writer, so React strict-mode double-invocation is safe.
 * Strict-mode unit test added to verify correctness under double-invocation.
 */
export function useWasmView<T>({
  data,
  columns,
  filter,
  sort,
  shouldUseWasmCore,
}: UseWasmViewParams<T>): UseWasmViewReturn {
  const gridCoreRef = useRef<GridCore | null>(null);
  const [wasmCoreReady, setWasmCoreReady] = useState(false);

  // Track previous row count to detect structural changes
  const prevRowCountRef = useRef<number>(0);

  // Initialize GridCore when needed
  useEffect(() => {
    if (!shouldUseWasmCore) {
      if (gridCoreRef.current) {
        gridCoreRef.current.dispose();
        gridCoreRef.current = null;
        setWasmCoreReady(false);
      }
      return;
    }

    let mounted = true;

    async function init() {
      if (gridCoreRef.current) return;

      const core = new GridCore();
      const success = await core.init();
      if (mounted && success) {
        gridCoreRef.current = core;
        setWasmCoreReady(true);
        console.log('[DataGrid] WASM GridCore initialized successfully');
      } else if (mounted) {
        console.warn('[DataGrid] WASM GridCore failed to initialize, using JS fallback');
      }
    }

    init();

    return () => {
      mounted = false;
      if (gridCoreRef.current) {
        gridCoreRef.current.dispose();
        gridCoreRef.current = null;
      }
    };
  }, [shouldUseWasmCore]);

  // Sync data to GridCore when structure changes (not on every value update)
  useEffect(() => {
    if (!wasmCoreReady || !gridCoreRef.current) return;

    // Only rebuild index when row count changes (structural change)
    // This avoids rebuilding trigram index on every price tick
    if (data.length === prevRowCountRef.current) {
      return;
    }
    prevRowCountRef.current = data.length;

    // Convert row-major data to column-major for GridCore
    // Always send ALL columns so sorting works on any column
    const allFields = columns.map((c) => String(c.field));
    const columnData: unknown[][] = allFields.map((field) => data.map((row) => getNestedValue(row, field)));

    gridCoreRef.current.setData(columnData);
  }, [data, columns, wasmCoreReady]);

  // R1: Compute WASM indices in useMemo with INTENTIONAL side effects.
  // The setFilter/setSort calls are idempotent and single-writer, so strict-mode
  // double-invocation is safe. Moving to useEffect would cause one-render lag.
  const wasmIndices = useMemo(() => {
    if (!wasmCoreReady || !gridCoreRef.current) {
      return null;
    }

    // Set filter (INTENTIONAL side effect - see R1 comment above)
    gridCoreRef.current.setFilter(filter);

    // Set sort - find column index in ALL columns (matches setData order)
    if (sort.field && sort.direction) {
      const allFields = columns.map((c) => String(c.field));
      const sortColIndex = allFields.findIndex((f) => f === sort.field);
      if (sortColIndex >= 0) {
        gridCoreRef.current.setSort(sortColIndex, sort.direction);
      } else {
        gridCoreRef.current.setSort(-1, null);
      }
    } else {
      gridCoreRef.current.setSort(-1, null);
    }

    return gridCoreRef.current.getView();
  }, [filter, sort, columns, wasmCoreReady, data.length]);

  return {
    wasmCoreReady,
    wasmIndices,
  };
}
