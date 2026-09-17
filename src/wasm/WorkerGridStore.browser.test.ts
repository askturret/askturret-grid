import { describe, it, expect } from 'vitest';
import { WorkerGridStore } from './WorkerGridStore';
import type { ColumnSchema } from './WasmGridStore';

/**
 * Browser-specific tests for WorkerGridStore.
 *
 * Unlike the unit tests in WorkerGridStore.test.ts, these tests exercise
 * the REAL Worker API in a real browser environment (Firefox via Playwright).
 *
 * NO MOCKING - this validates that:
 * - The real Worker implementation works correctly
 * - Web Worker communication patterns work across different JS engines (SpiderMonkey vs V8)
 * - Worker lifecycle (create, postMessage, terminate) behaves correctly
 */
describe('WorkerGridStore (Browser - Real Worker API)', () => {
  it('creates store and initializes worker with real Worker API', async () => {
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'value', primaryKey: false, indexed: false },
    ];

    const store = await WorkerGridStore.create(schema);

    try {
      // Verify store is initialized
      expect(store).toBeDefined();
      expect(store.getTotalCount()).toBe(0);
    } finally {
      store.dispose();
    }
  });

  it('handles concurrent same-type requests with real Worker', async () => {
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
      { name: 'value', primaryKey: false, indexed: false },
    ];

    const store = await WorkerGridStore.create(schema);

    try {
      // Issue two concurrent loadRows requests
      const firstData = [
        { id: 'row1', value: 'first' },
        { id: 'row2', value: 'first' },
      ];

      const secondData = [
        { id: 'row3', value: 'second' },
        { id: 'row4', value: 'second' },
        { id: 'row5', value: 'second' },
      ];

      // Fire both requests concurrently (tests real Worker message queueing)
      const firstPromise = store.loadRows(firstData);
      const secondPromise = store.loadRows(secondData);

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

      // Each request should resolve with its own correct row count
      // This validates that _requestId tracking works correctly with real Worker postMessage
      expect(firstResult).toBe(2);
      expect(secondResult).toBe(3);

      // Store should have the data from the last loadRows call
      expect(store.getTotalCount()).toBe(3);
    } finally {
      store.dispose();
    }
  });

  it('handles concurrent getStats requests with real Worker', async () => {
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
    ];

    const store = await WorkerGridStore.create(schema);

    try {
      // Load initial data
      await store.loadRows([{ id: 'row1' }, { id: 'row2' }]);

      // Issue multiple concurrent getStats requests (tests real Worker response handling)
      const stats1Promise = store.getStats();
      const stats2Promise = store.getStats();
      const stats3Promise = store.getStats();

      const [stats1, stats2, stats3] = await Promise.all([
        stats1Promise,
        stats2Promise,
        stats3Promise,
      ]);

      // All requests should resolve with valid stats (validates real Worker message routing)
      expect(stats1).toHaveProperty('pendingUpdates');
      expect(stats2).toHaveProperty('pendingUpdates');
      expect(stats3).toHaveProperty('pendingUpdates');
    } finally {
      store.dispose();
    }
  });

  it('properly terminates real Worker on dispose', async () => {
    const schema: ColumnSchema[] = [
      { name: 'id', primaryKey: true, indexed: true },
    ];

    const store = await WorkerGridStore.create(schema);

    // Load some data to ensure worker is active
    await store.loadRows([{ id: 'test1' }, { id: 'test2' }]);

    // Dispose should terminate the real Worker
    store.dispose();

    // After disposal, operations should fail gracefully
    // (Real Worker is terminated, so postMessage would fail)
    await expect(store.loadRows([{ id: 'test3' }])).rejects.toThrow();
  });
});
