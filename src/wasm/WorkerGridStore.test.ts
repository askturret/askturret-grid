import { describe, it, expect } from 'vitest';
import { WorkerGridStore } from './WorkerGridStore';
import type { ColumnSchema } from './WasmGridStore';

describe('WorkerGridStore', () => {
  it('handles concurrent same-type requests independently', async () => {
    // Arrange: Create a store with a simple schema
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'value', primaryKey: false, indexed: false },
    ];

    const store = await WorkerGridStore.create(schema);

    try {
      // Act: Issue two concurrent loadRows requests with different data
      const firstData = [
        { id: 'row1', value: 'first' },
        { id: 'row2', value: 'first' },
      ];

      const secondData = [
        { id: 'row3', value: 'second' },
        { id: 'row4', value: 'second' },
        { id: 'row5', value: 'second' },
      ];

      // Fire both requests without waiting
      const firstPromise = store.loadRows(firstData);
      const secondPromise = store.loadRows(secondData);

      // Wait for both to complete
      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

      // Assert: Each request resolved with its own correct row count
      // Before the fix, both would resolve with the same value (the second request's result)
      expect(firstResult).toBe(2); // First request loaded 2 rows
      expect(secondResult).toBe(3); // Second request loaded 3 rows

      // Additional verification: The store should have the data from the last loadRows call
      const totalCount = store.getTotalCount();
      expect(totalCount).toBe(3); // Should have the second data set
    } finally {
      // Cleanup
      store.dispose();
    }
  });

  it('handles concurrent getStats requests independently', async () => {
    // Arrange
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
    ];

    const store = await WorkerGridStore.create(schema);

    try {
      // Load initial data to have some state
      await store.loadRows([{ id: 'row1' }, { id: 'row2' }]);

      // Act: Issue multiple concurrent getStats requests
      const stats1Promise = store.getStats();
      const stats2Promise = store.getStats();
      const stats3Promise = store.getStats();

      // Wait for all to complete
      const [stats1, stats2, stats3] = await Promise.all([stats1Promise, stats2Promise, stats3Promise]);

      // Assert: All requests should resolve (not overwrite each other)
      // Each should be a valid stats object
      expect(stats1).toHaveProperty('pendingUpdates');
      expect(stats2).toHaveProperty('pendingUpdates');
      expect(stats3).toHaveProperty('pendingUpdates');
      expect(stats1).toHaveProperty('processedUpdates');
      expect(stats2).toHaveProperty('processedUpdates');
      expect(stats3).toHaveProperty('processedUpdates');
    } finally {
      store.dispose();
    }
  });
});
