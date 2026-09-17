import { describe, it, expect } from 'vitest';
import {
  toColumnDef,
  toColumnSchema,
  deriveRowKey,
  type GridColumn,
} from './columns';

describe('toColumnDef', () => {
  it('converts GridColumn to ColumnDef with all fields', () => {
    const gridColumn: GridColumn<{ id: string; name: string }> = {
      name: 'id',
      header: 'ID',
      type: 'string',
      primaryKey: true,
      width: '100px',
      align: 'center',
      sortable: true,
      resizable: true,
      reorderable: true,
      minWidth: 50,
      maxWidth: 200,
    };

    const columnDef = toColumnDef(gridColumn);

    expect(columnDef).toEqual({
      field: 'id',
      header: 'ID',
      width: '100px',
      align: 'center',
      sortable: true,
      resizable: true,
      reorderable: true,
      minWidth: 50,
      maxWidth: 200,
      formatter: undefined,
      cellClass: undefined,
      flashOnChange: undefined,
    });
  });

  it('uses path instead of name for field when path is provided', () => {
    const gridColumn: GridColumn<{ user: { name: string } }> = {
      name: 'userName',
      path: 'user.name',
      header: 'User Name',
      type: 'string',
    };

    const columnDef = toColumnDef(gridColumn);

    expect(columnDef.field).toBe('user.name');
  });

  it('defaults to name when path is not provided', () => {
    const gridColumn: GridColumn<{ id: string }> = {
      name: 'id',
      header: 'ID',
    };

    const columnDef = toColumnDef(gridColumn);

    expect(columnDef.field).toBe('id');
  });

  it('preserves formatter and cellClass functions', () => {
    const formatter = (value: unknown) => String(value);
    const cellClass = (value: unknown) => 'test-class';

    const gridColumn: GridColumn<{ id: string }> = {
      name: 'id',
      header: 'ID',
      formatter,
      cellClass,
    };

    const columnDef = toColumnDef(gridColumn);

    expect(columnDef.formatter).toBe(formatter);
    expect(columnDef.cellClass).toBe(cellClass);
  });
});

describe('toColumnSchema', () => {
  it('converts GridColumn to ColumnSchema with all fields', () => {
    const gridColumn: GridColumn<{ id: string }> = {
      name: 'id',
      header: 'ID',
      type: 'string',
      primaryKey: true,
      indexed: true,
    };

    const columnSchema = toColumnSchema(gridColumn);

    expect(columnSchema).toEqual({
      name: 'id',
      type: 'string',
      primaryKey: true,
      indexed: true,
    });
  });

  it('omits presentation fields', () => {
    const gridColumn: GridColumn<{ price: number }> = {
      name: 'price',
      header: 'Price',
      type: 'number',
      width: '100px',
      align: 'right',
      sortable: true,
      formatter: (v) => `$${v}`,
    };

    const columnSchema = toColumnSchema(gridColumn);

    expect(columnSchema).toEqual({
      name: 'price',
      type: 'number',
      primaryKey: undefined,
      indexed: undefined,
    });
    // Verify presentation fields are not present
    expect('width' in columnSchema).toBe(false);
    expect('align' in columnSchema).toBe(false);
    expect('sortable' in columnSchema).toBe(false);
    expect('formatter' in columnSchema).toBe(false);
  });

  // R2: type at the boundary - fail loudly if missing
  it('throws when type is missing', () => {
    const gridColumn: GridColumn<{ id: string }> = {
      name: 'id',
      header: 'ID',
      // type is missing
    };

    expect(() => toColumnSchema(gridColumn)).toThrow(
      "Column 'id' needs a `type` field when used with a GridStore"
    );
  });

  // R3: Nested path + store - throw with specific remediation
  it('throws when path is nested', () => {
    const gridColumn: GridColumn<{ user: { name: string } }> = {
      name: 'userName',
      path: 'user.name',
      header: 'User Name',
      type: 'string',
    };

    expect(() => toColumnSchema(gridColumn)).toThrow(
      "Column 'userName' uses a nested path ('user.name'), which is not supported by GridStore"
    );
  });

  it('allows path when it equals name (not nested)', () => {
    const gridColumn: GridColumn<{ id: string }> = {
      name: 'id',
      path: 'id',
      header: 'ID',
      type: 'string',
    };

    const columnSchema = toColumnSchema(gridColumn);

    expect(columnSchema.name).toBe('id');
  });
});

describe('deriveRowKey', () => {
  it('returns the primary key field name', () => {
    const columns: GridColumn<{ id: string; name: string }>[] = [
      {
        name: 'id',
        header: 'ID',
        type: 'string',
        primaryKey: true,
      },
      {
        name: 'name',
        header: 'Name',
        type: 'string',
      },
    ];

    const rowKey = deriveRowKey(columns);

    expect(rowKey).toBe('id');
  });

  it('uses path when provided instead of name', () => {
    const columns: GridColumn<{ user: { id: string } }>[] = [
      {
        name: 'userId',
        path: 'user.id',
        header: 'User ID',
        type: 'string',
        primaryKey: true,
      },
    ];

    const rowKey = deriveRowKey(columns);

    expect(rowKey).toBe('user.id');
  });

  it('returns the first column marked as primaryKey when multiple exist', () => {
    const columns: GridColumn<{ id: string; alt: string }>[] = [
      {
        name: 'id',
        header: 'ID',
        type: 'string',
        primaryKey: true,
      },
      {
        name: 'alt',
        header: 'Alt ID',
        type: 'string',
        primaryKey: true,
      },
    ];

    const rowKey = deriveRowKey(columns);

    expect(rowKey).toBe('id');
  });

  // R4: deriveRowKey fallback - must throw if no primaryKey, not silently pick first
  it('throws when no column has primaryKey: true', () => {
    const columns: GridColumn<{ id: string; name: string }>[] = [
      {
        name: 'id',
        header: 'ID',
        type: 'string',
      },
      {
        name: 'name',
        header: 'Name',
        type: 'string',
      },
    ];

    expect(() => deriveRowKey(columns)).toThrow(
      'No column has `primaryKey: true`'
    );
  });

  it('throws when columns array is empty', () => {
    const columns: GridColumn<any>[] = [];

    expect(() => deriveRowKey(columns)).toThrow(
      'No column has `primaryKey: true`'
    );
  });
});
