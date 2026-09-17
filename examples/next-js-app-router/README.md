# Next.js App Router Example

This directory contains example components demonstrating how to use `@askturret/grid` in Next.js 15+ with the App Router.

## Quick Start

1. **Install dependencies** in your Next.js project:
   ```bash
   npm install @askturret/grid
   ```

2. **Copy the example file** to your app directory:
   ```bash
   cp examples/next-js-app-router/DataGridPage.tsx app/stocks/page.tsx
   ```

3. **Start your Next.js dev server**:
   ```bash
   npm run dev
   ```

4. **Visit** `http://localhost:3000/stocks`

## What's Included

### `DataGridPage.tsx`

This file contains three example patterns:

1. **BasicDataGridExample** - Receives server-fetched data as props
2. **DataGridPage** (default export) - Fetches data on the client
3. **Server + Client Pattern** (in comments) - Shows how to combine server and client components

## Key Points

### The 'use client' Directive

All components that use `@askturret/grid` must have `'use client'` at the top of the file:

```tsx
'use client';

import { DataGrid } from '@askturret/grid';
```

This tells Next.js to render the component only on the client side.

### Why Client-Only?

The DataGrid uses browser-only APIs that aren't available during server-side rendering:
- Web Workers (for `WorkerGridStore`)
- WebAssembly (for `WasmGridStore`)
- DOM measurements (for virtualization)

These APIs are accessed in React effects (`useEffect`), which only run on the client, making the components SSR-safe in their rendering logic.

### Server Data Fetching

You can still fetch data on the server and pass it to the client grid:

```tsx
// app/page.tsx (Server Component)
export default async function Page() {
  const data = await fetch('https://api.example.com/data').then(r => r.json());
  
  return <DataGridClient data={data} />; // Client component
}
```

```tsx
// components/DataGridClient.tsx (Client Component)
'use client';

import { DataGrid } from '@askturret/grid';

export function DataGridClient({ data }) {
  return <DataGrid data={data} columns={columns} rowKey="id" />;
}
```

## Advanced Features

### WASM Store

For heavy filtering on large datasets:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { WasmGridStore, type ColumnSchema } from '@askturret/grid';

export default function WasmGridPage() {
  const [store, setStore] = useState<WasmGridStore | null>(null);
  const [visibleRows, setVisibleRows] = useState([]);

  useEffect(() => {
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'name', type: 'string' },
      { name: 'value', type: 'number' },
    ];

    WasmGridStore.create(schema).then(setStore);
  }, []);

  if (!store) return <div>Loading WASM...</div>;

  const visible = store.getVisibleRows(0, 50);
  return <DataGrid data={visible} columns={columns} rowKey="id" />;
}
```

### Worker Store

For real-time updates at 60 FPS:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { WorkerGridStore, type ColumnSchema } from '@askturret/grid';

export default function WorkerGridPage() {
  const [store, setStore] = useState<WorkerGridStore | null>(null);

  useEffect(() => {
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'symbol', type: 'string', indexed: true },
      { name: 'price', type: 'number' },
    ];

    WorkerGridStore.create(schema, { batchInterval: 16 }).then(setStore);
    return () => store?.dispose();
  }, []);

  // Connect to WebSocket and call store.queueUpdates(updates)
}
```

## Common Patterns

### Loading State with Dynamic Import

For code splitting and lazy loading:

```tsx
'use client';

import dynamic from 'next/dynamic';

const DataGrid = dynamic(
  () => import('@askturret/grid').then((mod) => mod.DataGrid),
  {
    loading: () => <div>Loading grid...</div>,
    ssr: false,
  }
);
```

### TypeScript Types

Full TypeScript support with type inference:

```tsx
import { DataGrid, type ColumnDef, type DataGridProps } from '@askturret/grid';

interface StockData {
  symbol: string;
  price: number;
  volume: number;
}

const columns: ColumnDef<StockData>[] = [
  { field: 'symbol', header: 'Symbol' },
  { field: 'price', header: 'Price', align: 'right' },
];

// TypeScript infers the correct data type
<DataGrid data={stocks} columns={columns} rowKey="symbol" />
```

## Troubleshooting

### "ReferenceError: Worker is not defined"

**Solution**: Add `'use client'` at the top of your component file.

### "ReferenceError: document is not defined"

**Solution**: Same as above - mark the component as a client component.

### Hydration Mismatch

**Solution**: Ensure your component has `'use client'` and you're not using `typeof window !== 'undefined'` checks (not needed with the directive).

## Full Documentation

For comprehensive documentation, see **[Next.js Usage Guide](../../docs/next-js-usage.md)**.

## Need Help?

- [Documentation](https://grid.askturret.com)
- [GitHub Issues](https://github.com/askturret/askturret-grid/issues)
- [npm Package](https://www.npmjs.com/package/@askturret/grid)
