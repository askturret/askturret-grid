/**
 * WorkerGridStore - Web Worker-based grid store for non-blocking updates
 *
 * Architecture:
 * - WASM GridStore runs in a Web Worker (off main thread)
 * - Updates are batched and processed at ~60fps
 * - Only visible rows are sent to main thread for rendering
 * - Main thread stays responsive even with millions of updates
 *
 * Usage:
 * ```ts
 * const store = await WorkerGridStore.create(schema);
 *
 * // Subscribe to visible rows updates
 * store.onVisibleRowsChange((rows) => {
 *   setVisibleRows(rows); // React state update
 * });
 *
 * // Set viewport (call on scroll)
 * store.setViewport(scrollTop, viewportHeight, rowHeight);
 *
 * // Load data and stream updates
 * await store.loadRows(initialData);
 * store.queueUpdates(priceUpdates); // Non-blocking, batched
 * ```
 */

import type { ColumnSchema, SortDirection } from './WasmGridStore';

export interface WorkerGridStoreConfig {
  /** Batch interval in ms (default: 16 for ~60fps) */
  batchInterval?: number;
  /** Extra rows to render above/below viewport (default: 5) */
  overscan?: number;
}

export interface ViewportInfo {
  startIndex: number;
  endIndex: number;
  scrollTop: number;
  rowHeight: number;
}

// Message types for worker communication
type WorkerRequest =
  | { type: 'init'; schema: ColumnSchema[]; batchInterval: number; _requestId?: number }
  | { type: 'loadRows'; rows: unknown[]; _requestId?: number }
  | { type: 'queueUpdates'; updates: unknown[] }
  | { type: 'setFilter'; search: string }
  | { type: 'clearFilter' }
  | { type: 'setSort'; column: string; direction: SortDirection }
  | { type: 'clearSort' }
  | { type: 'setViewport'; startIndex: number; endIndex: number }
  | { type: 'getStats'; _requestId?: number }
  | { type: 'dispose' };

type WorkerResponse =
  | { type: 'ready'; _requestId?: number }
  | { type: 'loaded'; rowCount: number; _requestId?: number }
  | {
      type: 'viewUpdate';
      rows: unknown[];
      viewCount: number;
      totalCount: number;
      startIndex: number;
    }
  | {
      type: 'stats';
      pendingUpdates: number;
      processedUpdates: number;
      lastBatchTime: number;
      _requestId?: number;
    }
  | { type: 'error'; message: string };

// Worker code as inline string (for bundler compatibility)
// Uses JS fallback since blob URL workers can't do dynamic imports
const WORKER_CODE = `
// Worker-side GridStore (JS implementation for blob URL compatibility)
// The key benefit is non-blocking main thread, not WASM speed

class JsGridStore {
  constructor(schema) {
    this.schema = schema;
    this.data = [];
    this.idMap = new Map();
    this.idColumn = schema.findIndex(c => c.primaryKey) || 0;
    this.indexedColumns = schema.filter(c => c.indexed).map(c => c.name);
    this.filterText = '';
    this.sortColumn = null;
    this.sortDir = 'none';
    this.viewCache = null;
  }

  loadRows(rows) {
    this.data = rows.map(r => ({...r}));
    this.idMap.clear();
    const idField = this.schema[this.idColumn].name;
    this.data.forEach((row, i) => {
      this.idMap.set(row[idField], i);
    });
    this.viewCache = null;
    return this.data.length;
  }

  batchUpdate(updates) {
    const idField = this.schema[this.idColumn].name;
    for (const update of updates) {
      const idx = this.idMap.get(update[idField] || update.id);
      if (idx !== undefined) {
        Object.assign(this.data[idx], update);
      }
    }
    this.viewCache = null;
    return updates.length;
  }

  setFilter(text) {
    this.filterText = text.toLowerCase();
    this.viewCache = null;
  }

  clearFilter() {
    this.filterText = '';
    this.viewCache = null;
  }

  setSort(column, dir) {
    this.sortColumn = column;
    this.sortDir = dir;
    this.viewCache = null;
  }

  clearSort() {
    this.sortColumn = null;
    this.sortDir = 'none';
    this.viewCache = null;
  }

  viewCount() {
    this._ensureView();
    return this.viewCache.length;
  }

  rowCount() {
    return this.data.length;
  }

  getVisibleRows(start, count) {
    this._ensureView();
    const result = [];
    for (let i = start; i < Math.min(start + count, this.viewCache.length); i++) {
      result.push(this.data[this.viewCache[i]]);
    }
    return result;
  }

  _ensureView() {
    if (this.viewCache) return;

    // Build indices
    let indices = this.data.map((_, i) => i);

    // Filter
    if (this.filterText) {
      indices = indices.filter(i => {
        const row = this.data[i];
        return this.indexedColumns.some(col => {
          const val = row[col];
          return val && String(val).toLowerCase().includes(this.filterText);
        });
      });
    }

    // Sort
    if (this.sortColumn && this.sortDir !== 'none') {
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

  free() {
    this.data = [];
    this.idMap.clear();
    this.viewCache = null;
  }
}

let store = null;
let batchInterval = 16;

// Update batching
let pendingUpdates = [];
let batchTimer = null;
let processedUpdates = 0;
let lastBatchTime = 0;

// Viewport tracking
let viewportStart = 0;
let viewportEnd = 50;

function sendVisibleRows() {
  if (!store) return;

  const viewCount = store.viewCount();
  const totalCount = store.rowCount();
  const start = Math.max(0, viewportStart);
  const end = Math.min(viewCount, viewportEnd);
  const count = end - start;

  if (count <= 0) {
    self.postMessage({ type: 'viewUpdate', rows: [], viewCount, totalCount, startIndex: start });
    return;
  }

  const rows = store.getVisibleRows(start, count);
  self.postMessage({ type: 'viewUpdate', rows, viewCount, totalCount, startIndex: start });
}

function processBatch() {
  if (!store || pendingUpdates.length === 0) {
    batchTimer = null;
    return;
  }

  const start = performance.now();
  const updates = pendingUpdates;
  pendingUpdates = [];

  store.batchUpdate(updates);
  processedUpdates += updates.length;
  lastBatchTime = performance.now() - start;

  // Send updated visible rows
  sendVisibleRows();

  // Schedule next batch if more updates pending
  if (pendingUpdates.length > 0) {
    batchTimer = setTimeout(processBatch, batchInterval);
  } else {
    batchTimer = null;
  }
}

function scheduleBatch() {
  if (batchTimer === null) {
    batchTimer = setTimeout(processBatch, batchInterval);
  }
}

self.onmessage = async (e) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      batchInterval = msg.batchInterval || 16;
      store = new JsGridStore(msg.schema);
      self.postMessage({ type: 'ready', _requestId: msg._requestId });
      break;
    }

    case 'loadRows': {
      if (!store) {
        self.postMessage({ type: 'error', message: 'Store not initialized' });
        return;
      }
      const count = store.loadRows(msg.rows);
      sendVisibleRows();
      self.postMessage({ type: 'loaded', rowCount: count, _requestId: msg._requestId });
      break;
    }

    case 'queueUpdates': {
      pendingUpdates.push(...msg.updates);
      scheduleBatch();
      break;
    }

    case 'setFilter': {
      if (!store) return;
      store.setFilter(msg.search);
      sendVisibleRows();
      break;
    }

    case 'clearFilter': {
      if (!store) return;
      store.clearFilter();
      sendVisibleRows();
      break;
    }

    case 'setSort': {
      if (!store) return;
      store.setSort(msg.column, msg.direction);
      sendVisibleRows();
      break;
    }

    case 'clearSort': {
      if (!store) return;
      store.clearSort();
      sendVisibleRows();
      break;
    }

    case 'setViewport': {
      viewportStart = msg.startIndex;
      viewportEnd = msg.endIndex;
      sendVisibleRows();
      break;
    }

    case 'getStats': {
      self.postMessage({
        type: 'stats',
        pendingUpdates: pendingUpdates.length,
        processedUpdates,
        lastBatchTime,
        _requestId: msg._requestId
      });
      break;
    }

    case 'dispose': {
      if (batchTimer) clearTimeout(batchTimer);
      if (store) store.free();
      store = null;
      self.close();
      break;
    }
  }
};
`;

/**
 * WorkerGridStore - Non-blocking grid store using Web Worker
 */
export class WorkerGridStore<T extends Record<string, unknown> = Record<string, unknown>> {
  private worker: Worker | null = null;
  private schema: ColumnSchema[];
  private config: Required<WorkerGridStoreConfig>;
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  // View state
  private _viewCount = 0;
  private _totalCount = 0;
  private _visibleRows: T[] = [];
  private _startIndex = 0;

  // Listeners
  private visibleRowsListeners = new Set<(rows: T[], startIndex: number) => void>();
  private viewCountListeners = new Set<(viewCount: number, totalCount: number) => void>();

  private constructor(schema: ColumnSchema[], config: WorkerGridStoreConfig = {}) {
    this.schema = schema;
    this.config = {
      batchInterval: config.batchInterval ?? 16,
      overscan: config.overscan ?? 5,
    };
  }

  /**
   * Create a new WorkerGridStore
   */
  static async create<T extends Record<string, unknown>>(
    schema: ColumnSchema[],
    config?: WorkerGridStoreConfig
  ): Promise<WorkerGridStore<T>> {
    const instance = new WorkerGridStore<T>(schema, config);
    await instance.init();
    return instance;
  }

  private async init(): Promise<void> {
    // Create worker from inline code
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    this.worker = new Worker(workerUrl, { type: 'module' });
    URL.revokeObjectURL(workerUrl);

    // Set up message handler
    this.worker.onmessage = (e) => this.handleMessage(e.data as WorkerResponse);
    this.worker.onerror = (e) => console.error('[WorkerGridStore] Worker error:', e);

    // Initialize worker
    await this.sendRequest({
      type: 'init',
      schema: this.schema,
      batchInterval: this.config.batchInterval,
    });
  }

  private handleMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        if (msg._requestId !== undefined) {
          this.resolvePending(String(msg._requestId), true);
        }
        break;

      case 'loaded':
        if (msg._requestId !== undefined) {
          this.resolvePending(String(msg._requestId), msg.rowCount);
        }
        break;

      case 'viewUpdate':
        this._visibleRows = msg.rows as T[];
        this._viewCount = msg.viewCount;
        this._totalCount = msg.totalCount;
        this._startIndex = msg.startIndex;

        // Notify listeners
        for (const listener of this.visibleRowsListeners) {
          listener(this._visibleRows, this._startIndex);
        }
        for (const listener of this.viewCountListeners) {
          listener(this._viewCount, this._totalCount);
        }
        break;

      case 'stats':
        if (msg._requestId !== undefined) {
          this.resolvePending(String(msg._requestId), msg);
        }
        break;

      case 'error':
        console.error('[WorkerGridStore] Error:', msg.message);
        this.rejectAllPending(new Error(msg.message));
        break;
    }
  }

  private sendRequest(request: WorkerRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = this.messageId++;
      const requestWithId = { ...request, _requestId: requestId };
      this.pendingRequests.set(String(requestId), { resolve, reject });
      this.worker?.postMessage(requestWithId);
    });
  }

  private resolvePending(requestId: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve(value);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Load initial data
   */
  async loadRows(rows: T[]): Promise<number> {
    const count = (await this.sendRequest({ type: 'loadRows', rows: rows as unknown[] })) as number;
    return count;
  }

  /**
   * Queue updates (non-blocking, batched)
   * Updates are processed in batches at ~60fps
   */
  queueUpdates(updates: Array<{ id: string; [field: string]: unknown }>): void {
    this.worker?.postMessage({ type: 'queueUpdates', updates });
  }

  /**
   * Set filter text
   */
  setFilter(search: string): void {
    this.worker?.postMessage({ type: 'setFilter', search });
  }

  /**
   * Clear filter
   */
  clearFilter(): void {
    this.worker?.postMessage({ type: 'clearFilter' });
  }

  /**
   * Set sort column and direction
   */
  setSort(column: string, direction: SortDirection): void {
    this.worker?.postMessage({ type: 'setSort', column, direction });
  }

  /**
   * Clear sort
   */
  clearSort(): void {
    this.worker?.postMessage({ type: 'clearSort' });
  }

  /**
   * Set viewport for virtualization
   * Call this on scroll to update which rows are visible
   */
  setViewport(startIndex: number, endIndex: number): void {
    const overscan = this.config.overscan;
    this.worker?.postMessage({
      type: 'setViewport',
      startIndex: Math.max(0, startIndex - overscan),
      endIndex: endIndex + overscan,
    });
  }

  /**
   * Get current view count (after filter)
   */
  getViewCount(): number {
    return this._viewCount;
  }

  /**
   * Get total row count (before filter)
   */
  getTotalCount(): number {
    return this._totalCount;
  }

  /**
   * Get currently visible rows
   */
  getVisibleRows(): T[] {
    return this._visibleRows;
  }

  /**
   * Get start index of visible rows
   */
  getStartIndex(): number {
    return this._startIndex;
  }

  /**
   * Subscribe to visible rows changes
   */
  onVisibleRowsChange(callback: (rows: T[], startIndex: number) => void): () => void {
    this.visibleRowsListeners.add(callback);
    return () => {
      this.visibleRowsListeners.delete(callback);
    };
  }

  /**
   * Subscribe to view count changes
   */
  onViewCountChange(callback: (viewCount: number, totalCount: number) => void): () => void {
    this.viewCountListeners.add(callback);
    return () => {
      this.viewCountListeners.delete(callback);
    };
  }

  /**
   * Get worker stats (for debugging/benchmarking)
   */
  async getStats(): Promise<{ pendingUpdates: number; processedUpdates: number; lastBatchTime: number }> {
    return (await this.sendRequest({ type: 'getStats' })) as {
      pendingUpdates: number;
      processedUpdates: number;
      lastBatchTime: number;
    };
  }

  /**
   * Dispose the store and terminate the worker
   */
  dispose(): void {
    this.worker?.postMessage({ type: 'dispose' });
    this.worker?.terminate();
    this.worker = null;
    this.visibleRowsListeners.clear();
    this.viewCountListeners.clear();
  }
}
