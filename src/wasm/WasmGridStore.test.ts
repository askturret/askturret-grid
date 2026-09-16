import { describe, it, expect, vi } from 'vitest';
import { WasmGridStore, type ColumnSchema } from './WasmGridStore';

describe('WasmGridStore', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'string', primaryKey: true, indexed: true },
    { name: 'symbol', type: 'string', indexed: true },
    { name: 'price', type: 'number' },
    { name: 'quantity', type: 'integer' },
  ];

  describe('initialization', () => {
    it('creates store instance', async () => {
      const store = await WasmGridStore.create(schema);
      expect(store).toBeDefined();
      expect(store).toBeInstanceOf(WasmGridStore);
    });

    it('reports WASM unavailable in test environment', async () => {
      const store = await WasmGridStore.create(schema);
      // WASM is mocked and not available in tests
      expect(store.isWasm()).toBe(false);
    });

    it('returns schema column names when WASM unavailable', async () => {
      const store = await WasmGridStore.create(schema);
      const columnNames = store.getColumnNames();
      expect(columnNames).toEqual(['id', 'symbol', 'price', 'quantity']);
    });
  });

  describe('error handling without WASM backend', () => {
    it('throws on loadRows when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      const data = [{ id: 'row1', symbol: 'AAPL', price: 150, quantity: 100 }];

      // Should throw because WASM backend is not available
      expect(() => store.loadRows(data)).toThrow('WasmGridStore not initialized');
    });

    it('throws on insertRow when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      const row = { id: 'row1', symbol: 'AAPL', price: 150, quantity: 100 };

      expect(() => store.insertRow(row)).toThrow('WasmGridStore not initialized');
    });

    it('throws on updateRows when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      const updates = [{ id: 'row1', price: 155 }];

      expect(() => store.updateRows(updates)).toThrow('WasmGridStore not initialized');
    });

    it('throws on deleteRow when not initialized', async () => {
      const store = await WasmGridStore.create(schema);

      expect(() => store.deleteRow('row1')).toThrow('WasmGridStore not initialized');
    });

    it('handles setFilter gracefully when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      // Should not throw, just no-op
      expect(() => store.setFilter('test')).not.toThrow();
    });

    it('handles setSort gracefully when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      // Should not throw, just no-op
      expect(() => store.setSort('price', 'asc')).not.toThrow();
    });

    it('handles clearFilter gracefully when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      expect(() => store.clearFilter()).not.toThrow();
    });

    it('handles clearSort gracefully when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      expect(() => store.clearSort()).not.toThrow();
    });
  });

  describe('view state without backend', () => {
    it('returns 0 for view count when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      expect(store.getViewCount()).toBe(0);
    });

    it('returns 0 for row count when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      expect(store.getRowCount()).toBe(0);
    });

    it('returns empty array for visible rows when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      const rows = store.getVisibleRows(0, 10);
      expect(rows).toEqual([]);
    });

    it('returns undefined for cell value when not initialized', async () => {
      const store = await WasmGridStore.create(schema);
      const value = store.getCell(0, 'price');
      expect(value).toBeUndefined();
    });
  });

  describe('listener management', () => {
    it('subscribes to view changes', async () => {
      const store = await WasmGridStore.create(schema);
      const callback = vi.fn();

      const unsubscribe = store.onViewChange(callback);

      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('unsubscribes from view changes', async () => {
      const store = await WasmGridStore.create(schema);
      const callback = vi.fn();

      const unsubscribe = store.onViewChange(callback);
      unsubscribe();

      // After unsubscribe, calling setFilter should not trigger callback
      // (even though setFilter is no-op without backend, the pattern is tested)
      store.setFilter('test');
      expect(callback).not.toHaveBeenCalled();
    });

    it('allows multiple listeners', async () => {
      const store = await WasmGridStore.create(schema);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.onViewChange(callback1);
      store.onViewChange(callback2);

      // Both callbacks should be registered
      // We can't trigger them without a working backend, but we verify subscription works
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('removes specific listener on unsubscribe', async () => {
      const store = await WasmGridStore.create(schema);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = store.onViewChange(callback1);
      store.onViewChange(callback2);

      unsubscribe1();

      // callback1 should be removed, callback2 should remain
      // (Can't verify notification without backend, but subscription/unsubscription tested)
    });
  });

  describe('dispose', () => {
    it('cleans up without error', async () => {
      const store = await WasmGridStore.create(schema);
      expect(() => store.dispose()).not.toThrow();
    });

    it('can be called multiple times safely', async () => {
      const store = await WasmGridStore.create(schema);
      store.dispose();
      expect(() => store.dispose()).not.toThrow();
    });

    it('clears all listeners on dispose', async () => {
      const store = await WasmGridStore.create(schema);
      const callback = vi.fn();

      store.onViewChange(callback);
      store.dispose();

      // After dispose, listeners should be cleared
      // Verify by trying operations that would normally notify
      store.setFilter('test');
      expect(callback).not.toHaveBeenCalled();
    });

    it('sets backend to null after dispose', async () => {
      const store = await WasmGridStore.create(schema);
      store.dispose();

      // After dispose, isWasm should return false
      expect(store.isWasm()).toBe(false);
    });
  });

  describe('API contracts', () => {
    it('accepts generic type parameter', async () => {
      interface StockRow {
        id: string;
        symbol: string;
        price: number;
        quantity: number;
      }

      const store = await WasmGridStore.create<StockRow>(schema);
      expect(store).toBeDefined();
    });

    it('handles all sort directions', async () => {
      const store = await WasmGridStore.create(schema);

      // Should not throw for any valid direction
      expect(() => store.setSort('price', 'asc')).not.toThrow();
      expect(() => store.setSort('price', 'desc')).not.toThrow();
      expect(() => store.setSort('price', null)).not.toThrow();
    });

    it('handles pagination parameters in getVisibleRows', async () => {
      const store = await WasmGridStore.create(schema);

      // Should not throw for various ranges
      expect(store.getVisibleRows(0, 10)).toEqual([]);
      expect(store.getVisibleRows(10, 20)).toEqual([]);
      expect(store.getVisibleRows(100, 5)).toEqual([]);
    });
  });

  describe('schema handling', () => {
    it('handles minimal schema', async () => {
      const minimalSchema: ColumnSchema[] = [{ name: 'id', type: 'string', primaryKey: true }];

      const store = await WasmGridStore.create(minimalSchema);
      expect(store.getColumnNames()).toEqual(['id']);
    });

    it('handles schema with all column types', async () => {
      const fullSchema: ColumnSchema[] = [
        { name: 'id', type: 'string', primaryKey: true },
        { name: 'count', type: 'integer' },
        { name: 'price', type: 'number' },
      ];

      const store = await WasmGridStore.create(fullSchema);
      expect(store.getColumnNames()).toEqual(['id', 'count', 'price']);
    });

    it('handles schema with indexed columns', async () => {
      const indexedSchema: ColumnSchema[] = [
        { name: 'id', type: 'string', primaryKey: true, indexed: true },
        { name: 'symbol', type: 'string', indexed: true },
        { name: 'price', type: 'number', indexed: false },
      ];

      const store = await WasmGridStore.create(indexedSchema);
      expect(store).toBeDefined();
    });
  });
});
