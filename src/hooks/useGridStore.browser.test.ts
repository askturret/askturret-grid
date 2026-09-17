import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGridStore } from './useGridStore';
import type { ColumnSchema } from '../wasm/WasmGridStore';

/**
 * Browser-specific tests for useGridStore.
 *
 * Unlike the unit tests in useGridStore.test.ts, these tests exercise
 * the REAL WorkerGridStore against the REAL Worker API in a browser.
 *
 * NO vi.mock() - this validates that:
 * - The real worker-based store integration works in browsers
 * - React hooks properly manage real Worker lifecycle
 * - Worker communication works correctly with React state updates
 */
describe('useGridStore (Browser - Real Worker API)', () => {
  it('initializes with worker store type using real Worker', async () => {
    const schema: ColumnSchema[] = [{ name: 'id', primaryKey: true, indexed: true }];

    const { result } = renderHook(() =>
      useGridStore({
        storeType: 'worker',
        schema,
        initialData: [{ id: 'test' }],
      })
    );

    // Wait for real Worker initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.storeType).toBe('worker');
    expect(result.current.isReady).toBe(true);
    expect(result.current.rowCount).toBe(1);
  });

  it('does not re-initialize when fresh-but-equivalent schema/initialData are passed (real Worker)', async () => {
    const createSchema = (): ColumnSchema[] => [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'value', primaryKey: false, indexed: false },
    ];

    const createInitialData = () => [
      { id: 'row1', value: 'test1' },
      { id: 'row2', value: 'test2' },
    ];

    const readyStates: boolean[] = [];

    const { result, rerender } = renderHook(
      ({ schema, initialData }) => {
        const store = useGridStore({
          storeType: 'worker', // Use real worker
          schema,
          initialData,
        });
        readyStates.push(store.isReady);
        return store;
      },
      {
        initialProps: {
          schema: createSchema(),
          initialData: createInitialData(),
        },
      }
    );

    // Wait for real Worker initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.isReady).toBe(true);
    expect(result.current.rowCount).toBe(2);

    // Clear tracked states
    readyStates.length = 0;

    // Rerender with fresh references (simulates inline props)
    rerender({
      schema: createSchema(),
      initialData: createInitialData(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // With real Worker, isReady should stay true (no re-initialization)
    expect(result.current.isReady).toBe(true);
    expect(readyStates.every((state) => state === true)).toBe(true);
    expect(result.current.rowCount).toBe(2);
  });

  it('cleans up real Worker on unmount', async () => {
    const schema: ColumnSchema[] = [{ name: 'id', primaryKey: true, indexed: true }];

    const { result, unmount } = renderHook(() =>
      useGridStore({
        storeType: 'worker',
        schema,
      })
    );

    // Wait for real Worker initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.isReady).toBe(true);

    // Unmount should terminate the real Worker
    unmount();

    // Give cleanup time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // No errors should occur during cleanup of real Worker
  });

  it('loads data into real Worker store', async () => {
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'name', primaryKey: false, indexed: false },
    ];

    const { result } = renderHook(() =>
      useGridStore({
        storeType: 'worker',
        schema,
      })
    );

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Load data via the hook (correct method name is loadRows)
    await result.current.loadRows([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ]);

    // Wait for Worker to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify data loaded through real Worker
    expect(result.current.rowCount).toBe(3);
  });
});
