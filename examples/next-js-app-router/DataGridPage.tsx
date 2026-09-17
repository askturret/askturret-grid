/**
 * Example: DataGrid in Next.js 15 App Router
 *
 * This file demonstrates the recommended pattern for using @askturret/grid
 * in Next.js App Router (Next.js 13+).
 *
 * To use this in your Next.js project:
 * 1. Copy this file to your app/ directory (e.g., app/grid/page.tsx)
 * 2. Install dependencies: npm install @askturret/grid
 * 3. Ensure the 'use client' directive is at the top
 */

'use client';

import { useState, useEffect } from 'react';
import { DataGrid, type ColumnDef } from '@askturret/grid';
import '@askturret/grid/styles.css';

interface DataRow {
  id: string;
  symbol: string;
  price: number;
  volume: number;
  change: number;
}

const columns: ColumnDef<DataRow>[] = [
  {
    field: 'symbol',
    header: 'Symbol',
    sortable: true,
    width: '120px',
  },
  {
    field: 'price',
    header: 'Price',
    align: 'right',
    sortable: true,
    formatter: (value) => `$${(value as number).toFixed(2)}`,
    flashOnChange: true,
  },
  {
    field: 'volume',
    header: 'Volume',
    align: 'right',
    sortable: true,
    formatter: (value) => (value as number).toLocaleString(),
  },
  {
    field: 'change',
    header: 'Change',
    align: 'right',
    sortable: true,
    formatter: (value) => {
      const num = value as number;
      return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
    },
    cellClass: (value) => {
      const num = value as number;
      return num > 0 ? 'text-green-600' : num < 0 ? 'text-red-600' : '';
    },
  },
];

// Sample data - in a real app, fetch this from your API
const sampleData: DataRow[] = [
  { id: '1', symbol: 'AAPL', price: 178.25, volume: 50234567, change: 2.34 },
  { id: '2', symbol: 'GOOGL', price: 142.83, volume: 28456123, change: -0.87 },
  { id: '3', symbol: 'MSFT', price: 378.91, volume: 42123456, change: 1.52 },
  { id: '4', symbol: 'AMZN', price: 145.67, volume: 35678901, change: -1.23 },
  { id: '5', symbol: 'TSLA', price: 234.56, volume: 125678901, change: 3.45 },
];

/**
 * Example 1: Basic Grid (Server-fetched data)
 *
 * This component receives data as props from a Server Component.
 * The data fetching happens on the server, then passed to this client component.
 */
export function BasicDataGridExample({ data }: { data: DataRow[] }) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Stock Prices</h1>
      <DataGrid
        data={data}
        columns={columns}
        rowKey="id"
        showFilter
        filterPlaceholder="Search symbols..."
        virtualize="auto"
        compact
      />
    </div>
  );
}

/**
 * Example 2: Client-side Data Fetching
 *
 * This component fetches data on the client using useEffect.
 * Useful for real-time data or when you need client-side state.
 */
export default function DataGridPage() {
  const [data, setData] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API fetch
    // In a real app, replace with: fetch('/api/stocks').then(r => r.json())
    const timer = setTimeout(() => {
      setData(sampleData);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Stock Prices (Client-fetched)</h1>
      <DataGrid
        data={data}
        columns={columns}
        rowKey="id"
        showFilter
        filterPlaceholder="Search symbols..."
        virtualize="auto"
        compact
      />
    </div>
  );
}

/**
 * Example 3: Server Component + Client Grid Pattern
 *
 * In your server component file (e.g., app/page.tsx):
 *
 * ```tsx
 * // app/page.tsx (Server Component - no 'use client')
 * import { BasicDataGridExample } from './DataGridPage';
 *
 * async function getStocks() {
 *   const res = await fetch('https://api.example.com/stocks', {
 *     next: { revalidate: 60 } // ISR - revalidate every 60s
 *   });
 *   return res.json();
 * }
 *
 * export default async function Page() {
 *   const data = await getStocks();
 *
 *   return (
 *     <div>
 *       <h1>Server-rendered page with client grid</h1>
 *       <BasicDataGridExample data={data} />
 *     </div>
 *   );
 * }
 * ```
 */
