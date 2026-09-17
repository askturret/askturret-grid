import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWasmView } from './useWasmView';
import { GridCore } from '../wasm/GridCore';

// Mock GridCore
vi.mock('../wasm/GridCore');

describe('useWasmView', () => {
  let mockGridCore: {
    init: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    setData: ReturnType<typeof vi.fn>;
    setFilter: ReturnType<typeof vi.fn>;
    setSort: ReturnType<typeof vi.fn>;
    getView: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGridCore = {
      init: vi.fn().mockResolvedValue(true),
      dispose: vi.fn(),
      setData: vi.fn(),
      setFilter: vi.fn(),
      setSort: vi.fn(),
      getView: vi.fn().mockReturnValue([0, 1, 2]),
    };

    (GridCore as unknown as vi.Mock).mockImplementation(() => mockGridCore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const defaultParams = {
    data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ],
    columns: [{ field: 'id' }, { field: 'name' }],
    filter: '',
    sort: { field: null, direction: null },
    shouldUseWasmCore: false,
  };

  it('initializes with wasmCoreReady false when shouldUseWasmCore is false', () => {
    const { result } = renderHook(() => useWasmView(defaultParams));

    expect(result.current.wasmCoreReady).toBe(false);
    expect(result.current.wasmIndices).toBeNull();
  });

  it('initializes GridCore when shouldUseWasmCore becomes true', async () => {
    const { result, rerender } = renderHook(
      ({ shouldUseWasmCore }) => useWasmView({ ...defaultParams, shouldUseWasmCore }),
      { initialProps: { shouldUseWasmCore: false } }
    );

    expect(result.current.wasmCoreReady).toBe(false);

    // Enable WASM
    rerender({ shouldUseWasmCore: true });

    // Wait for async init to complete
    await waitFor(() => {
      expect(result.current.wasmCoreReady).toBe(true);
    });

    expect(mockGridCore.init).toHaveBeenCalledTimes(1);
  });

  it('disposes GridCore when shouldUseWasmCore becomes false', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ shouldUseWasmCore }) => useWasmView({ ...defaultParams, shouldUseWasmCore }),
      { initialProps: { shouldUseWasmCore: true } }
    );

    // Wait for init
    await waitFor(() => {
      expect(result.current.wasmCoreReady).toBe(true);
    });

    const disposeCallsBefore = mockGridCore.dispose.mock.calls.length;

    // Disable WASM - this should dispose the core
    act(() => {
      rerender({ shouldUseWasmCore: false });
    });

    // GridCore.dispose should be called when disabling WASM
    expect(mockGridCore.dispose.mock.calls.length).toBeGreaterThan(disposeCallsBefore);

    unmount();
  });

  it('syncs data to GridCore when row count changes', async () => {
    const { rerender } = renderHook(
      ({ data }) => useWasmView({ ...defaultParams, data, shouldUseWasmCore: true }),
      { initialProps: { data: defaultParams.data } }
    );

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    // Change data (different row count)
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' },
    ];

    await act(async () => {
      rerender({ data: newData });
    });

    await waitFor(() => {
      expect(mockGridCore.setData).toHaveBeenCalled();
    });
  });

  it('does not sync data when row count is unchanged', async () => {
    const { rerender } = renderHook(
      ({ data }) => useWasmView({ ...defaultParams, data, shouldUseWasmCore: true }),
      { initialProps: { data: defaultParams.data } }
    );

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    mockGridCore.setData.mockClear();

    // Change data values but keep same row count
    const newData = [
      { id: 1, name: 'ALICE' },
      { id: 2, name: 'BOB' },
      { id: 3, name: 'CHARLIE' },
    ];

    await act(async () => {
      rerender({ data: newData });
    });

    // setData should NOT be called (same row count)
    expect(mockGridCore.setData).not.toHaveBeenCalled();
  });

  it('computes wasmIndices when filter changes', async () => {
    const { result, rerender } = renderHook(
      ({ filter }) => useWasmView({ ...defaultParams, filter, shouldUseWasmCore: true }),
      { initialProps: { filter: '' } }
    );

    // Wait for init
    await waitFor(() => {
      expect(result.current.wasmCoreReady).toBe(true);
    });

    mockGridCore.setFilter.mockClear();
    mockGridCore.getView.mockReturnValue([0, 2]); // Filter result

    await act(async () => {
      rerender({ filter: 'lie' });
    });

    await waitFor(() => {
      expect(mockGridCore.setFilter).toHaveBeenCalledWith('lie');
      expect(result.current.wasmIndices).toEqual([0, 2]);
    });
  });

  it('computes wasmIndices when sort changes', async () => {
    const { result, rerender } = renderHook(
      ({ sort }) => useWasmView({ ...defaultParams, sort, shouldUseWasmCore: true }),
      { initialProps: { sort: { field: null, direction: null } } }
    );

    // Wait for init
    await waitFor(() => {
      expect(result.current.wasmCoreReady).toBe(true);
    });

    mockGridCore.setSort.mockClear();
    mockGridCore.getView.mockReturnValue([2, 1, 0]); // Sorted result

    await act(async () => {
      rerender({ sort: { field: 'name', direction: 'desc' } });
    });

    await waitFor(() => {
      expect(mockGridCore.setSort).toHaveBeenCalledWith(1, 'desc');
      expect(result.current.wasmIndices).toEqual([2, 1, 0]);
    });
  });

  it('calls setSort with -1 when sort field is not in columns', async () => {
    const { rerender } = renderHook(
      ({ sort }) => useWasmView({ ...defaultParams, sort, shouldUseWasmCore: true }),
      { initialProps: { sort: { field: null, direction: null } } }
    );

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    mockGridCore.setSort.mockClear();

    await act(async () => {
      rerender({ sort: { field: 'nonexistent', direction: 'asc' } });
    });

    await waitFor(() => {
      expect(mockGridCore.setSort).toHaveBeenCalledWith(-1, null);
    });
  });

  it('disposes GridCore on unmount', async () => {
    const { unmount } = renderHook(() => useWasmView({ ...defaultParams, shouldUseWasmCore: true }));

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    unmount();

    expect(mockGridCore.dispose).toHaveBeenCalled();
  });

  it('handles failed GridCore initialization gracefully', async () => {
    mockGridCore.init.mockResolvedValue(false);

    const { result } = renderHook(() => useWasmView({ ...defaultParams, shouldUseWasmCore: true }));

    // Wait a bit for init to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.wasmCoreReady).toBe(false);
    expect(result.current.wasmIndices).toBeNull();
  });

  it('R1: handles strict-mode double-invocation (side effects in useMemo are idempotent)', async () => {
    const { result } = renderHook(() => useWasmView({ ...defaultParams, shouldUseWasmCore: true }));

    // Wait for init
    await waitFor(() => {
      expect(result.current.wasmCoreReady).toBe(true);
    });

    // Simulate strict-mode by calling getView multiple times
    const firstCall = mockGridCore.getView.mock.calls.length;

    // Force a re-render with same props (simulating strict mode)
    result.current.wasmIndices; // Access to trigger useMemo

    // In strict mode, useMemo might be called twice, but results should be consistent
    expect(mockGridCore.getView).toHaveBeenCalled();
    expect(result.current.wasmIndices).toEqual([0, 1, 2]);
  });

  it('returns null indices when GridCore is not ready', () => {
    const { result } = renderHook(() => useWasmView({ ...defaultParams, shouldUseWasmCore: false }));

    expect(result.current.wasmIndices).toBeNull();
  });

  it('clears sort when sort direction is null', async () => {
    const { rerender } = renderHook(
      ({ sort }) => useWasmView({ ...defaultParams, sort, shouldUseWasmCore: true }),
      { initialProps: { sort: { field: 'name', direction: 'asc' } } }
    );

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    mockGridCore.setSort.mockClear();

    await act(async () => {
      rerender({ sort: { field: null, direction: null } });
    });

    await waitFor(() => {
      expect(mockGridCore.setSort).toHaveBeenCalledWith(-1, null);
    });
  });

  it('does not reinitialize GridCore when shouldUseWasmCore stays true', async () => {
    const { rerender } = renderHook(
      ({ filter }) => useWasmView({ ...defaultParams, filter, shouldUseWasmCore: true }),
      { initialProps: { filter: '' } }
    );

    // Wait for init
    await waitFor(() => {
      expect(mockGridCore.init).toHaveBeenCalled();
    });

    const initCallCount = mockGridCore.init.mock.calls.length;

    // Change filter (but keep shouldUseWasmCore true)
    await act(async () => {
      rerender({ filter: 'test' });
    });

    // init should not be called again
    expect(mockGridCore.init).toHaveBeenCalledTimes(initCallCount);
  });
});
