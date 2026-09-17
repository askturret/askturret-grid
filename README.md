# @askturret/grid

[![npm version](https://img.shields.io/npm/v/@askturret/grid.svg)](https://www.npmjs.com/package/@askturret/grid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@askturret/grid)](https://bundlephobia.com/package/@askturret/grid)
[![license](https://img.shields.io/npm/l/@askturret/grid.svg)](https://github.com/alprimak/askturret-grid/blob/main/LICENSE)

**1 million rows. 60 FPS. Your architecture.**

A high-performance React data grid that lets you pick the right engine for your workload. Three battle-tested architectures, one simple API.

[Live Demo](https://grid.askturret.com/demo/) · [Documentation](https://grid.askturret.com/getting-started/installation/) · [Benchmarks](https://grid.askturret.com/benchmarks/)

---

## Why?

Most grid libraries force you into one architecture. But workloads differ:

| Workload | What you need |
|----------|---------------|
| Real-time trading | Non-blocking updates, 60fps guaranteed |
| Analytics dashboard | Fast filtering on millions of rows |
| Admin panel | Simple, zero dependencies |

We give you **three engines** that excel at different things:

| Engine | Best for | How it works |
|--------|----------|--------------|
| **Worker** | Real-time streaming | Web Worker batches updates off main thread |
| **WASM** | Heavy filtering | Rust + trigram indexing for instant search |
| **JS** | Simplicity | Zero deps, just works |

Same API. Pick what fits.

## Quick Start

```bash
npm install @askturret/grid
```

### Basic Usage

For most cases, just use `DataGrid` directly:

```tsx
import { DataGrid } from '@askturret/grid';
import '@askturret/grid/styles.css';

const columns = [
  { field: 'symbol', header: 'Symbol', sortable: true },
  { field: 'price', header: 'Price', align: 'right', flashOnChange: true },
  { field: 'volume', header: 'Volume', align: 'right' },
];

function App() {
  return (
    <DataGrid
      data={positions}
      columns={columns}
      rowKey="symbol"
      showFilter
    />
  );
}
```

Virtualization, sorting, filtering, and flash highlighting work out of the box.

### High-Frequency Updates

For real-time streaming (trading, live dashboards), use `useGridStore` with unified `GridColumn` definitions:

```tsx
import { DataGrid, useGridStore, deriveRowKey } from '@askturret/grid';

// Define columns once - works for both grid (presentation) and store (engine)
const columns = [
  { name: 'id', header: 'ID', type: 'string', primaryKey: true, width: '80px' },
  { name: 'symbol', header: 'Symbol', type: 'string', indexed: true, sortable: true },
  { name: 'price', header: 'Price', type: 'number', align: 'right', flashOnChange: true },
  { name: 'change', header: 'Change', type: 'number', align: 'right', formatter: (v) => `${v > 0 ? '+' : ''}${v}%` },
];

function TradingGrid() {
  const { data, updateRows, isReady } = useGridStore({
    storeType: 'worker', // Non-blocking updates
    schema: columns, // Same columns - no duplication!
    initialData: positions,
  });

  useEffect(() => {
    const ws = connectToMarketData();
    ws.onmessage = (updates) => {
      updateRows(updates); // Non-blocking, batched at 60fps
    };
    return () => ws.close();
  }, []);

  if (!isReady) return <div>Loading...</div>;

  return <DataGrid data={data} columns={columns} rowKey={deriveRowKey(columns)} />;
}
```

## Performance

Tested on AMD Ryzen, Linux, Chrome 131:

### Real-time Streaming (200 updates/frame)

| Engine | Per-frame latency | Frame budget used |
|--------|-------------------|-------------------|
| **Worker** | 40μs | <1% |
| JS | 860μs | 5% |
| WASM | 1.2ms | 7% |

**Winner: Worker** — Updates happen off main thread.

### Heavy Filtering (1M rows, complex search)

| Engine | Filter time | Notes |
|--------|-------------|-------|
| **WASM** | <2ms | Trigram index lookup |
| JS | 45ms | Full scan |
| Worker | 8ms | JS in worker |

**Winner: WASM** — Trigram indexing shines on large datasets.

### Simple Operations (10k rows)

All engines perform similarly. Use **JS** for zero dependencies.

[Run benchmarks for your scenario →](https://grid.askturret.com/benchmarks/)

## Features

### Core Grid
- **Auto-virtualization** — Renders only visible rows (auto-enables at 100+ rows)
- **Flash highlighting** — Green/red cell flashes on value changes
- **Adaptive performance** — Auto-disables effects when FPS drops below 55
- **Sorting & filtering** — Instant, client-side
- **TypeScript-first** — Full type inference

### Trading Components
- `<OrderBook />` — Level 2 depth with bid/ask bars
- `<TopMovers />` — Gainers/losers with periodic ranking
- `<TimeSales />` — Trade tape with large trade highlighting
- `<PositionLadder />` — DOM ladder with click-to-trade

### Column Management
- **Resizable** — Drag to resize with min/max limits
- **Reorderable** — Drag & drop headers
- **Controlled & uncontrolled** — Works both ways

### Data Export
- **CSV export** — One-line export with proper escaping
- **Excel compatible** — BOM for character encoding

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your React App                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │DataGrid │  │OrderBook │  │TimeSales │  │PositionLadder│  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       └────────────┴─────────────┴───────────────┘          │
│                            │                                │
├────────────────────────────┼────────────────────────────────┤
│              useGridStore (pick your engine)                │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │WorkerGridStore│  │ WasmGridStore │  │   JsGridStore   │  │
│  │  (off-thread) │  │ (Rust+trigram)│  │   (fallback)    │  │
│  └──────────────┘  └───────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### When to use each

| Engine | Use when | Avoid when |
|--------|----------|------------|
| **Worker** | High-frequency updates (trading, IoT) | You need sync operations |
| **WASM** | Complex filtering on 100k+ rows | WASM adds 50kb, may not be worth it for small data |
| **JS** | Simple cases, zero deps, SSR | >1M rows with heavy filtering |

## Configuration

```tsx
interface DataGridProps<T> {
  // Required
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: keyof T | ((row: T) => string);

  // Optional
  showFilter?: boolean;              // Show filter input
  filterPlaceholder?: string;        // Filter input placeholder
  filterFields?: (keyof T)[];        // Fields to search (default: all)
  compact?: boolean;                 // Reduce row height
  stickyHeader?: boolean;            // Sticky header (default: true)
  virtualize?: boolean | 'auto';     // Force virtualization (default: 'auto')
  rowHeight?: number;                // Custom row height in px
  disableFlash?: boolean;            // Disable flash highlighting
  adaptiveFlash?: boolean;           // Auto-disable flash when FPS drops
  onRowClick?: (row: T) => void;     // Row click handler
  emptyMessage?: string;             // Message when no data
  className?: string;                // Container class

  // Column resizing
  resizable?: boolean;               // Enable column resizing
  minColumnWidth?: number;           // Min width in px (default: 50)
  maxColumnWidth?: number;           // Max width in px (default: 500)
  columnWidths?: Record<string, number>;
  onColumnResize?: (field: string, width: number) => void;

  // Column reordering
  reorderable?: boolean;             // Enable drag & drop reorder
  columnOrder?: string[];            // Controlled order
  onColumnReorder?: (newOrder: string[]) => void;
}

interface ColumnDef<T> {
  field: keyof T | string;           // Data field (supports "user.name")
  header: string;                    // Column header text
  width?: string;                    // CSS width
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;                // Enable sorting (default: true)
  flashOnChange?: boolean;           // Flash on numeric changes
  formatter?: (value: unknown, row: T) => string | ReactNode;
  cellClass?: (value: unknown, row: T) => string;
}
```

## Adaptive Flash Throttling

Flash highlighting (`flashOnChange` on column definitions) is unconditional by default — it fires on every numeric value change. For high-frequency data (trading, IoT sensors), this can impact frame rate when many cells flash simultaneously.

`@askturret/grid` provides automatic FPS-adaptive throttling to prevent performance degradation:

### Option A: One-line opt-in (recommended)

```tsx
<DataGrid
  data={trades}
  columns={[
    { field: 'price', header: 'Price', flashOnChange: true },
    { field: 'size', header: 'Size', flashOnChange: true }
  ]}
  rowKey="id"
  adaptiveFlash={true}  // ← Auto-disables flash when FPS drops below 55
/>
```

When `adaptiveFlash={true}`, the grid runs an internal FPS monitor. If frame rate drops below ~55fps for 2+ consecutive seconds, flash highlighting is automatically suppressed. It re-enables when FPS recovers to ≥58fps for 3+ seconds (hysteresis prevents flapping).

**Default:** `false` — no FPS monitoring, no rAF loop, zero overhead. This preserves predictable behavior for existing consumers.

**Precedence:** Explicit `disableFlash={true}` always wins. `adaptiveFlash` only controls the *automatic backoff* path.

### Option B: Manual wiring (for advanced control)

For custom FPS thresholds, displaying the current FPS in your UI, or sharing an FPS meter across your app:

```tsx
import { DataGrid, useAdaptiveFlash } from '@askturret/grid';

function TradingView() {
  const { disableFlash, fps } = useAdaptiveFlash(true);

  return (
    <>
      <div className="fps-indicator">FPS: {fps}</div>
      <DataGrid
        data={trades}
        columns={[
          { field: 'price', header: 'Price', flashOnChange: true },
          { field: 'size', header: 'Size', flashOnChange: true }
        ]}
        rowKey="id"
        disableFlash={disableFlash}  // ← Wire manual control
      />
    </>
  );
}
```

The `useAdaptiveFlash()` hook returns:
- `disableFlash: boolean` — Whether flash should be suppressed (pass to `DataGrid`)
- `fps: number` — Current frame rate (0 when disabled)

**See also:** [`flashOnChange` column definition](#configuration), [`disableFlash` prop](#configuration)

## useGridStore API

```tsx
const {
  data,           // Current data array (for DataGrid)
  isReady,        // Store initialized
  storeType,      // 'worker' | 'wasm' | 'js'
  rowCount,       // Total rows
  viewCount,      // Filtered rows

  loadRows,       // Load/replace all data
  updateRows,     // Update rows (non-blocking with worker)
  setFilter,      // Set filter text
  clearFilter,    // Clear filter
  setSort,        // Set sort column/direction
  clearSort,      // Clear sort
  setViewport,    // Set visible range (worker only)
  dispose,        // Cleanup
} = useGridStore({
  storeType: 'worker',  // 'worker' | 'wasm' | 'js'
  schema: [...],        // Column schema
  initialData: [...],   // Optional initial data
  batchInterval: 16,    // Worker batch interval (default: 16ms)
  visibleRowCount: 50,  // Worker viewport size (default: 50)
});
```

## Theming

```css
:root {
  --grid-bg: #0a0a0f;
  --grid-surface: #12121a;
  --grid-border: #2a2a3a;
  --grid-text: #e4e4e7;
  --grid-muted: #71717a;
  --grid-accent: #3b82f6;
  --grid-flash-up: rgba(34, 197, 94, 0.4);
  --grid-flash-down: rgba(239, 68, 68, 0.4);
}
```

## CSV Export

```tsx
import { exportToCSV } from '@askturret/grid';

exportToCSV(data, columns, { filename: 'portfolio.csv' });

// Or get string
const csv = exportToCSV(data, columns, { download: false });
```

## vs Other Grids

| Feature | AG Grid | TanStack Table | @askturret/grid |
|---------|---------|----------------|-----------------|
| Real-time updates | Manual batching | Manual | Worker auto-batching |
| 1M row filtering | Slow (JS) | Slow (JS) | <2ms (WASM trigram) |
| Flash highlights | Basic | None | Adaptive (auto-degrades) |
| Trading components | Separate | None | Built-in |
| Bundle size | ~300kb | ~15kb | ~45kb |
| License | Commercial ($$$) | MIT | Apache-2.0 |

## Roadmap

- [x] Core DataGrid with virtualization
- [x] Flash highlighting with adaptive mode
- [x] Three-engine architecture (Worker/WASM/JS)
- [x] OrderBook, TopMovers, TimeSales, PositionLadder
- [x] Column resizing & reordering
- [x] CSV export
- [ ] Row grouping & aggregation
- [ ] Excel export (xlsx)

## Part of AskTurret

This grid is extracted from [AskTurret](https://askturret.com), an AI-native desktop platform for traders. Check it out for chat-based trade execution, multi-window layouts, and real-time portfolio monitoring.

## Contributing

```bash
git clone https://github.com/alprimak/askturret-grid
cd askturret-grid
npm install
npm run dev   # Watch mode
npm test      # Run tests
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
