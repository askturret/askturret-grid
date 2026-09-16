import { describe, it, expect, beforeEach } from 'vitest';
import { GridCore } from './GridCore';

describe('GridCore', () => {
  let core: GridCore;

  beforeEach(async () => {
    core = new GridCore();
    // WASM is mocked and won't be available, so init() returns false
    // This tests the JS fallback path
    await core.init();
  });

  describe('initialization', () => {
    it('initializes without WASM in test environment', async () => {
      const instance = new GridCore();
      const hasWasm = await instance.init();
      // In test environment, WASM is mocked and unavailable
      expect(hasWasm).toBe(false);
      expect(instance.isWasm()).toBe(false);
    });
  });

  describe('setData', () => {
    it('sets column-major data correctly', () => {
      const columns = [
        ['Alice', 'Bob', 'Charlie'],
        [100, 200, 150],
      ];
      core.setData(columns);

      expect(core.getRowCount()).toBe(3);
      expect(core.getColCount()).toBe(2);
    });

    it('handles empty data', () => {
      core.setData([]);
      expect(core.getRowCount()).toBe(0);
      expect(core.getColCount()).toBe(0);
    });

    it('invalidates view cache when data changes', () => {
      // Set initial data
      core.setData([
        ['Alice', 'Bob'],
        [100, 200],
      ]);
      const view1 = core.getView();

      // Change data
      core.setData([
        ['Charlie', 'Dave', 'Eve'],
        [150, 250, 175],
      ]);
      const view2 = core.getView();

      // View should reflect new data
      expect(view1.length).toBe(2);
      expect(view2.length).toBe(3);
      expect(view2).toEqual([0, 1, 2]); // Default view is unsorted, all rows
    });
  });

  describe('setSort', () => {
    beforeEach(() => {
      core.setData([
        ['Alice', 'Bob', 'Charlie'],
        [150, 100, 200],
      ]);
    });

    it('sorts ascending by numeric column', () => {
      core.setSort(1, 'asc');
      const view = core.getView();
      // Column 1 values: [150, 100, 200]
      // Sorted asc: 100, 150, 200
      // Indices: [1, 0, 2]
      expect(view).toEqual([1, 0, 2]);
    });

    it('sorts descending by numeric column', () => {
      core.setSort(1, 'desc');
      const view = core.getView();
      // Column 1 values: [150, 100, 200]
      // Sorted desc: 200, 150, 100
      // Indices: [2, 0, 1]
      expect(view).toEqual([2, 0, 1]);
    });

    it('sorts ascending by string column', () => {
      core.setSort(0, 'asc');
      const view = core.getView();
      // Column 0 values: ['Alice', 'Bob', 'Charlie']
      // Sorted asc: Alice, Bob, Charlie
      // Indices: [0, 1, 2]
      expect(view).toEqual([0, 1, 2]);
    });

    it('sorts descending by string column', () => {
      core.setSort(0, 'desc');
      const view = core.getView();
      // Column 0 values: ['Alice', 'Bob', 'Charlie']
      // Sorted desc: Charlie, Bob, Alice
      // Indices: [2, 1, 0]
      expect(view).toEqual([2, 1, 0]);
    });

    it('clears sort when direction is null', () => {
      core.setSort(1, 'asc');
      expect(core.getView()).toEqual([1, 0, 2]); // Sorted

      core.setSort(1, null);
      expect(core.getView()).toEqual([0, 1, 2]); // Unsorted
    });

    it('handles null values in sorted column', () => {
      core.setData([
        ['Alice', 'Bob', 'Charlie'],
        [100, null, 200],
      ]);
      core.setSort(1, 'asc');
      const view = core.getView();
      // Nulls should be pushed to end in ascending sort
      // Non-null values: 100 (idx 0), 200 (idx 2)
      // Null value: null (idx 1)
      expect(view[0]).toBe(0); // 100
      expect(view[1]).toBe(2); // 200
      expect(view[2]).toBe(1); // null
    });

    it('invalidates cache when sort changes', () => {
      core.setSort(1, 'asc');
      const view1 = core.getView();

      core.setSort(1, 'desc');
      const view2 = core.getView();

      expect(view1).not.toEqual(view2);
      expect(view1).toEqual([1, 0, 2]);
      expect(view2).toEqual([2, 0, 1]);
    });
  });

  describe('setFilter', () => {
    beforeEach(() => {
      core.setData([
        ['Alice', 'Bob', 'Charlie', 'David'],
        ['apple', 'banana', 'cherry', 'date'],
        [100, 200, 150, 175],
      ]);
    });

    it('filters rows by substring match (case-insensitive)', () => {
      core.setFilter('ali');
      const view = core.getView();
      // 'ali' matches 'Alice' in column 0, row 0
      expect(view).toEqual([0]);
    });

    it('matches across all columns', () => {
      core.setFilter('bob');
      const view = core.getView();
      // 'bob' matches 'Bob' in column 0, row 1
      expect(view).toEqual([1]);
    });

    it('returns all rows when filter is empty', () => {
      core.setFilter('');
      const view = core.getView();
      expect(view).toEqual([0, 1, 2, 3]);
    });

    it('returns empty when no matches', () => {
      core.setFilter('xyz');
      const view = core.getView();
      expect(view).toEqual([]);
    });

    it('handles numeric values in filter', () => {
      core.setFilter('100');
      const view = core.getView();
      // '100' matches the numeric value 100 in column 2, row 0
      expect(view).toEqual([0]);
    });

    it('is case-insensitive', () => {
      core.setFilter('ALICE');
      const view = core.getView();
      expect(view).toEqual([0]);

      core.setFilter('alice');
      expect(core.getView()).toEqual([0]);

      core.setFilter('Alice');
      expect(core.getView()).toEqual([0]);
    });

    it('invalidates cache when filter changes', () => {
      core.setFilter('ali');
      const view1 = core.getView();

      core.setFilter('bob');
      const view2 = core.getView();

      expect(view1).not.toEqual(view2);
      expect(view1).toEqual([0]);
      expect(view2).toEqual([1]);
    });
  });

  describe('combined sort and filter', () => {
    beforeEach(() => {
      core.setData([
        ['Alice', 'Bob', 'Charlie', 'Anna'],
        [150, 100, 200, 120],
      ]);
    });

    it('filters then sorts the filtered results', () => {
      core.setFilter('a'); // Matches Alice (0), Charlie (2), Anna (3)
      core.setSort(1, 'asc'); // Sort by column 1
      const view = core.getView();
      // Filtered indices: [0, 2, 3]
      // Their column 1 values: [150, 200, 120]
      // Sorted asc: 120 (idx 3), 150 (idx 0), 200 (idx 2)
      expect(view).toEqual([3, 0, 2]);
    });

    it('sorts then applies filter to all rows', () => {
      core.setSort(1, 'asc');
      core.setFilter('a');
      const view = core.getView();
      // Filter is applied to ALL rows, not just the sorted view
      // Filtered indices: [0, 2, 3]
      // Then sorted by column 1 asc: [3, 0, 2]
      expect(view).toEqual([3, 0, 2]);
    });

    it('changing filter does not lose sort state', () => {
      core.setSort(1, 'desc');
      core.setFilter('a');
      const view1 = core.getView();

      core.setFilter('b');
      const view2 = core.getView();
      // Both should be sorted desc by column 1
      expect(view1).toEqual([2, 0, 3]); // 'a' matches: sorted desc 200, 150, 120
      expect(view2).toEqual([1]); // 'b' matches only Bob
    });
  });

  describe('getViewRange', () => {
    beforeEach(() => {
      core.setData([
        ['A', 'B', 'C', 'D', 'E', 'F'],
        [1, 2, 3, 4, 5, 6],
      ]);
    });

    it('returns a slice of the view', () => {
      const range = core.getViewRange(1, 3);
      expect(range).toEqual([1, 2, 3]);
    });

    it('handles start at 0', () => {
      const range = core.getViewRange(0, 2);
      expect(range).toEqual([0, 1]);
    });

    it('handles range extending past end', () => {
      const range = core.getViewRange(4, 10);
      expect(range).toEqual([4, 5]);
    });

    it('returns empty for out-of-bounds start', () => {
      const range = core.getViewRange(10, 5);
      expect(range).toEqual([]);
    });

    it('respects sort order in range', () => {
      core.setSort(1, 'desc');
      const range = core.getViewRange(0, 3);
      // Sorted desc by column 1: [5, 4, 3, 2, 1, 0]
      expect(range).toEqual([5, 4, 3]);
    });
  });

  describe('getViewCount', () => {
    beforeEach(() => {
      core.setData([
        ['Alice', 'Bob', 'Charlie', 'David'],
        [100, 200, 150, 175],
      ]);
    });

    it('returns total row count with no filter', () => {
      expect(core.getViewCount()).toBe(4);
    });

    it('returns filtered count when filter is applied', () => {
      core.setFilter('ali');
      expect(core.getViewCount()).toBe(1);
    });

    it('returns 0 when filter matches nothing', () => {
      core.setFilter('xyz');
      expect(core.getViewCount()).toBe(0);
    });

    it('count is independent of sort', () => {
      core.setSort(1, 'desc');
      expect(core.getViewCount()).toBe(4);

      core.setFilter('a');
      expect(core.getViewCount()).toBe(3); // Alice, Charlie, David
    });
  });

  describe('dispose', () => {
    it('cleans up without error', () => {
      core.setData([['A'], [1]]);
      expect(() => core.dispose()).not.toThrow();
    });

    it('can be called multiple times', () => {
      core.dispose();
      expect(() => core.dispose()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles single row', () => {
      core.setData([['Alice'], [100]]);
      expect(core.getRowCount()).toBe(1);
      expect(core.getView()).toEqual([0]);
    });

    it('handles single column', () => {
      core.setData([['Alice', 'Bob', 'Charlie']]);
      expect(core.getColCount()).toBe(1);
      expect(core.getView()).toEqual([0, 1, 2]);
    });

    it('handles columns of different lengths gracefully', () => {
      // This is an invalid input, but should not crash
      core.setData([
        ['Alice', 'Bob'],
        [100, 200, 300], // Extra value
      ]);
      // Should use the first column's length as row count
      expect(core.getRowCount()).toBe(2);
    });
  });
});
