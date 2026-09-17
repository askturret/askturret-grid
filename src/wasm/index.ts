/**
 * WASM bridge for high-performance sorting and filtering
 * Falls back to pure JavaScript if WASM is not available
 *
 * Install WASM acceleration: npm install @askturret/grid-wasm
 */

export type SortDirection = 'asc' | 'desc';
export type FilterMode = 'contains' | 'equals' | 'startsWith' | 'endsWith';

// WASM module types (matching askturret-grid-wasm)
interface WasmIndexResult {
  readonly indices: Uint32Array;
  readonly len: number;
  free?(): void;
}

interface WasmModule {
  default(input?: unknown): Promise<unknown>;
  sort_numbers(values: Float64Array, direction: number): WasmIndexResult;
  sort_strings(values: unknown[], direction: number): WasmIndexResult;
  filter_strings(values: unknown[], search: string, mode: number): WasmIndexResult;
  filter_range(values: Float64Array, min: number, max: number): WasmIndexResult;
  bench_sort(count: number): number;
  bench_filter(count: number): number;
  bench_trigram(count: number): number;
  SortDirection: { Asc: 0; Desc: 1 };
  FilterMode: { Contains: 0; Equals: 1; StartsWith: 2; EndsWith: 3 };
  TrigramIndex: new (values: unknown[]) => {
    search(query: string): WasmIndexResult;
    len(): number;
  };
}

let wasmModule: WasmModule | null = null;
let wasmLoadPromise: Promise<WasmModule | null> | null = null;
let wasmLoadFailed = false;
let customWasmUrl: string | undefined;

/**
 * Initialize the WASM module
 * Call this early in your app to start loading the module
 * @param wasmUrl - Optional URL to the .wasm file (for custom deployments)
 */
export async function initWasm(wasmUrl?: string): Promise<boolean> {
  if (wasmModule) return true;
  if (wasmLoadFailed) return false;

  if (wasmUrl) {
    customWasmUrl = wasmUrl;
  }

  if (!wasmLoadPromise) {
    wasmLoadPromise = loadWasmModule();
  }

  const module = await wasmLoadPromise;
  return module !== null;
}

async function loadWasmModule(): Promise<WasmModule | null> {
  try {
    // Dynamic import of the WASM package
    const wasm = await import('@askturret/grid-wasm');

    // Initialize the WASM module with optional custom URL
    if (wasm.default && typeof wasm.default === 'function') {
      if (customWasmUrl) {
        await wasm.default(customWasmUrl);
      } else {
        await wasm.default();
      }
    }

    wasmModule = wasm as WasmModule;
    return wasmModule;
  } catch (error) {
    console.warn('[askturret-grid] WASM module not available, using JS fallback:', error);
    wasmLoadFailed = true;
    return null;
  }
}

/**
 * Check if WASM is available
 */
export function isWasmAvailable(): boolean {
  return wasmModule !== null;
}

// Direction constants matching Rust enum
const DIRECTION_ASC = 0;
const DIRECTION_DESC = 1;

// FilterMode constants matching Rust enum
const FILTER_CONTAINS = 0;
const FILTER_EQUALS = 1;
const FILTER_STARTS_WITH = 2;
const FILTER_ENDS_WITH = 3;

function directionToNumber(dir: SortDirection): number {
  return dir === 'desc' ? DIRECTION_DESC : DIRECTION_ASC;
}

function filterModeToNumber(mode: FilterMode): number {
  switch (mode) {
    case 'equals':
      return FILTER_EQUALS;
    case 'startsWith':
      return FILTER_STARTS_WITH;
    case 'endsWith':
      return FILTER_ENDS_WITH;
    default:
      return FILTER_CONTAINS;
  }
}

// ============================================================================
// Pure JavaScript fallbacks
// ============================================================================

function jsSortValues<T>(values: T[], direction: SortDirection): number[] {
  const indices = Array.from({ length: values.length }, (_, i) => i);

  indices.sort((a, b) => {
    const va = values[a];
    const vb = values[b];

    // Handle null/undefined - sort to end
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    // Compare values
    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }

    return direction === 'desc' ? -cmp : cmp;
  });

  return indices;
}

function jsFilterValues<T>(columns: T[][], search: string, mode: FilterMode): number[] {
  if (!columns.length || !search) {
    return Array.from({ length: columns[0]?.length || 0 }, (_, i) => i);
  }

  const searchLower = search.toLowerCase();
  const len = columns[0].length;
  const indices: number[] = [];

  for (let i = 0; i < len; i++) {
    const matches = columns.some((col) => {
      const val = col[i];
      if (val == null) return false;

      const strVal = typeof val === 'number' ? String(val) : String(val).toLowerCase();

      switch (mode) {
        case 'equals':
          return strVal === searchLower;
        case 'startsWith':
          return strVal.startsWith(searchLower);
        case 'endsWith':
          return strVal.endsWith(searchLower);
        default:
          return strVal.includes(searchLower);
      }
    });

    if (matches) {
      indices.push(i);
    }
  }

  return indices;
}

function jsFilterRange(values: number[], min: number, max: number): number[] {
  const indices: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (typeof val === 'number' && val >= min && val <= max) {
      indices.push(i);
    }
  }

  return indices;
}

// ============================================================================
// Public API - uses WASM when available, falls back to JS
// ============================================================================

/**
 * Sort values and return sorted indices
 */
export function sortValues<T>(values: T[], direction: SortDirection = 'asc'): number[] {
  if (wasmModule) {
    // Check if values are numbers
    if (values.length > 0 && typeof values[0] === 'number') {
      const floatArr = new Float64Array(values as unknown as number[]);
      const result = wasmModule.sort_numbers(floatArr, directionToNumber(direction));
      const indices = Array.from(result.indices);
      if (result.free) result.free();
      return indices;
    } else {
      // String values
      const result = wasmModule.sort_strings(values as unknown[], directionToNumber(direction));
      const indices = Array.from(result.indices);
      if (result.free) result.free();
      return indices;
    }
  }
  return jsSortValues(values, direction);
}

/**
 * Sort by multiple columns (stable sort)
 * Note: Uses JS implementation (WASM multi-column sort not yet implemented)
 */
export function sortMultiColumn<T>(columns: T[][], directions: SortDirection[]): number[] {
  // JS implementation for multi-column sort
  if (!columns.length) return [];

  const len = columns[0].length;
  const indices = Array.from({ length: len }, (_, i) => i);

  indices.sort((a, b) => {
    for (let c = 0; c < columns.length; c++) {
      const va = columns[c][a];
      const vb = columns[c][b];
      const dir = directions[c] || 'asc';

      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }

      if (cmp !== 0) {
        return dir === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });

  return indices;
}

/**
 * Filter values by search string
 */
export function filterValues<T>(columns: T[][], search: string, mode: FilterMode = 'contains'): number[] {
  if (wasmModule && columns.length > 0) {
    // Flatten columns for WASM - search across all columns
    // For now, use first column only with WASM (JS fallback handles multiple columns)
    const firstCol = columns[0];
    const result = wasmModule.filter_strings(firstCol as unknown[], search, filterModeToNumber(mode));
    const indices = Array.from(result.indices);
    if (result.free) result.free();
    return indices;
  }
  return jsFilterValues(columns, search, mode);
}

/**
 * Filter numeric values by range
 */
export function filterRange(values: number[], min: number = -Infinity, max: number = Infinity): number[] {
  if (wasmModule) {
    const floatArr = new Float64Array(values);
    const result = wasmModule.filter_range(floatArr, min, max);
    const indices = Array.from(result.indices);
    if (result.free) result.free();
    return indices;
  }
  return jsFilterRange(values, min, max);
}

/**
 * Combined filter and sort in one pass (more efficient for large datasets)
 * Note: Uses JS implementation (WASM combined filter+sort not yet implemented)
 */
export function filterAndSort<T>(
  sortVals: T[],
  filterColumns: T[][],
  search: string,
  direction: SortDirection = 'asc'
): number[] {
  // JS implementation: filter then sort
  const filtered = jsFilterValues(filterColumns, search, 'contains');
  if (!filtered.length) return filtered;

  // Sort the filtered indices
  filtered.sort((a, b) => {
    const va = sortVals[a];
    const vb = sortVals[b];

    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }

    return direction === 'desc' ? -cmp : cmp;
  });

  return filtered;
}

/**
 * Run benchmarks (only works when WASM is loaded)
 */
export function runBenchmarks(count: number = 100000): { sort: number; filter: number } | null {
  if (!wasmModule) {
    console.warn('WASM module not loaded, cannot run benchmarks');
    return null;
  }

  return {
    sort: wasmModule.bench_sort(count),
    filter: wasmModule.bench_filter(count),
  };
}
