/**
 * TypeScript declarations for @askturret/grid-wasm
 *
 * High-performance WASM acceleration for @askturret/grid:
 * - Sorting and filtering with trigram indexing
 * - Incremental data updates
 * - Real-time grid state management
 */

/**
 * Initialize the WASM module.
 * Must be called before using any other exports.
 * @param input Optional input URL or configuration
 */
export default function init(input?: string | URL | Request): Promise<void>;

/**
 * Sort direction enum
 */
export enum SortDir {
  Asc = 0,
  Desc = 1,
  None = 2,
}

/**
 * Sort direction constants (legacy API)
 */
export const SortDirection: {
  Asc: 0;
  Desc: 1;
};

/**
 * Filter mode constants
 */
export const FilterMode: {
  Contains: 0;
  Equals: 1;
  StartsWith: 2;
  EndsWith: 3;
};

/**
 * Column schema definition
 */
export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'integer';
  primaryKey?: boolean;
  indexed?: boolean;
}

/**
 * WASM index result for sort/filter operations
 */
export interface WasmIndexResult {
  readonly indices: Uint32Array;
  readonly len: number;
  free?(): void;
}

/**
 * Grid state interface (legacy API)
 */
export interface WasmGridState {
  set_data(columns: unknown[][]): void;
  set_sort(col: number, direction: number): void;
  set_filter(search: string): void;
  get_view(): Uint32Array;
  get_view_count(): number;
  row_count(): number;
  col_count(): number;
}

/**
 * Indexed grid state interface (legacy API)
 */
export interface WasmIndexedGridState {
  set_data(columns: unknown[][]): void;
  set_sort(col: number, direction: number): void;
  set_filter(search: string): void;
  get_view(): Uint32Array;
  get_view_count(): number;
  row_count(): number;
  col_count(): number;
}

/**
 * GridState class (legacy API - may not be available in all builds)
 */
export const GridState: (new () => WasmGridState) | undefined;

/**
 * IndexedGridState class (legacy API - may not be available in all builds)
 */
export const IndexedGridState: (new () => WasmIndexedGridState) | undefined;

/**
 * High-performance grid data store with WASM acceleration
 *
 * All data lives in WASM memory. JavaScript only receives indices
 * and fetches visible rows for rendering.
 */
export class GridStore {
  /**
   * Create a new GridStore with the given column schema
   * @param schema Array of column definitions
   */
  constructor(schema: ColumnSchema[]);

  /**
   * Load initial rows from JSON array
   * @returns Number of rows loaded
   */
  loadRows(rows: unknown[]): number;

  /**
   * Insert a single row
   * @returns Row index
   */
  insert(row: unknown): number;

  /**
   * Update a row by ID
   * @param id Primary key value
   * @param changes Object with changed fields
   */
  update(id: string, changes: unknown): void;

  /**
   * Batch update multiple rows
   * @param updates Array of update objects with id field
   * @returns Number of rows updated
   */
  batchUpdate(updates: unknown[]): number;

  /**
   * Delete a row by ID (soft delete)
   * @param id Primary key value
   */
  delete(id: string): void;

  /**
   * Set filter text (triggers view recomputation)
   * @param search Search query
   */
  setFilter(search: string): void;

  /**
   * Set sort column and direction
   * @param column Column name
   * @param direction Sort direction
   */
  setSort(column: string, direction: SortDir): void;

  /**
   * Clear filter
   */
  clearFilter(): void;

  /**
   * Clear sort
   */
  clearSort(): void;

  /**
   * Get number of rows in current view (after filter)
   */
  viewCount(): number;

  /**
   * Get total row count (before filter)
   */
  rowCount(): number;

  /**
   * Get view indices for virtualized rendering
   * @param start Starting index
   * @param count Number of indices to return
   * @returns Array of row indices in current view
   */
  viewIndices(start: number, count: number): Uint32Array;

  /**
   * Get rows by indices
   * @param indices Array of row indices
   * @returns JSON array of row objects
   */
  getRows(indices: Uint32Array): unknown;

  /**
   * Get visible rows for rendering (combines viewIndices + getRows)
   * @param start Starting index
   * @param count Number of rows to return
   * @returns JSON array of row objects
   */
  getVisibleRows(start: number, count: number): unknown;

  /**
   * Get a single cell value
   * @param row Row index
   * @param column Column name
   */
  getCell(row: number, column: string): unknown;

  /**
   * Get column names
   * @returns Array of column names
   */
  columnNames(): unknown;

  /**
   * Free WASM memory
   */
  free(): void;
}

/**
 * Trigram index for fast text search
 */
export const TrigramIndex: (new (values: unknown[]) => {
  search(query: string): WasmIndexResult;
  len(): number;
}) | undefined;

// ============================================================================
// Sorting and filtering functions (may not be available in all builds)
// ============================================================================

/**
 * Sort numeric values
 * @param values Array of numbers
 * @param direction Sort direction (0 = Asc, 1 = Desc)
 * @returns Index result
 */
export function sort_numbers(values: Float64Array, direction: number): WasmIndexResult;

/**
 * Sort string values
 * @param values Array of strings
 * @param direction Sort direction (0 = Asc, 1 = Desc)
 * @returns Index result
 */
export function sort_strings(values: unknown[], direction: number): WasmIndexResult;

/**
 * Filter string values
 * @param values Array of strings
 * @param search Search query
 * @param mode Filter mode (0 = Contains, 1 = Equals, 2 = StartsWith, 3 = EndsWith)
 * @returns Index result
 */
export function filter_strings(values: unknown[], search: string, mode: number): WasmIndexResult;

/**
 * Filter numeric range
 * @param values Array of numbers
 * @param min Minimum value
 * @param max Maximum value
 * @returns Index result
 */
export function filter_range(values: Float64Array, min: number, max: number): WasmIndexResult;

// ============================================================================
// Benchmark functions
// ============================================================================

/**
 * Benchmark: Load N rows into GridStore
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_store_load(count: number): number;

/**
 * Benchmark: Filter N rows
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_store_filter(count: number): number;

/**
 * Benchmark: Update N rows M times
 * @param count Number of rows
 * @param update_count Number of updates
 * @returns Time in milliseconds
 */
export function bench_store_update(count: number, update_count: number): number;

/**
 * Benchmark: Heavy filter with multiple trigram intersections
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_intersect_heavy_filter(count: number): number;

/**
 * Benchmark: Row matching performance
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_row_matching(count: number): number;

/**
 * Benchmark: GridState operations (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_grid_state(count: number): number;

/**
 * Benchmark: Filter only (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_filter_only(count: number): number;

/**
 * Benchmark: Sort only (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_sort_only(count: number): number;

/**
 * Benchmark: Indexed filter with build (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_indexed_filter_with_build(count: number): number;

/**
 * Benchmark: Indexed filter only (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_indexed_filter_only(count: number): number;

/**
 * Benchmark: Scan filter (legacy API)
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_scan_filter(count: number): number;

/**
 * Benchmark: Repeated filter (legacy API)
 * @param count Number of rows
 * @param iterations Number of iterations
 * @returns Time in milliseconds
 */
export function bench_repeated_filter(count: number, iterations: number): number;

/**
 * Benchmark: Sort performance
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_sort(count: number): number;

/**
 * Benchmark: Filter performance
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_filter(count: number): number;

/**
 * Benchmark: Trigram search performance
 * @param count Number of rows
 * @returns Time in milliseconds
 */
export function bench_trigram(count: number): number;
