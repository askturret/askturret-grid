/**
 * WasmGridStore - High-performance grid data store using WASM
 *
 * All data lives in WASM memory. JavaScript only receives indices and
 * fetches visible rows for rendering.
 *
 * Usage:
 * ```ts
 * const store = await WasmGridStore.create([
 *   { name: 'id', type: 'string', primaryKey: true },
 *   { name: 'symbol', type: 'string', indexed: true },
 *   { name: 'price', type: 'number' },
 * ]);
 *
 * // Initial load
 * store.loadRows(data);
 *
 * // Real-time updates
 * store.updateRows([{ id: 'row1', price: 150.5 }]);
 *
 * // View control
 * store.setFilter('AAPL');
 * store.setSort('price', 'desc');
 *
 * // Rendering
 * const count = store.getViewCount();
 * const visible = store.getVisibleRows(0, 50);
 * ```
 */

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'integer';
  primaryKey?: boolean;
  indexed?: boolean; // Include in text search
}

export interface RowUpdate {
  id: string;
  [field: string]: unknown;
}

export type SortDirection = 'asc' | 'desc' | null;

// WASM module types (internal)
interface WasmGridStoreInternal {
  loadRows(rows: unknown[]): number;
  insert(row: unknown): number;
  update(id: string, changes: unknown): void;
  batchUpdate(updates: unknown[]): number;
  delete(id: string): void;
  setFilter(search: string): void;
  setSort(column: string, direction: number): void;
  clearFilter(): void;
  clearSort(): void;
  viewCount(): number;
  rowCount(): number;
  viewIndices(start: number, count: number): Uint32Array;
  getRows(indices: Uint32Array): unknown[];
  getVisibleRows(start: number, count: number): unknown[];
  getCell(row: number, column: string): unknown;
  columnNames(): string[];
  free(): void;
}

interface WasmModule {
  GridStore: new (schema: ColumnSchema[]) => WasmGridStoreInternal;
  SortDir: { Asc: 0; Desc: 1; None: 2 };
  default(input?: unknown): Promise<unknown>;
}

let wasmModule: WasmModule | null = null;
let wasmLoadPromise: Promise<WasmModule | null> | null = null;

async function loadWasm(): Promise<WasmModule | null> {
  try {
    const wasm = await import('@askturret/grid-wasm');
    if (wasm.default && typeof wasm.default === 'function') {
      await wasm.default();
    }
    if (!wasm.GridStore) {
      throw new Error('GridStore not available in WASM module');
    }
    wasmModule = wasm as WasmModule;
    return wasmModule;
  } catch (e) {
    console.warn('[WasmGridStore] WASM not available:', e);
    return null;
  }
}

/**
 * Initialize the WASM module
 */
export async function initWasmStore(): Promise<boolean> {
  if (wasmModule) return true;
  if (!wasmLoadPromise) {
    wasmLoadPromise = loadWasm();
  }
  const mod = await wasmLoadPromise;
  return mod !== null;
}

/**
 * Check if WASM store is available
 */
export function isWasmStoreAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * WasmGridStore - High-performance grid store using WASM
 */
export class WasmGridStore<T extends Record<string, unknown> = Record<string, unknown>> {
  private store: WasmGridStoreInternal | null = null;
  private schema: ColumnSchema[];
  private listeners: Set<() => void> = new Set();
  private _viewCount = 0;

  private constructor(schema: ColumnSchema[]) {
    this.schema = schema;
  }

  /**
   * Create a new WasmGridStore
   */
  static async create<T extends Record<string, unknown>>(schema: ColumnSchema[]): Promise<WasmGridStore<T>> {
    const instance = new WasmGridStore<T>(schema);
    await instance.init();
    return instance;
  }

  private async init(): Promise<void> {
    const available = await initWasmStore();
    if (available && wasmModule) {
      this.store = new wasmModule.GridStore(this.schema);
    }
  }

  /**
   * Check if using WASM backend
   */
  isWasm(): boolean {
    return this.store !== null;
  }

  /**
   * Load initial data - O(n * cols)
   */
  loadRows(rows: T[]): number {
    if (!this.store) {
      throw new Error('WasmGridStore not initialized');
    }
    const count = this.store.loadRows(rows as unknown[]);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
    return count;
  }

  /**
   * Insert a single row - O(cols)
   */
  insertRow(row: T): number {
    if (!this.store) {
      throw new Error('WasmGridStore not initialized');
    }
    const idx = this.store.insert(row as unknown);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
    return idx;
  }

  /**
   * Update multiple rows - O(updates * cols)
   * Only include changed fields
   */
  updateRows(updates: RowUpdate[]): number {
    if (!this.store) {
      throw new Error('WasmGridStore not initialized');
    }
    const count = this.store.batchUpdate(updates as unknown[]);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
    return count;
  }

  /**
   * Delete a row by ID
   */
  deleteRow(id: string): void {
    if (!this.store) {
      throw new Error('WasmGridStore not initialized');
    }
    this.store.delete(id);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
  }

  /**
   * Set filter text
   */
  setFilter(search: string): void {
    if (!this.store) return;
    this.store.setFilter(search);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
  }

  /**
   * Set sort column and direction
   */
  setSort(column: string, direction: SortDirection): void {
    if (!this.store || !wasmModule) return;
    const dir =
      direction === 'asc'
        ? wasmModule.SortDir.Asc
        : direction === 'desc'
          ? wasmModule.SortDir.Desc
          : wasmModule.SortDir.None;
    this.store.setSort(column, dir);
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
  }

  /**
   * Clear filter
   */
  clearFilter(): void {
    if (!this.store) return;
    this.store.clearFilter();
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
  }

  /**
   * Clear sort
   */
  clearSort(): void {
    if (!this.store) return;
    this.store.clearSort();
    this._viewCount = this.store.viewCount();
    this.notifyListeners();
  }

  /**
   * Get number of rows in current view (after filter)
   */
  getViewCount(): number {
    return this._viewCount;
  }

  /**
   * Get total row count (before filter)
   */
  getRowCount(): number {
    if (!this.store) return 0;
    return this.store.rowCount();
  }

  /**
   * Get visible rows for rendering
   * Only fetches rows actually needed for display
   */
  getVisibleRows(start: number, count: number): T[] {
    if (!this.store) return [];
    return this.store.getVisibleRows(start, count) as T[];
  }

  /**
   * Get a single cell value
   */
  getCell(rowIndex: number, column: string): unknown {
    if (!this.store) return undefined;
    return this.store.getCell(rowIndex, column);
  }

  /**
   * Get column names
   */
  getColumnNames(): string[] {
    if (!this.store) return this.schema.map((s) => s.name);
    return this.store.columnNames();
  }

  /**
   * Subscribe to view changes
   */
  onViewChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Dispose the store and free WASM memory
   */
  dispose(): void {
    if (this.store) {
      this.store.free();
      this.store = null;
    }
    this.listeners.clear();
  }
}
