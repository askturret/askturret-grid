/**
 * useGridStore - Unified hook for selecting grid store implementation
 *
 * Provides a simple API for choosing between:
 * - 'worker' (default): Web Worker for non-blocking updates, best for real-time streaming
 * - 'wasm': WASM-accelerated, best for heavy filtering on large datasets
 * - 'js': Pure JavaScript fallback, no dependencies
 *
 * @example
 * ```tsx
 * const { data, updateRows, isReady, setFilter, setSort } = useGridStore({
 *   storeType: 'worker',
 *   schema: [
 *     { name: 'id', type: 'string', primaryKey: true },
 *     { name: 'symbol', type: 'string', indexed: true },
 *     { name: 'price', type: 'number' },
 *   ],
 *   initialData: rows,
 * });
 *
 * // Stream updates (non-blocking with worker)
 * updateRows(priceUpdates);
 *
 * return <DataGrid data={data} columns={columns} rowKey="id" />;
 * ```
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WorkerGridStore } from '../wasm/WorkerGridStore';
import { WasmGridStore, type ColumnSchema, type SortDirection } from '../wasm/WasmGridStore';
import { type GridColumn, toColumnSchema } from '../columns';

export type StoreType = 'worker' | 'wasm' | 'js';

export interface UseGridStoreConfig<T> {
  /** Store implementation to use */
  storeType: StoreType;
  /** Schema describing columns - accepts legacy ColumnSchema or unified GridColumn */
  schema: ColumnSchema[] | GridColumn<T>[];
  /** Initial data to load */
  initialData?: T[];
  /** Batch interval for worker store (default: 16ms for ~60fps) */
  batchInterval?: number;
  /** Number of visible rows for worker store viewport (default: 50) */
  visibleRowCount?: number;
}

export interface GridStoreResult<T> {
  /** Current data array (for DataGrid) */
  data: T[];
  /** Whether the store is initialized and ready */
  isReady: boolean;
  /** Store type being used */
  storeType: StoreType;
  /** Total row count */
  rowCount: number;
  /** Filtered row count */
  viewCount: number;
  /** Index of the first row of `data` in the full filtered view. Always 0 for wasm/js engines. */
  startIndex: number;
  /** Current filter text */
  filter: string;
  /** Current sort state */
  sort: { field: string | null; direction: SortDirection };

  // Data operations
  /** Load/replace all data */
  loadRows: (rows: T[]) => Promise<void> | void;
  /** Update rows (non-blocking with worker, blocking with wasm/js) */
  updateRows: (updates: Array<{ id: string; [field: string]: unknown }>) => void;

  // View operations
  /** Set filter text */
  setFilter: (text: string) => void;
  /** Clear filter */
  clearFilter: () => void;
  /** Set sort column and direction */
  setSort: (column: string, direction: SortDirection) => void;
  /** Clear sort */
  clearSort: () => void;

  // Viewport (for virtualization with worker store)
  /** Set visible range for worker store */
  setViewport: (startIndex: number, endIndex: number) => void;

  /** Dispose the store */
  dispose: () => void;
}

// Pure JS store implementation
class JsGridStore<T extends Record<string, unknown>> {
  private data: T[] = [];
  private idField: string;
  private idMap = new Map<string, number>();
  private indexedFields: string[];
  private filterText = '';
  private sortColumn: string | null = null;
  private sortDir: SortDirection = null;
  private viewCache: number[] | null = null;

  constructor(schema: ColumnSchema[]) {
    this.idField = schema.find((c) => c.primaryKey)?.name || schema[0].name;
    this.indexedFields = schema.filter((c) => c.indexed).map((c) => c.name);
  }

  loadRows(rows: T[]): number {
    this.data = rows.map((r) => ({ ...r }));
    this.idMap.clear();
    this.data.forEach((row, i) => {
      this.idMap.set(String(row[this.idField]), i);
    });
    this.viewCache = null;
    return this.data.length;
  }

  updateRows(updates: Array<{ id: string; [field: string]: unknown }>): number {
    for (const update of updates) {
      const idx = this.idMap.get(update.id);
      if (idx !== undefined) {
        Object.assign(this.data[idx], update);
      }
    }
    this.viewCache = null;
    return updates.length;
  }

  setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this.viewCache = null;
  }

  clearFilter(): void {
    this.filterText = '';
    this.viewCache = null;
  }

  setSort(column: string, direction: SortDirection): void {
    this.sortColumn = column;
    this.sortDir = direction;
    this.viewCache = null;
  }

  clearSort(): void {
    this.sortColumn = null;
    this.sortDir = null;
    this.viewCache = null;
  }

  rowCount(): number {
    return this.data.length;
  }

  viewCount(): number {
    this.ensureView();
    return this.viewCache!.length;
  }

  getViewData(): T[] {
    this.ensureView();
    return this.viewCache!.map((i) => this.data[i]);
  }

  private ensureView(): void {
    if (this.viewCache) return;

    let indices = this.data.map((_, i) => i);

    // Filter
    if (this.filterText) {
      indices = indices.filter((i) => {
        const row = this.data[i];
        return this.indexedFields.some((col) => {
          const val = row[col];
          return val && String(val).toLowerCase().includes(this.filterText);
        });
      });
    }

    // Sort
    if (this.sortColumn && this.sortDir) {
      const col = this.sortColumn;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      indices.sort((a, b) => {
        const va = this.data[a][col];
        const vb = this.data[b][col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return (va - vb) * dir;
        }
        return String(va).localeCompare(String(vb)) * dir;
      });
    }

    this.viewCache = indices;
  }

  dispose(): void {
    this.data = [];
    this.idMap.clear();
    this.viewCache = null;
  }
}

/**
 * Hook for using a grid store with configurable implementation
 */
export function useGridStore<T extends Record<string, unknown>>(
  config: UseGridStoreConfig<T>
): GridStoreResult<T> {
  const { storeType, schema, initialData, batchInterval = 16, visibleRowCount = 50 } = config;

  // R1: Runtime shape discrimination - normalize GridColumn[] to ColumnSchema[]
  // GridColumn has 'header' (presentation), ColumnSchema has 'type' only
  const normalizedSchema: ColumnSchema[] = useMemo(() => {
    if (schema.length === 0) return [];

    const firstCol = schema[0];
    const isGridColumn = 'header' in firstCol;

    if (isGridColumn) {
      // Convert GridColumn[] to ColumnSchema[] (throws if missing 'type' or has nested 'path')
      return (schema as GridColumn<T>[]).map(toColumnSchema);
    }

    // Already ColumnSchema[], use as-is
    return schema as ColumnSchema[];
  }, [schema]);

  const [isReady, setIsReady] = useState(false);
  const [data, setData] = useState<T[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const [filter, setFilterState] = useState('');
  const [sort, setSortState] = useState<{ field: string | null; direction: SortDirection }>({
    field: null,
    direction: null,
  });

  // Store references
  const workerStoreRef = useRef<WorkerGridStore<T> | null>(null);
  const wasmStoreRef = useRef<WasmGridStore<T> | null>(null);
  const jsStoreRef = useRef<JsGridStore<T> | null>(null);

  // Initialize store
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        switch (storeType) {
          case 'worker': {
            const store = await WorkerGridStore.create<T>(normalizedSchema, { batchInterval });
            if (!mounted) {
              store.dispose();
              return;
            }
            workerStoreRef.current = store;

            // Subscribe to updates
            store.onVisibleRowsChange((rows, startIdx) => {
              setData(rows);
              setStartIndex(startIdx);
            });
            store.onViewCountChange((vc, tc) => {
              setViewCount(vc);
              setRowCount(tc);
            });

            // Set initial viewport
            store.setViewport(0, visibleRowCount);

            // Load initial data
            if (initialData && initialData.length > 0) {
              await store.loadRows(initialData);
            }
            break;
          }

          case 'wasm': {
            const store = await WasmGridStore.create<T>(normalizedSchema);
            if (!mounted) {
              store.dispose();
              return;
            }
            wasmStoreRef.current = store;

            // Subscribe to updates
            store.onViewChange(() => {
              setData(store.getVisibleRows(0, store.getViewCount()));
              setViewCount(store.getViewCount());
              setRowCount(store.getRowCount());
            });

            // Load initial data
            if (initialData && initialData.length > 0) {
              store.loadRows(initialData);
              setData(store.getVisibleRows(0, store.getViewCount()));
              setViewCount(store.getViewCount());
              setRowCount(store.getRowCount());
            }
            break;
          }

          case 'js':
          default: {
            const store = new JsGridStore<T>(normalizedSchema);
            jsStoreRef.current = store;

            // Load initial data
            if (initialData && initialData.length > 0) {
              store.loadRows(initialData);
              setData(store.getViewData());
              setViewCount(store.viewCount());
              setRowCount(store.rowCount());
            }
            break;
          }
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (error) {
        console.error(`[useGridStore] Failed to initialize ${storeType} store:`, error);
      }
    }

    init();

    return () => {
      mounted = false;
      workerStoreRef.current?.dispose();
      wasmStoreRef.current?.dispose();
      jsStoreRef.current?.dispose();
      workerStoreRef.current = null;
      wasmStoreRef.current = null;
      jsStoreRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeType, batchInterval, visibleRowCount]);
  // Removed schema/initialData from deps to prevent re-init on fresh-but-equivalent references.
  // Store initializes once on mount. To reload data, use the loadRows() method.
  // If schema/storeType must change, remount the component (via key prop).

  // Load rows
  const loadRows = useCallback(
    async (rows: T[]) => {
      switch (storeType) {
        case 'worker':
          if (workerStoreRef.current) {
            await workerStoreRef.current.loadRows(rows);
          }
          break;
        case 'wasm':
          if (wasmStoreRef.current) {
            wasmStoreRef.current.loadRows(rows);
            setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
            setViewCount(wasmStoreRef.current.getViewCount());
            setRowCount(wasmStoreRef.current.getRowCount());
          }
          break;
        case 'js':
          if (jsStoreRef.current) {
            jsStoreRef.current.loadRows(rows);
            setData(jsStoreRef.current.getViewData());
            setViewCount(jsStoreRef.current.viewCount());
            setRowCount(jsStoreRef.current.rowCount());
          }
          break;
      }
    },
    [storeType]
  );

  // Update rows
  const updateRows = useCallback(
    (updates: Array<{ id: string; [field: string]: unknown }>) => {
      switch (storeType) {
        case 'worker':
          // Non-blocking - batched in worker
          workerStoreRef.current?.queueUpdates(updates);
          break;
        case 'wasm':
          if (wasmStoreRef.current) {
            wasmStoreRef.current.updateRows(updates);
            setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
          }
          break;
        case 'js':
          if (jsStoreRef.current) {
            jsStoreRef.current.updateRows(updates);
            setData(jsStoreRef.current.getViewData());
          }
          break;
      }
    },
    [storeType]
  );

  // Filter
  const setFilter = useCallback(
    (text: string) => {
      setFilterState(text);
      switch (storeType) {
        case 'worker':
          workerStoreRef.current?.setFilter(text);
          break;
        case 'wasm':
          if (wasmStoreRef.current) {
            wasmStoreRef.current.setFilter(text);
            setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
            setViewCount(wasmStoreRef.current.getViewCount());
          }
          break;
        case 'js':
          if (jsStoreRef.current) {
            jsStoreRef.current.setFilter(text);
            setData(jsStoreRef.current.getViewData());
            setViewCount(jsStoreRef.current.viewCount());
          }
          break;
      }
    },
    [storeType]
  );

  const clearFilter = useCallback(() => {
    setFilterState('');
    switch (storeType) {
      case 'worker':
        workerStoreRef.current?.clearFilter();
        break;
      case 'wasm':
        if (wasmStoreRef.current) {
          wasmStoreRef.current.clearFilter();
          setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
          setViewCount(wasmStoreRef.current.getViewCount());
        }
        break;
      case 'js':
        if (jsStoreRef.current) {
          jsStoreRef.current.clearFilter();
          setData(jsStoreRef.current.getViewData());
          setViewCount(jsStoreRef.current.viewCount());
        }
        break;
    }
  }, [storeType]);

  // Sort
  const setSort = useCallback(
    (column: string, direction: SortDirection) => {
      setSortState({ field: column, direction });
      switch (storeType) {
        case 'worker':
          workerStoreRef.current?.setSort(column, direction);
          break;
        case 'wasm':
          if (wasmStoreRef.current) {
            wasmStoreRef.current.setSort(column, direction);
            setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
          }
          break;
        case 'js':
          if (jsStoreRef.current) {
            jsStoreRef.current.setSort(column, direction);
            setData(jsStoreRef.current.getViewData());
          }
          break;
      }
    },
    [storeType]
  );

  const clearSort = useCallback(() => {
    setSortState({ field: null, direction: null });
    switch (storeType) {
      case 'worker':
        workerStoreRef.current?.clearSort();
        break;
      case 'wasm':
        if (wasmStoreRef.current) {
          wasmStoreRef.current.clearSort();
          setData(wasmStoreRef.current.getVisibleRows(0, wasmStoreRef.current.getViewCount()));
        }
        break;
      case 'js':
        if (jsStoreRef.current) {
          jsStoreRef.current.clearSort();
          setData(jsStoreRef.current.getViewData());
        }
        break;
    }
  }, [storeType]);

  // Viewport (worker only)
  const setViewport = useCallback(
    (startIndex: number, endIndex: number) => {
      if (storeType === 'worker' && workerStoreRef.current) {
        workerStoreRef.current.setViewport(startIndex, endIndex);
      }
    },
    [storeType]
  );

  // Dispose
  const dispose = useCallback(() => {
    workerStoreRef.current?.dispose();
    wasmStoreRef.current?.dispose();
    jsStoreRef.current?.dispose();
    workerStoreRef.current = null;
    wasmStoreRef.current = null;
    jsStoreRef.current = null;
    setIsReady(false);
    setData([]);
  }, []);

  return {
    data,
    isReady,
    storeType,
    rowCount,
    viewCount,
    startIndex,
    filter,
    sort,
    loadRows,
    updateRows,
    setFilter,
    clearFilter,
    setSort,
    clearSort,
    setViewport,
    dispose,
  };
}
