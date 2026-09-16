import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerGridStore } from './WorkerGridStore';
import type { ColumnSchema } from './WasmGridStore';

describe('WorkerGridStore', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockWorker: {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((e: MessageEvent) => void) | null;
    onerror: ((e: ErrorEvent) => void) | null;
  };
  let WorkerConstructor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock URL.createObjectURL/revokeObjectURL
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-worker-url');
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock Worker
    mockWorker = {
      postMessage: vi.fn((msg) => {
        // Simulate worker responses
        setTimeout(() => {
          if (!mockWorker.onmessage) return;

          if (msg.type === 'init') {
            mockWorker.onmessage(
              new MessageEvent('message', {
                data: { type: 'ready', _requestId: msg._requestId },
              }),
            );
          } else if (msg.type === 'loadRows') {
            mockWorker.onmessage(
              new MessageEvent('message', {
                data: { type: 'loaded', rowCount: msg.rows.length, _requestId: msg._requestId },
              }),
            );
          } else if (msg.type === 'getStats') {
            mockWorker.onmessage(
              new MessageEvent('message', {
                data: {
                  type: 'stats',
                  pendingUpdates: 0,
                  processedUpdates: 0,
                  lastBatchTime: 0,
                  _requestId: msg._requestId,
                },
              }),
            );
          }
        }, 0);
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    WorkerConstructor = vi.fn().mockImplementation(() => mockWorker);
    global.Worker = WorkerConstructor as unknown as typeof Worker;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const schema: ColumnSchema[] = [{ name: 'id', primaryKey: true, indexed: true }];

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

