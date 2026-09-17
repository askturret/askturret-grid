import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSortedData } from './useSortedData';
import * as wasm from '../wasm';

// Mock the wasm module
vi.mock('../wasm', () => ({
  filterAndSort: vi.fn(),
  isWasmAvailable: vi.fn(),
}));

describe('useSortedData', () => {
  const mockData = [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 25 },
    { id: 3, name: 'Charlie', age: 35 },
    { id: 4, name: 'David', age: 28 },
  ];

  const defaultColumns = [{ field: 'id' }, { field: 'name' }, { field: 'age' }];

  beforeEach(() => {
    vi.clearAllMocks();
    (wasm.isWasmAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  const defaultParams = {
    data: mockData,
    filter: '',
    filterFields: ['name' as keyof typeof mockData[0]],
    columns: defaultColumns,
    sort: { field: null, direction: null },
    wasmCoreReady: false,
    wasmIndices: null,
    shouldVirtualize: false,
  };

  it('returns full data when no filter or sort is applied', () => {
    const { result } = renderHook(() => useSortedData(defaultParams));

    expect(result.current.sortedData).toEqual(mockData);
    expect(result.current.visibleCount).toBe(4);
  });

  it('filters data by name (JavaScript fallback)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'ali',
      })
    );

    expect(result.current.sortedData).toHaveLength(1);
    expect(result.current.sortedData[0].name).toBe('Alice');
    expect(result.current.visibleCount).toBe(1);
  });

  it('filter is case-insensitive', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'ALICE',
      })
    );

    expect(result.current.sortedData).toHaveLength(1);
    expect(result.current.sortedData[0].name).toBe('Alice');
  });

  it('handles filter with no matches', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'nonexistent',
      })
    );

    expect(result.current.sortedData).toHaveLength(0);
    expect(result.current.visibleCount).toBe(0);
  });

  it('handles filter with null values in data', () => {
    const dataWithNull = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: null, age: 25 },
      { id: 3, name: 'Charlie', age: 35 },
    ];

    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        data: dataWithNull,
        filter: 'ali',
      })
    );

    expect(result.current.sortedData).toHaveLength(1);
    expect(result.current.sortedData[0].name).toBe('Alice');
  });

  it('sorts data ascending (JavaScript fallback)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        sort: { field: 'age', direction: 'asc' },
      })
    );

    expect(result.current.sortedData[0].age).toBe(25);
    expect(result.current.sortedData[3].age).toBe(35);
  });

  it('sorts data descending (JavaScript fallback)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        sort: { field: 'age', direction: 'desc' },
      })
    );

    expect(result.current.sortedData[0].age).toBe(35);
    expect(result.current.sortedData[3].age).toBe(25);
  });

  it('sorts strings alphabetically', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        sort: { field: 'name', direction: 'asc' },
      })
    );

    expect(result.current.sortedData[0].name).toBe('Alice');
    expect(result.current.sortedData[3].name).toBe('David');
  });

  it('handles sorting with null values (nulls at end for asc)', () => {
    const dataWithNull = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: null },
      { id: 3, name: 'Charlie', age: 35 },
    ];

    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        data: dataWithNull,
        sort: { field: 'age', direction: 'asc' },
      })
    );

    // Nulls should be at the end for ascending sort
    expect(result.current.sortedData[2].age).toBeNull();
  });

  it('handles sorting with null values (nulls at beginning for desc)', () => {
    const dataWithNull = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: null },
      { id: 3, name: 'Charlie', age: 35 },
    ];

    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        data: dataWithNull,
        sort: { field: 'age', direction: 'desc' },
      })
    );

    // Nulls are sorted to the beginning for descending sort
    // Sorted descending: Bob (null), Charlie (35), Alice (30)
    expect(result.current.sortedData[0].age).toBeNull();
    expect(result.current.sortedData[1].age).toBe(35);
    expect(result.current.sortedData[2].age).toBe(30);
  });

  it('filters and sorts together (JavaScript fallback)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'li',
        sort: { field: 'name', direction: 'asc' },
      })
    );

    // Should match "Alice" and "Charlie", sorted alphabetically
    expect(result.current.sortedData).toHaveLength(2);
    expect(result.current.sortedData[0].name).toBe('Alice');
    expect(result.current.sortedData[1].name).toBe('Charlie');
  });

  it('uses WASM indices when available', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        wasmCoreReady: true,
        wasmIndices: [2, 0, 1], // Charlie, Alice, Bob
      })
    );

    expect(result.current.sortedData).toHaveLength(3);
    expect(result.current.sortedData[0].name).toBe('Charlie');
    expect(result.current.sortedData[1].name).toBe('Alice');
    expect(result.current.sortedData[2].name).toBe('Bob');
    expect(result.current.visibleCount).toBe(3);
  });

  it('returns empty array when WASM indices available and shouldVirtualize is true', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        wasmCoreReady: true,
        wasmIndices: [2, 0, 1],
        shouldVirtualize: true,
      })
    );

    // For virtualized mode, sortedData is empty (use getRowAtIndex instead)
    expect(result.current.sortedData).toEqual([]);
    expect(result.current.visibleCount).toBe(3);
  });

  it('getRowAtIndex uses WASM indices when available', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        wasmCoreReady: true,
        wasmIndices: [2, 0, 1], // Charlie, Alice, Bob
      })
    );

    expect(result.current.getRowAtIndex(0)?.name).toBe('Charlie');
    expect(result.current.getRowAtIndex(1)?.name).toBe('Alice');
    expect(result.current.getRowAtIndex(2)?.name).toBe('Bob');
  });

  it('getRowAtIndex returns undefined for out-of-bounds index (WASM mode)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        wasmCoreReady: true,
        wasmIndices: [2, 0, 1],
      })
    );

    expect(result.current.getRowAtIndex(10)).toBeUndefined();
  });

  it('getRowAtIndex uses direct data access when WASM not available', () => {
    const { result } = renderHook(() => useSortedData(defaultParams));

    expect(result.current.getRowAtIndex(0)?.name).toBe('Alice');
    expect(result.current.getRowAtIndex(1)?.name).toBe('Bob');
  });

  it('uses legacy WASM filterAndSort for medium datasets (>1000 rows)', () => {
    (wasm.isWasmAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (wasm.filterAndSort as ReturnType<typeof vi.fn>).mockReturnValue([2, 0, 1]);

    const largeData = Array.from({ length: 1500 }, (_, i) => ({
      id: i,
      name: `Name${i}`,
      age: 20 + i,
    }));

    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        data: largeData,
        filter: 'test',
        sort: { field: 'age', direction: 'asc' },
      })
    );

    expect(wasm.filterAndSort).toHaveBeenCalled();
    expect(result.current.sortedData).toHaveLength(3);
  });

  it('does not use legacy WASM for small datasets (<1000 rows)', () => {
    (wasm.isWasmAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'ali',
        sort: { field: 'age', direction: 'asc' },
      })
    );

    expect(wasm.filterAndSort).not.toHaveBeenCalled();
    expect(result.current.sortedData).toHaveLength(1);
  });

  it('uses filterFields to determine which fields to search', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: '30',
        filterFields: ['age' as keyof typeof mockData[0]],
      })
    );

    expect(result.current.sortedData).toHaveLength(1);
    expect(result.current.sortedData[0].age).toBe(30);
  });

  it('falls back to all columns when filterFields is not provided', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: '1',
        filterFields: undefined,
      })
    );

    // Should match id=1 (Alice)
    expect(result.current.sortedData).toHaveLength(1);
    expect(result.current.sortedData[0].id).toBe(1);
  });

  it('visibleCount matches filtered data length', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: 'li',
      })
    );

    expect(result.current.visibleCount).toBe(2); // Alice, Charlie
  });

  it('visibleCount equals data length when no filter is applied', () => {
    const { result } = renderHook(() => useSortedData(defaultParams));

    expect(result.current.visibleCount).toBe(4);
  });

  it('handles empty data array', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        data: [],
      })
    );

    expect(result.current.sortedData).toEqual([]);
    expect(result.current.visibleCount).toBe(0);
  });

  it('handles whitespace-only filter (treated as empty)', () => {
    const { result } = renderHook(() =>
      useSortedData({
        ...defaultParams,
        filter: '   ',
      })
    );

    expect(result.current.sortedData).toEqual(mockData);
    expect(result.current.visibleCount).toBe(4);
  });

  it('does not mutate original data array when sorting', () => {
    const originalData = [...mockData];

    renderHook(() =>
      useSortedData({
        ...defaultParams,
        sort: { field: 'age', direction: 'desc' },
      })
    );

    expect(mockData).toEqual(originalData);
  });
});
