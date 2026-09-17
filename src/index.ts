/**
 * @askturret/grid
 *
 * High-performance React data grid with Rust/WASM.
 * Server-side performance, zero server required.
 *
 * @packageDocumentation
 */

// Main component
export { DataGrid } from './DataGrid';
export type { DataGridProps, ColumnDef } from './DataGrid';

// Trading components
export { OrderBook } from './OrderBook';
export type { OrderBookProps, OrderBookData, OrderBookLevel } from './OrderBook';

export { TopMovers } from './TopMovers';
export type { TopMoversProps, MoverItem } from './TopMovers';

export { TimeSales } from './TimeSales';
export type { TimeSalesProps, Trade } from './TimeSales';

export { PositionLadder } from './PositionLadder';
export type { PositionLadderProps, LadderLevel, Position } from './PositionLadder';

// Utilities
export {
  formatPrice,
  formatQuantity,
  formatTime,
  formatPnL,
  formatPercent,
  formatCompact,
} from './utils/formatters';

export { exportToCSV } from './utils/csv';
export type { CSVExportOptions } from './utils/csv';

// Hooks
export { useAdaptiveFlash } from './hooks/useAdaptiveFlash';
export type { AdaptiveFlashResult } from './hooks/useAdaptiveFlash';

export { useGridStore } from './hooks/useGridStore';
export type { StoreType, UseGridStoreConfig, GridStoreResult } from './hooks/useGridStore';

// WASM bridge (for direct access to sorting/filtering)
export {
  initWasm,
  isWasmAvailable,
  sortValues,
  sortMultiColumn,
  filterValues,
  filterRange,
  filterAndSort,
  runBenchmarks,
  type SortDirection,
  type FilterMode,
} from './wasm';

// GridCore - persistent WASM state for high-performance grids (legacy)
export {
  GridCore,
  initGridCore,
  isGridCoreAvailable,
  benchGridState,
  benchFilterOnly,
  benchSortOnly,
  benchIndexedFilterWithBuild,
  benchIndexedFilterOnly,
  benchScanFilter,
  benchRepeatedFilter,
} from './wasm/GridCore';

// WasmGridStore - WASM-first architecture
// Data lives in WASM, JS only receives indices and visible rows
export {
  WasmGridStore,
  initWasmStore,
  isWasmStoreAvailable,
  type ColumnSchema,
  type RowUpdate,
  type SortDirection as WasmSortDirection,
} from './wasm/WasmGridStore';

// WorkerGridStore - Web Worker + JS engine for non-blocking updates
// Best for high-frequency trading updates (batches at 60fps, off main thread)
export { WorkerGridStore, type WorkerGridStoreConfig, type ViewportInfo } from './wasm/WorkerGridStore';
