# Using @askturret/grid with Next.js

This guide explains how to use `@askturret/grid` in Next.js applications, including the App Router (Next.js 13+) and Pages Router.

## Quick Start

### Next.js App Router (Recommended)

With Next.js App Router, components that use `@askturret/grid` must be marked as Client Components using the `'use client'` directive:

```tsx
'use client';

import { DataGrid } from '@askturret/grid';
import '@askturret/grid/styles.css';
import type { ColumnDef } from '@askturret/grid';

interface DataRow {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<DataRow>[] = [
  { field: 'name', header: 'Name' },
  { field: 'value', header: 'Value', align: 'right' },
];

export default function GridPage() {
  const [data, setData] = useState<DataRow[]>([]);

  useEffect(() => {
    // Fetch your data here
    setData([
      { id: '1', name: 'Alpha', value: 100 },
      { id: '2', name: 'Beta', value: 200 },
    ]);
  }, []);

  return (
    <div>
      <h1>My Data Grid</h1>
      <DataGrid data={data} columns={columns} rowKey="id" />
    </div>
  );
}
```

### Next.js Pages Router

With Pages Router, the grid works out of the box since all pages are client-side rendered by default:

```tsx
import { DataGrid } from '@askturret/grid';
import '@askturret/grid/styles.css';

export default function GridPage() {
  // Your component code here
  return <DataGrid data={data} columns={columns} rowKey="id" />;
}
```

## Why 'use client' is Required

The DataGrid component uses browser-only APIs (Web Workers, WebAssembly, DOM measurements) that are not available during server-side rendering. The `'use client'` directive tells Next.js to render this component only on the client side.

**What's SSR-safe:**
- All React components in this library are SSR-safe in their rendering logic
- Browser APIs (Worker, WASM, DOM) are only accessed in `useEffect` hooks, which run after mount on the client

**What requires 'use client':**
- Any component that imports DataGrid, OrderBook, TopMovers, TimeSales, or PositionLadder
- Components using `WorkerGridStore` or `WasmGridStore` directly
- Components using WASM utilities (`initWasm`, `initWasmStore`, etc.)

## Advanced Features

### WASM Grid Store

The WASM store features work seamlessly in client components:

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

  if (!store) return <div>Loading...</div>;

  const visible = store.getVisibleRows(0, 50);
  return <DataGrid data={visible} columns={columns} rowKey="id" />;
}
```

### Worker Grid Store

For high-frequency updates, the Worker store also requires client-side rendering:

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

  // Your component code
}
```

## Common Patterns

### Separating Client and Server Code

Create a separate client component file for the grid:

```tsx
// components/DataGridClient.tsx
'use client';

import { DataGrid } from '@askturret/grid';
import '@askturret/grid/styles.css';

export function DataGridClient({ data, columns }) {
  return <DataGrid data={data} columns={columns} rowKey="id" />;
}
```

Then use it in your server component:

```tsx
// app/page.tsx (Server Component)
import { DataGridClient } from '@/components/DataGridClient';

export default async function Page() {
  // Fetch data on the server
  const data = await fetchData();

  return (
    <div>
      <h1>Server-rendered page with client grid</h1>
      <DataGridClient data={data} columns={columns} />
    </div>
  );
}
```

### Loading States

Since the grid requires client-side rendering, you may want to show a loading state:

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

export default function GridPage() {
  return <DataGrid data={data} columns={columns} rowKey="id" />;
}
```

## Troubleshooting

### "ReferenceError: Worker is not defined"

This means the component is being rendered on the server. Add `'use client'` to the top of your component file.

### "ReferenceError: document is not defined"

Same as above - the component needs to be marked as a client component.

### Hydration Mismatch

If you see hydration errors, ensure that:
1. Your component has `'use client'` at the top
2. You're not conditionally rendering the grid based on `typeof window !== 'undefined'` (not needed with 'use client')
3. Your data fetching happens in `useEffect` or React Query, not during render

## Performance Considerations

- **Bundle size**: The grid and WASM module are only loaded on the client, reducing initial page load
- **Code splitting**: Use dynamic imports with `ssr: false` for further optimization
- **Data fetching**: Fetch data on the server (in Server Components or `getServerSideProps`) and pass it as props to the client component

## Example Project

A minimal working Next.js 15 App Router example is available at:
```
examples/next-js-app-router/
```

## Summary

✅ **Do:**
- Mark components that use the grid with `'use client'`
- Fetch data on the server and pass as props when possible
- Use dynamic imports with `ssr: false` for code splitting

❌ **Don't:**
- Try to render the grid on the server
- Use `typeof window` checks (not needed with 'use client')
- Import grid components in Server Components without wrapping them

For more information, see the [Next.js documentation on Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components).
