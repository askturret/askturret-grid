/**
 * Integration tests for unified GridColumn model with DataGrid + useGridStore
 *
 * These tests verify that a single GridColumn[] array can be used to wire
 * both DataGrid (presentation) and useGridStore (engine) without divergence
 * or double-authoring.
 */

import { describe, it, expect } from 'vitest';
import { type GridColumn, deriveRowKey, toColumnDef, toColumnSchema } from './columns';

interface TestRow {
  id: string;
  symbol: string;
  price: number;
}

const testData: TestRow[] = [
  { id: '1', symbol: 'AAPL', price: 150.5 },
  { id: '2', symbol: 'GOOGL', price: 2800.25 },
  { id: '3', symbol: 'MSFT', price: 350.75 },
];

// Unified column definition - single source of truth for both grid and store
const unifiedColumns: GridColumn<TestRow>[] = [
  {
    name: 'id',
    header: 'ID',
    type: 'string',
    primaryKey: true,
    width: '80px',
  },
  {
    name: 'symbol',
    header: 'Symbol',
    type: 'string',
    indexed: true, // Enable search on this column
    width: '120px',
  },
  {
    name: 'price',
    header: 'Price',
    type: 'number',
    align: 'right',
    width: '100px',
    formatter: (value) => `$${Number(value).toFixed(2)}`,
  },
];

describe('GridColumn integration with DataGrid + useGridStore', () => {

  it('unified GridColumn array works with both grid and store', () => {
    // Verify that unifiedColumns can be converted to both ColumnDef and ColumnSchema

    // Using imported toColumnDef and toColumnSchema

    // Convert to ColumnDef for DataGrid
    const columnDefs = unifiedColumns.map(toColumnDef);
    expect(columnDefs).toHaveLength(3);
    expect(columnDefs[0].field).toBe('id');
    expect(columnDefs[0].header).toBe('ID');
    expect(columnDefs[2].formatter).toBeDefined();

    // Convert to ColumnSchema for GridStore
    const columnSchemas = unifiedColumns.map(toColumnSchema);
    expect(columnSchemas).toHaveLength(3);
    expect(columnSchemas[0].name).toBe('id');
    expect(columnSchemas[0].type).toBe('string');
    expect(columnSchemas[0].primaryKey).toBe(true);

    // Verify column identity matches (no divergence)
    columnDefs.forEach((def, i) => {
      const schema = columnSchemas[i];
      expect(String(def.field)).toBe(schema.name);
    });
  });

  it('converts unified columns to ColumnSchema correctly', () => {
    // This would be done internally by useGridStore's discriminator
    const schema = unifiedColumns.map(toColumnSchema);

    // Verify schema was created correctly
    expect(schema).toHaveLength(3);
    expect(schema[0].name).toBe('id');
    expect(schema[0].primaryKey).toBe(true);
    expect(schema[1].indexed).toBe(true);
    expect(schema[2].type).toBe('number');
  });

  it('automatically derives rowKey from primaryKey column', () => {
    const rowKey = deriveRowKey(unifiedColumns);

    // Should return 'id' field which has primaryKey: true
    expect(rowKey).toBe('id');
  });

  it('converts unified columns to ColumnDef correctly', () => {
    const columnDefs = unifiedColumns.map(toColumnDef);

    expect(columnDefs).toHaveLength(3);
    expect(columnDefs[0].field).toBe('id');
    expect(columnDefs[0].header).toBe('ID');
    expect(columnDefs[2].formatter).toBeDefined();
    expect(columnDefs[2].align).toBe('right');
  });

  it('throws clear error when GridColumn missing type is used with store', () => {
    const invalidColumns: GridColumn<TestRow>[] = [
      {
        name: 'id',
        header: 'ID',
        // Missing 'type' - should throw when used with store
      },
    ];

    // Expect toColumnSchema to throw when type is missing
    expect(() => toColumnSchema(invalidColumns[0])).toThrow(
      "Column 'id' needs a `type` field when used with a GridStore"
    );
  });

  it('supports nested path in GridColumn for grid-only usage', () => {
    interface NestedRow {
      id: string;
      user: { name: string };
    }

    const nestedColumns: GridColumn<NestedRow>[] = [
      {
        name: 'id',
        header: 'ID',
        type: 'string',
        primaryKey: true,
      },
      {
        name: 'userName',
        path: 'user.name', // Nested path for grid display
        header: 'User Name',
        type: 'string',
      },
    ];

    const columnDefs = nestedColumns.map(toColumnDef);

    // Grid should use the nested path
    expect(columnDefs[1].field).toBe('user.name');
  });

  it('detects no divergence between grid and store column definitions', () => {
    // This test verifies that using a single GridColumn[] array
    // for both grid and store produces consistent column identity

    const gridColumns = unifiedColumns.map(toColumnDef);
    const storeColumns = unifiedColumns.map(toColumnSchema);

    // Verify grid and store agree on column identity
    // Grid uses 'field', store uses 'name', but they should match
    gridColumns.forEach((gridCol, i) => {
      const storeCol = storeColumns[i];
      const unifiedCol = unifiedColumns[i];

      // All three should agree on the column identifier
      expect(String(gridCol.field)).toBe(unifiedCol.name);
      expect(storeCol.name).toBe(unifiedCol.name);
    });
  });
});
