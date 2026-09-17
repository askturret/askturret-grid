/**
 * GridCore - High-performance grid state manager using WASM
 *
 * Keeps data in WASM memory to avoid marshalling overhead.
 * Only transfers indices back to JS for rendering.
 */

export type SortDirection = 'asc' | 'desc' | null;

interface WasmGridState {
  set_data(columns: unknown[][]): void;
  set_sort(col: number, direction: number): void;
  set_filter(search: string): void;
  get_view(): Uint32Array;
  get_view_count(): number;
  row_count(): number;
  col_count(): number;
}

// IndexedGridState - trigram-indexed for fast filtering
interface WasmIndexedGridState {
  set_data(columns: unknown[][]): void;
  set_sort(col: number, direction: number): void;
  set_filter(search: string): void;
  get_view(): Uint32Array;
  get_view_count(): number;
  row_count(): number;
  col_count(): number;
}

interface WasmModule {
  GridState: new () => WasmGridState;
  IndexedGridState: new () => WasmIndexedGridState;
  SortDir: { Asc: 0; Desc: 1; None: 2 };
  bench_grid_state(count: number): number;
  bench_filter_only(count: number): number;
  bench_sort_only(count: number): number;
  // Indexed filter benchmarks
  bench_indexed_filter_with_build(count: number): number;
  bench_indexed_filter_only(count: number): number;
  bench_scan_filter(count: number): number;
  bench_repeated_filter(count: number, iterations: number): number;
  default(input?: unknown): Promise<unknown>;
}

let wasmModule: WasmModule | null = null;
let wasmLoadPromise: Promise<WasmModule | null> | null = null;

/**
 * Initialize the WASM module for GridCore
 */
export async function initGridCore(): Promise<boolean> {
  if (wasmModule) return true;

  if (!wasmLoadPromise) {
    wasmLoadPromise = loadWasm();
  }

  const mod = await wasmLoadPromise;
  return mod !== null;
}

async function loadWasm(): Promise<WasmModule | null> {
  try {
    // @ts-expect-error - module may not exist
    const wasm = await import('@askturret/grid-wasm');
    if (wasm.default && typeof wasm.default === 'function') {
      await wasm.default();
    }
    // GridCore requires GridState/IndexedGridState classes which are not in the base WASM package
    // If they don't exist, throw to fall back to JS
    if (!wasm.GridState || !wasm.IndexedGridState) {
      throw new Error('GridState classes not available in WASM module');
    }
    wasmModule = wasm as WasmModule;
    return wasmModule;
  } catch (e) {
    console.warn('[GridCore] WASM not available:', e);
    return null;
  }
}

/**
 * Check if GridCore WASM is available
 */
export function isGridCoreAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Run WASM benchmark (filter + sort with data generation in WASM)
 */
export function benchGridState(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_grid_state(rowCount);
}

/**
 * Run WASM benchmark - filter only (search strings pre-built)
 */
export function benchFilterOnly(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_filter_only(rowCount);
}

/**
 * Run WASM benchmark - sort only (no filter)
 */
export function benchSortOnly(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_sort_only(rowCount);
}

/**
 * Run WASM benchmark - indexed filter with index build time
 */
export function benchIndexedFilterWithBuild(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_indexed_filter_with_build(rowCount);
}

/**
 * Run WASM benchmark - indexed filter only (index pre-built)
 */
export function benchIndexedFilterOnly(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_indexed_filter_only(rowCount);
}

/**
 * Run WASM benchmark - scan filter (no index) for comparison
 */
export function benchScanFilter(rowCount: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_scan_filter(rowCount);
}

/**
 * Run WASM benchmark - repeated filtering (simulates user typing)
 */
export function benchRepeatedFilter(rowCount: number, iterations: number): number | null {
  if (!wasmModule) return null;
  return wasmModule.bench_repeated_filter(rowCount, iterations);
}

// Direction constants
const SORT_ASC = 0;
const SORT_DESC = 1;
const SORT_NONE = 2;

function dirToNumber(dir: SortDirection): number {
  if (dir === 'asc') return SORT_ASC;
  if (dir === 'desc') return SORT_DESC;
  return SORT_NONE;
}

/**
 * GridCore - Persistent grid state with WASM acceleration
 *
 * Uses IndexedGridState with trigram indexing for fast filtering.
 *
 * Usage:
 * ```ts
 * const core = new GridCore();
 * await core.init();
 *
 * // Set data once (builds trigram index)
 * core.setData([
 *   ['Alice', 'Bob', 'Charlie'],  // column 0
 *   [100, 200, 150],               // column 1
 * ]);
 *
 * // Configure view
 * core.setSort(1, 'desc');
 * core.setFilter('ali');  // Uses trigram index for O(1) lookup
 *
 * // Get indices for rendering
 * const indices = core.getView();  // [0] (only Alice matches, sorted)
 * ```
 */
export class GridCore {
  private wasmState: WasmIndexedGridState | null = null;
  private jsData: unknown[][] = [];
  private jsSortCol: number = -1;
  private jsSortDir: SortDirection = null;
  private jsFilter: string = '';
  private jsFilterCols: number[] = [];
  private jsViewCache: number[] | null = null;

  /**
   * Initialize the GridCore instance
   * Must be called before using other methods
   */
  async init(): Promise<boolean> {
    const available = await initGridCore();
    if (available && wasmModule) {
      // Use IndexedGridState for trigram-indexed filtering
      this.wasmState = new wasmModule.IndexedGridState();
      return true;
    }
    return false;
  }

  /**
   * Check if using WASM backend
   */
  isWasm(): boolean {
    return this.wasmState !== null;
  }

  /**
   * Set grid data (column-major order)
   * Builds trigram index for fast filtering
   * @param columns Array of column arrays
   */
  setData(columns: unknown[][]): void {
    this.jsData = columns;
    this.jsFilterCols = columns.map((_, i) => i);
    this.invalidateCache();

    if (this.wasmState) {
      this.wasmState.set_data(columns);
    }
  }

  /**
   * Set sort configuration
   */
  setSort(col: number, direction: SortDirection): void {
    this.jsSortCol = col;
    this.jsSortDir = direction;
    this.invalidateCache();

    if (this.wasmState) {
      this.wasmState.set_sort(col, dirToNumber(direction));
    }
  }

  /**
   * Set filter search string
   * Uses trigram index for O(1) lookup when WASM available
   */
  setFilter(search: string): void {
    this.jsFilter = search.toLowerCase();
    this.invalidateCache();

    if (this.wasmState) {
      this.wasmState.set_filter(search);
    }
  }

  /**
   * Get sorted/filtered view indices
   */
  getView(): number[] {
    if (this.wasmState) {
      return Array.from(this.wasmState.get_view());
    }
    return this.getJsView();
  }

  /**
   * Get a range of view indices (for virtualization)
   */
  getViewRange(start: number, count: number): number[] {
    if (this.wasmState) {
      const view = Array.from(this.wasmState.get_view());
      return view.slice(start, start + count);
    }
    const view = this.getJsView();
    return view.slice(start, start + count);
  }

  /**
   * Get total count after filtering
   */
  getViewCount(): number {
    if (this.wasmState) {
      return this.wasmState.get_view_count();
    }
    return this.getJsView().length;
  }

  /**
   * Get row count
   */
  getRowCount(): number {
    if (this.wasmState) {
      return this.wasmState.row_count();
    }
    return this.jsData[0]?.length || 0;
  }

  /**
   * Get column count
   */
  getColCount(): number {
    if (this.wasmState) {
      return this.wasmState.col_count();
    }
    return this.jsData.length;
  }

  /**
   * Clean up WASM resources
   */
  dispose(): void {
    this.wasmState = null;
  }

  private invalidateCache(): void {
    this.jsViewCache = null;
  }

  private getJsView(): number[] {
    if (this.jsViewCache) {
      return this.jsViewCache;
    }

    const rowCount = this.jsData[0]?.length || 0;
    let indices = Array.from({ length: rowCount }, (_, i) => i);

    // Filter
    if (this.jsFilter) {
      indices = indices.filter((row) =>
        this.jsFilterCols.some((col) => {
          const val = this.jsData[col]?.[row];
          if (val == null) return false;
          return String(val).toLowerCase().includes(this.jsFilter);
        })
      );
    }

    // Sort
    if (this.jsSortCol >= 0 && this.jsSortDir) {
      const col = this.jsData[this.jsSortCol];
      if (col) {
        indices.sort((a, b) => {
          const va = col[a];
          const vb = col[b];

          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;

          let cmp: number;
          if (typeof va === 'number' && typeof vb === 'number') {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb));
          }

          return this.jsSortDir === 'desc' ? -cmp : cmp;
        });
      }
    }

    this.jsViewCache = indices;
    return indices;
  }
}
