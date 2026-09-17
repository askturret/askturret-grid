import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRowExit } from './useRowExit';

describe('useRowExit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const defaultParams = {
    sortedData: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ],
    rowExitDuration: 1000,
    getRowKey: (row: { id: number; name: string }) => String(row.id),
    filter: '',
    columnOrder: ['id', 'name'],
  };

  it('returns mergedData with isLeaving false when rowExitDuration is 0', () => {
    const { result } = renderHook(() =>
      useRowExit({
        ...defaultParams,
        rowExitDuration: 0,
      })
    );

    expect(result.current.mergedData).toHaveLength(3);
    expect(result.current.mergedData.every((item) => !item.isLeaving)).toBe(true);
    expect(result.current.leavingRowsSize).toBe(0);
  });

  it('detects removed rows and adds them to leaving state', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData });
    });

    // Row 2 should be in leaving state
    expect(result.current.leavingRowsSize).toBe(1);
    expect(result.current.mergedData).toHaveLength(3); // 2 current + 1 leaving
    expect(result.current.mergedData.filter((item) => item.isLeaving)).toHaveLength(1);
  });

  it('removes leaving rows after expiry timeout', async () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Fast-forward past rowExitDuration
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Leaving row should be cleaned up
    await waitFor(() => {
      expect(result.current.leavingRowsSize).toBe(0);
      expect(result.current.mergedData).toHaveLength(2);
    });
  });

  it('clears leaving rows when filter changes', () => {
    const { result, rerender } = renderHook(
      ({ sortedData, filter }) => useRowExit({ ...defaultParams, sortedData, filter }),
      { initialProps: { sortedData: defaultParams.sortedData, filter: '' } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData, filter: '' });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Change filter
    act(() => {
      rerender({ sortedData: newData, filter: 'test' });
    });

    // Leaving rows should be cleared
    expect(result.current.leavingRowsSize).toBe(0);
  });

  it('clears leaving rows when columnOrder changes', () => {
    const { result, rerender } = renderHook(
      ({ sortedData, columnOrder }) => useRowExit({ ...defaultParams, sortedData, columnOrder }),
      { initialProps: { sortedData: defaultParams.sortedData, columnOrder: ['id', 'name'] } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData, columnOrder: ['id', 'name'] });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Change column order
    act(() => {
      rerender({ sortedData: newData, columnOrder: ['name', 'id'] });
    });

    // Leaving rows should be cleared
    expect(result.current.leavingRowsSize).toBe(0);
  });

  it('cancels leaving state when row reappears', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row 2
    const withoutRow2 = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: withoutRow2 });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Re-add row 2
    act(() => {
      rerender({ sortedData: defaultParams.sortedData });
    });

    // Leaving state should be cleared for row 2
    expect(result.current.leavingRowsSize).toBe(0);
  });

  it('clearLeaving function clears all leaving rows', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Call clearLeaving
    act(() => {
      result.current.clearLeaving();
    });

    expect(result.current.leavingRowsSize).toBe(0);
  });

  it('R4: prevSortedDataRef is written on both branches (early-return and main)', async () => {
    const { result, rerender } = renderHook(
      ({ sortedData, rowExitDuration }) => useRowExit({ ...defaultParams, sortedData, rowExitDuration }),
      { initialProps: { sortedData: defaultParams.sortedData, rowExitDuration: 0 } }
    );

    // With rowExitDuration=0, early-return branch should still update prevSortedDataRef
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData, rowExitDuration: 0 });
    });

    // Now flip rowExitDuration to non-zero
    // If prevSortedDataRef was NOT updated on early-return, this would run stale diff
    act(() => {
      rerender({ sortedData: newData, rowExitDuration: 1000 });
    });

    // After flipping, there should be no leaving rows (diff should be clean, not stale)
    // This verifies that prevSortedDataRef was updated even on the early-return branch
    await waitFor(() => {
      expect(result.current.leavingRowsSize).toBe(0);
    });
  });

  it('splices leaving rows at their snapshot positions', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row at index 1 (Bob)
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData });
    });

    // mergedData should have the leaving row at its original position (index 1)
    expect(result.current.mergedData).toHaveLength(3);
    expect(result.current.mergedData[1].row.id).toBe(2); // Bob at index 1
    expect(result.current.mergedData[1].isLeaving).toBe(true);
  });

  it('caps leaving rows at 1000 entries (memory safety)', () => {
    const largeData = Array.from({ length: 1200 }, (_, i) => ({ id: i, name: `Row ${i}` }));

    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: largeData } }
    );

    // Remove all rows
    act(() => {
      rerender({ sortedData: [] });
    });

    // Leaving rows should be capped at 1000
    expect(result.current.leavingRowsSize).toBeLessThanOrEqual(1000);
  });

  it('handles multiple rows removed at once', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove multiple rows
    const newData = [{ id: 2, name: 'Bob' }];

    act(() => {
      rerender({ sortedData: newData });
    });

    // Two rows should be in leaving state
    expect(result.current.leavingRowsSize).toBe(2);
    expect(result.current.mergedData).toHaveLength(3); // 1 current + 2 leaving
  });

  it('does not add duplicate leaving rows', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove row 2
    const newData = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    act(() => {
      rerender({ sortedData: newData });
    });

    expect(result.current.leavingRowsSize).toBe(1);

    // Trigger the same removal again with a new array reference (same content)
    act(() => {
      rerender({ sortedData: [...newData] });
    });

    // Should still be 1 (no duplicate)
    expect(result.current.leavingRowsSize).toBe(1);
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useRowExit(defaultParams));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('does not set up interval when rowExitDuration is 0', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    renderHook(() =>
      useRowExit({
        ...defaultParams,
        rowExitDuration: 0,
      })
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('handles edge case: leaving row at index beyond current data length', () => {
    const { result, rerender } = renderHook(
      ({ sortedData }) => useRowExit({ ...defaultParams, sortedData }),
      { initialProps: { sortedData: defaultParams.sortedData } }
    );

    // Remove first two rows
    const newData = [{ id: 3, name: 'Charlie' }];

    act(() => {
      rerender({ sortedData: newData });
    });

    // Leaving rows should be clamped to valid positions
    expect(result.current.mergedData).toHaveLength(3); // 1 current + 2 leaving
    result.current.mergedData.forEach((item, index) => {
      expect(item.row).toBeDefined();
    });
  });
});
