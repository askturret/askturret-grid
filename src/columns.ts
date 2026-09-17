/**
 * Unified column model for DataGrid and GridStore
 *
 * This module provides a single authoring surface for defining columns that
 * can be consumed by both the DataGrid (presentation) and GridStore (engine).
 *
 * Key design points:
 * - `name` is the canonical identifier used by the engine
 * - `path` (optional) supports nested lookups like "user.name" for the grid
 * - `type` is optional at the type level but required at runtime when used with a store
 * - `primaryKey` enables automatic rowKey derivation
 * - `sortable` (UI) and `indexed` (engine) are distinct concerns
 */

import type { ColumnDef } from './DataGrid';
import type { ColumnSchema } from './wasm/WasmGridStore';

/**
 * Unified column definition - single authoring surface for grid and store
 */
export interface GridColumn<T> {
  // ========== Identity (used by both engine and grid) ==========
  /** Canonical flat identifier - used by engine and as fallback for grid lookups */
  name: string;

  /**
   * Optional nested path for grid-side lookups (e.g., "user.name").
   * Defaults to `name` if not provided.
   * IMPORTANT: Nested paths are NOT supported when using this column with a store.
   * If you need a nested path with a store, flatten the field at load time.
   */
  path?: keyof T | string;

  /** Mark this column as the primary key for row identity */
  primaryKey?: boolean;

  /**
   * Data type - required when this column is used with a GridStore.
   * Optional for grid-only usage.
   */
  type?: 'string' | 'number' | 'integer';

  /** Include this column in the engine's trigram text search index */
  indexed?: boolean;

  // ========== Presentation (ignored by engine) ==========
  /** Column header text */
  header: string;

  /** CSS width (e.g., "100px", "20%") */
  width?: string;

  /** Text alignment */
  align?: 'left' | 'right' | 'center';

  /**
   * Enable sorting UI on this column (default: true).
   * NOTE: This controls whether the header is clickable for sorting.
   * This is distinct from `indexed`, which controls engine-level text search.
   */
  sortable?: boolean;

  /** Custom cell formatter */
  formatter?: (value: unknown, row: T) => string | React.ReactNode;

  /** Dynamic cell CSS class */
  cellClass?: (value: unknown, row: T) => string;

  /** Enable flash highlighting on numeric value changes */
  flashOnChange?: boolean;

  /** Enable resizing for this column */
  resizable?: boolean;

  /** Enable reordering for this column */
  reorderable?: boolean;

  /** Minimum width in pixels */
  minWidth?: number;

  /** Maximum width in pixels */
  maxWidth?: number;
}

/**
 * Convert a GridColumn to ColumnDef for DataGrid consumption
 */
export function toColumnDef<T>(column: GridColumn<T>): ColumnDef<T> {
  return {
    field: (column.path ?? column.name) as keyof T | string,
    header: column.header,
    width: column.width,
    align: column.align,
    sortable: column.sortable,
    formatter: column.formatter,
    cellClass: column.cellClass,
    flashOnChange: column.flashOnChange,
    resizable: column.resizable,
    reorderable: column.reorderable,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
  };
}

/**
 * Convert a GridColumn to ColumnSchema for GridStore consumption
 *
 * @throws {Error} If the column is missing required `type` field
 * @throws {Error} If the column uses a nested `path` (not supported by store)
 */
export function toColumnSchema<T>(column: GridColumn<T>): ColumnSchema {
  // R2: type at the boundary - fail loudly if missing
  if (!column.type) {
    throw new Error(
      `Column '${column.name}' needs a \`type\` field when used with a GridStore. ` +
        `Valid types: 'string' | 'number' | 'integer'`
    );
  }

  // R3: Nested path + store - throw with specific remediation
  if (column.path && column.path !== column.name) {
    throw new Error(
      `Column '${column.name}' uses a nested path ('${String(column.path)}'), ` +
        `which is not supported by GridStore. ` +
        `Either flatten the field to a top-level property in your data, ` +
        `or use ColumnDef directly without the store.`
    );
  }

  return {
    name: column.name,
    type: column.type,
    primaryKey: column.primaryKey,
    indexed: column.indexed,
  };
}

/**
 * Derive a rowKey accessor from a set of GridColumns
 *
 * @returns The field name of the primary key column, or a function that generates row keys
 * @throws {Error} If no column has primaryKey: true (R4)
 */
export function deriveRowKey<T>(columns: GridColumn<T>[]): keyof T | ((row: T) => string) {
  const pkColumn = columns.find((col) => col.primaryKey === true);

  // R4: deriveRowKey fallback - must throw if no primaryKey, not silently pick first
  if (!pkColumn) {
    throw new Error(
      'No column has `primaryKey: true`. ' +
        'At least one column must be marked as the primary key for row identity. ' +
        'Without an explicit primary key, row identity bugs can occur under sort/filter operations.'
    );
  }

  // Use the path if provided (for nested lookups), otherwise use name
  return (pkColumn.path ?? pkColumn.name) as keyof T;
}
