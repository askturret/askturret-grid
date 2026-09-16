import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGridStore } from './useGridStore';
import type { ColumnSchema } from '../wasm/WasmGridStore';

// Mock the store implementations
vi.mock('../wasm/WorkerGridStore', () => ({
  WorkerGridStore: {
    create: vi.fn().mockResolvedValue({
      dispose: vi.fn(),
      onVisibleRowsChange: vi.fn(),
      onViewCountChange: vi.fn(),
      setViewport: vi.fn(),
      loadRows: vi.fn().mockResolvedValue(undefined),
      queueUpdates: vi.fn(),
      setFilter: vi.fn(),
      clearFilter: vi.fn(),
      setSort: vi.fn(),
      clearSort: vi.fn(),
    }),
  },
}));

vi.mock('../wasm/WasmGridStore', () => ({
  WasmGridStore: {
    create: vi.fn().mockResolvedValue({
      dispose: vi.fn(),
      onViewChange: vi.fn(),
      loadRows: vi.fn(),
      getVisibleRows: vi.fn().mockReturnValue([]),
      getViewCount: vi.fn().mockReturnValue(0),
      getRowCount: vi.fn().mockReturnValue(0),
      updateRows: vi.fn(),
      setFilter: vi.fn(),
      clearFilter: vi.fn(),
      setSort: vi.fn(),
      clearSort: vi.fn(),
    }),
  },
}));

describe('useGridStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not re-initialize when fresh-but-equivalent schema/initialData are passed (regression test for #34)', async () => {
    // This test verifies that inlining schema/initialData (fresh references every render)
    // does NOT cause the store to re-initialize

    // Create equivalent but different object references
    const createSchema = (): ColumnSchema[] => [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'value', primaryKey: false, indexed: false },
    ];

    const createInitialData = () => [
      { id: 'row1', value: 'test1' },
      { id: 'row2', value: 'test2' },
    ];

    // Track isReady state changes to detect re-initialization
    const readyStates: boolean[] = [];

    // First render with fresh references
    const { result, rerender } = renderHook(
      ({ schema, initialData }) => {
        const store = useGridStore({
          storeType: 'js', // Use 'js' for simplicity (no async init)
          schema,
          initialData,
        });
        // Track every isReady state
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

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Initial state: should be ready
    expect(result.current.isReady).toBe(true);
    expect(result.current.rowCount).toBe(2); // 2 initial rows
    expect(result.current.data).toHaveLength(2);

    // Clear the tracked states before rerender
    readyStates.length = 0;

    // Rerender with NEW fresh references (simulating parent component rerender with inline props)
    rerender({
      schema: createSchema(), // Fresh array reference
      initialData: createInitialData(), // Fresh array reference
    });

    // Wait for any potential re-initialization
    await new Promise((resolve) => setTimeout(resolve, 0));

    // CRITICAL ASSERTION: isReady should stay true throughout
    // In the buggy version, fresh schema/initialData would cause dispose() -> re-init
    // which would flip isReady to false, then back to true
    // With the fix, isReady never flips - it stays true
    expect(result.current.isReady).toBe(true);
    expect(readyStates.every((state) => state === true)).toBe(true);

    // Data should still be present (not reset)
    expect(result.current.rowCount).toBe(2);
    expect(result.current.data).toHaveLength(2);
  });

  it('initializes with js store type', async () => {
    const schema: ColumnSchema[] = [{ name: 'id', primaryKey: true, indexed: true }];

    const { result } = renderHook(() =>
      useGridStore({
        storeType: 'js',
        schema,
        initialData: [{ id: 'test' }],
      })
    );

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.storeType).toBe('js');
    expect(result.current.isReady).toBe(true);
  });

  it('cleans up store on unmount', async () => {
    const schema: ColumnSchema[] = [{ name: 'id', primaryKey: true, indexed: true }];

    const { result, unmount } = renderHook(() =>
      useGridStore({
        storeType: 'js',
        schema,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.isReady).toBe(true);

    unmount();

    // After unmount, store should be cleaned up
    // (We can't directly test disposal since refs are internal, but no errors should occur)
  });
});
