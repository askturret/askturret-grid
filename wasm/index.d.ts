/**
 * TypeScript declarations for @askturret/grid-wasm
 *
 * This package provides high-performance WASM acceleration for grid operations:
 * - Sorting (numbers and strings)
 * - Filtering with trigram indexing
 * - Incremental data updates
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
 * Column schema for GridStore
 */
export interface ColumnSchema {
  name: string;
  type: 'string' | 'number';
  indexed?: boolean;
}

/**
 * High-performance grid data store with sorting, filtering, and search
 */
export class GridStore {
  /**
   * Create a new GridStore with the given column schema
   */
  constructor(schema: ColumnSchema[]);

  /**
   * Add a row to the store
   */
  addRow(row: Record<string, string | number | null>): void;

  /**
   * Update a row at the given index
   */
  updateRow(idx: number, row: Record<string, string | number | null>): void;

  /**
   * Remove a row at the given index
   */
  removeRow(idx: number): void;

  /**
   * Get the number of rows
   */
  rowCount(): number;

  /**
   * Get a row at the given index
   */
  getRow(idx: number): Record<string, string | number | null>;

  /**
   * Sort by a column
   */
  sort(column: string, direction: SortDir): Uint32Array;

  /**
   * Filter rows by a search query (uses trigram index if available)
   */
  filter(query: string): Uint32Array;

  /**
   * Filter rows by a numeric range on a column
   */
  filterRange(column: string, min: number, max: number): Uint32Array;

  /**
   * Clear all data
   */
  clear(): void;

  /**
   * Free the memory used by this store
   */
  free(): void;
}

/**
 * Benchmark: Load N rows into GridStore
 */
export function bench_store_load(count: number): number;

/**
 * Benchmark: Filter N rows
 */
export function bench_store_filter(count: number): number;

/**
 * Benchmark: Update N rows M times
 */
export function bench_store_update(count: number, update_count: number): number;

/**
 * Benchmark: Heavy filter with multiple trigram intersections
 */
export function bench_intersect_heavy_filter(count: number): number;

/**
 * Benchmark: Row matching performance
 */
export function bench_row_matching(count: number): number;
