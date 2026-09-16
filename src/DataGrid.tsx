import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { filterAndSort, isWasmAvailable, type SortDirection as WasmSortDirection } from './wasm';
import { GridCore } from './wasm/GridCore';
import { useAdaptiveFlash } from './hooks/useAdaptiveFlash';
import { useFlashDetection } from './hooks/useFlashDetection';
import { useColumnReorder } from './hooks/useColumnReorder';
import { useColumnResize } from './hooks/useColumnResize';
import { useSortState } from './hooks/useSortState';
import { getNestedValue } from './utils/nested';

/**
 * Column definition for the DataGrid
 */
export interface ColumnDef<T> {
  /** Data field key - supports nested paths like "user.name" */
  field: keyof T | string;
  /** Column header text */
  header: string;
  /** CSS width (e.g., "100px", "20%") */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'right' | 'center';
  /** Enable sorting on this column (default: true) */
  sortable?: boolean;
  /** Custom cell formatter */
  formatter?: (value: unknown, row: T) => string | React.ReactNode;
  /** Dynamic cell CSS class */
  cellClass?: (value: unknown, row: T) => string;
  /**
   * Enable flash highlighting on numeric value changes. Flash highlighting
   * is unconditional by default (fires at every value change). For automatic
   * FPS-adaptive throttling, set `adaptiveFlash` on `DataGrid`, or call
   * `useAdaptiveFlash()` manually and wire it into `disableFlash`.
   */
  flashOnChange?: boolean;
  /** Disable resizing for this column (default: true when grid resizable) */
  resizable?: boolean;
  /** Disable reordering for this column (default: true when grid reorderable) */
  reorderable?: boolean;
  /** Minimum width in pixels for this column */
  minWidth?: number;
  /** Maximum width in pixels for this column */
  maxWidth?: number;
}

/**
 * Props for the DataGrid component
 */
export interface DataGridProps<T> {
  /** Data array to display */
  data: T[];
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Unique row identifier - field name or function */
  rowKey: keyof T | ((row: T) => string);
  /** Message shown when data is empty */
  emptyMessage?: string;
  /** Reduce row height for dense displays */
  compact?: boolean;
  /** Show filter input */
  showFilter?: boolean;
  /** Filter input placeholder text */
  filterPlaceholder?: string;
  /** Fields to include in filter search (default: all columns) */
  filterFields?: (keyof T)[];
  /** Additional CSS class for container */
  className?: string;
  /** Make header sticky (default: true) */
  stickyHeader?: boolean;
  /** Enable virtualization: true, false, or 'auto' (enables at >100 rows) */
  virtualize?: boolean | 'auto';
  /** Row height in pixels for virtualization */
  rowHeight?: number;
  /**
   * Disable flash highlighting. For automatic FPS-adaptive throttling
   * instead of a hard on/off, see `adaptiveFlash`.
   */
  disableFlash?: boolean;
  /**
   * When true, DataGrid runs an internal FPS monitor (via `useAdaptiveFlash`)
   * and automatically suppresses flash highlighting when frame rate drops
   * below ~55fps for 2+ consecutive seconds, then re-enables it when frame
   * rate recovers to >=58fps for 3+ seconds (hysteresis).
   *
   * Default false — the grid does NOT monitor FPS on its own. This preserves
   * predictable, zero-overhead behavior: no rAF loop, no per-second setState,
   * no re-renders you did not ask for.
   *
   * Precedence: an explicit `disableFlash={true}` always wins. `adaptiveFlash`
   * only enables the *automatic backoff* path; it never overrides an explicit
   * consumer opt-out.
   *
   * For finer control (custom FPS thresholds, displaying the current FPS in
   * your own UI, sharing an FPS meter with the rest of your app), do NOT set
   * `adaptiveFlash`. Call `useAdaptiveFlash()` yourself and pass its
   * `disableFlash` result into this component's `disableFlash` prop.
   */
  adaptiveFlash?: boolean;
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /**
   * Use WASM GridCore with trigram indexing for filtering.
   * 'auto' enables for >1000 rows (default), true always, false never.
   */
  useWasmCore?: boolean | 'auto';

  // Column Resizing
  /** Enable column resizing (default: false) */
  resizable?: boolean;
  /** Minimum column width in pixels (default: 50) */
  minColumnWidth?: number;
  /** Maximum column width in pixels (default: 500) */
  maxColumnWidth?: number;
  /** Controlled column widths - Record<field, width in px> */
  columnWidths?: Record<string, number>;
  /** Callback when column is resized */
  onColumnResize?: (field: string, width: number) => void;

  // Column Reordering
  /** Enable column reordering via drag & drop (default: false) */
  reorderable?: boolean;
  /** Controlled column order - array of field names */
  columnOrder?: string[];
  /** Callback when columns are reordered */
  onColumnReorder?: (newOrder: string[]) => void;

  // Row Exit Lifecycle
  /**
   * Dynamic row-level CSS class. Called for every rendered row, including
   * rows currently in an exit transition. `meta.isLeaving` is true when the
   * row is no longer in `data` but is still mounted for `rowExitDuration`
   * to allow an exit animation to play. When `isLeaving` is true, the row
   * data passed in is the last snapshot the grid had for that `rowKey`.
   */
  rowClass?: (row: T, meta: { isLeaving: boolean }) => string;

  /**
   * Milliseconds to keep a removed row mounted so a CSS exit animation
   * can play. Default 0 (rows unmount immediately — current behavior).
   * Applies uniformly to all rows; consumers should keep their CSS
   * transition/animation duration ≤ this value. Requires stable `rowKey`
   * values — unstable keys will cause exit animations to misbehave.
   */
  rowExitDuration?: number;
}

const VIRTUALIZATION_THRESHOLD = 100;
const WASM_CORE_THRESHOLD = 1000;

/**
 * High-performance data grid component with virtualization,
 * sorting, filtering, and flash highlighting.
 */
export function DataGrid<T extends object>({
  data,
  columns,
  rowKey,
  emptyMessage = 'No data',
  compact = false,
  showFilter = false,
  filterPlaceholder = 'Filter...',
  filterFields,
  className = '',
  stickyHeader = true,
  virtualize = 'auto',
  rowHeight: rowHeightProp,
  disableFlash = false,
  adaptiveFlash = false,
  onRowClick,
  useWasmCore = 'auto',
  // Column resizing
  resizable = false,
  minColumnWidth = 50,
  maxColumnWidth = 500,
  columnWidths: controlledWidths,
  onColumnResize,
  // Column reordering
  reorderable = false,
  columnOrder: controlledOrder,
  onColumnReorder,
  // Row exit lifecycle
  rowClass,
  rowExitDuration = 0,
}: DataGridProps<T>) {
  // Sort state
  const { sort, handleSort: handleSortBase } = useSortState();

  const [filter, setFilter] = useState('');
  const [, forceUpdate] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridCoreRef = useRef<GridCore | null>(null);
  const [wasmCoreReady, setWasmCoreReady] = useState(false);

  // Leaving rows state for row-exit lifecycle
  const leavingRowsRef = useRef<Map<string, { row: T; snapshotIndex: number; expiry: number }>>(new Map());
  const [leavingRowsVersion, setLeavingRowsVersion] = useState(0);

  // Adaptive flash monitoring (when enabled)
  const { disableFlash: adaptiveDisable } = useAdaptiveFlash(adaptiveFlash);

  // Column reordering
  const { columnOrder, orderedColumns, dragging, handleDragStart, handleDragOver, handleDrop, handleDragEnd } =
    useColumnReorder({
      columns,
      controlledOrder,
      onColumnReorder,
    });

  // Column resizing
  const { columnWidths, resizing, getColumnWidth, handleResizeStart } = useColumnResize({
    columns,
    controlledWidths,
    onColumnResize,
    minColumnWidth,
    maxColumnWidth,
    resizable,
    parentRef,
    headerRef,
  });


  const rowHeight = rowHeightProp ?? (compact ? 28 : 36);

  const shouldVirtualize = useMemo(() => {
    if (virtualize === true) return true;
    if (virtualize === false) return false;
    return data.length > VIRTUALIZATION_THRESHOLD;
  }, [virtualize, data.length]);

  // Flash enabled when not explicitly disabled AND not adaptively disabled
  const enableFlash = !disableFlash && !adaptiveDisable;

  // Determine if we should use WASM GridCore
  const shouldUseWasmCore = useMemo(() => {
    if (useWasmCore === true) return true;
    if (useWasmCore === false) return false;
    return data.length > WASM_CORE_THRESHOLD;
  }, [useWasmCore, data.length]);

  // Initialize GridCore when needed
  useEffect(() => {
    if (!shouldUseWasmCore) {
      if (gridCoreRef.current) {
        gridCoreRef.current.dispose();
        gridCoreRef.current = null;
        setWasmCoreReady(false);
      }
      return;
    }

    let mounted = true;

    async function init() {
      if (gridCoreRef.current) return;

      const core = new GridCore();
      const success = await core.init();
      if (mounted && success) {
        gridCoreRef.current = core;
        setWasmCoreReady(true);
        console.log('[DataGrid] WASM GridCore initialized successfully');
      } else if (mounted) {
        console.warn('[DataGrid] WASM GridCore failed to initialize, using JS fallback');
      }
    }

    init();

    return () => {
      mounted = false;
      if (gridCoreRef.current) {
        gridCoreRef.current.dispose();
        gridCoreRef.current = null;
      }
    };
  }, [shouldUseWasmCore]);

  // Track previous row count to detect structural changes
  const prevRowCountRef = useRef<number>(0);

  // Track previous sortedData for row-exit diff
  const prevSortedDataRef = useRef<T[]>([]);

  // Sync data to GridCore when structure changes (not on every value update)
  useEffect(() => {
    if (!wasmCoreReady || !gridCoreRef.current) return;

    // Only rebuild index when row count changes (structural change)
    // This avoids rebuilding trigram index on every price tick
    if (data.length === prevRowCountRef.current) {
      return;
    }
    prevRowCountRef.current = data.length;

    // Convert row-major data to column-major for GridCore
    // Always send ALL columns so sorting works on any column
    const allFields = columns.map((c) => String(c.field));
    const columnData: unknown[][] = allFields.map((field) => data.map((row) => getNestedValue(row, field)));

    gridCoreRef.current.setData(columnData);
  }, [data, columns, filterFields, wasmCoreReady]);

  const getRowKey = useCallback(
    (row: T): string => {
      if (typeof rowKey === 'function') {
        return rowKey(row);
      }
      return String(row[rowKey]);
    },
    [rowKey]
  );

  // Compute WASM indices in useMemo so they're available during render (not after)
  const wasmIndices = useMemo(() => {
    if (!wasmCoreReady || !gridCoreRef.current) {
      return null;
    }

    // Set filter
    gridCoreRef.current.setFilter(filter);

    // Set sort - find column index in ALL columns (matches setData order)
    if (sort.field && sort.direction) {
      const allFields = columns.map((c) => String(c.field));
      const sortColIndex = allFields.findIndex((f) => f === sort.field);
      if (sortColIndex >= 0) {
        gridCoreRef.current.setSort(sortColIndex, sort.direction);
      } else {
        gridCoreRef.current.setSort(-1, null);
      }
    } else {
      gridCoreRef.current.setSort(-1, null);
    }

    return gridCoreRef.current.getView();
  }, [filter, sort, columns, wasmCoreReady, data.length]);

  // sortedData for non-virtualized mode (still needed for table rendering)
  // For virtualized mode, we use getRowAtIndex directly
  const sortedData = useMemo(() => {
    // For WASM mode with virtualization, return empty - we'll use getRowAtIndex
    if (wasmCoreReady && wasmIndices && shouldVirtualize) {
      // Return a sparse proxy array that uses cached indices
      // This avoids creating 10k item array on every render
      return [] as T[];
    }

    const fieldsToSearch = filterFields || columns.map((c) => c.field as keyof T);
    const hasFilter = filter.trim().length > 0;
    const hasSort = sort.field && sort.direction;

    // Use WASM indices if available (non-virtualized mode)
    if (wasmCoreReady && wasmIndices) {
      return wasmIndices.map((i) => data[i]);
    }

    // Fallback: Try old WASM filterAndSort for medium datasets
    if (isWasmAvailable() && data.length > 1000 && (hasFilter || hasSort)) {
      const filterColumns = fieldsToSearch.map((field) =>
        data.map((row) => getNestedValue(row, String(field)))
      );
      const sortValues = sort.field
        ? data.map((row) => getNestedValue(row, sort.field!))
        : data.map((_, i) => i);
      const direction: WasmSortDirection = sort.direction === 'desc' ? 'desc' : 'asc';
      const indices = filterAndSort(sortValues, filterColumns, filter, direction);
      return indices.map((i) => data[i]);
    }

    // JavaScript fallback
    let result = data;

    if (hasFilter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((row) =>
        fieldsToSearch.some((field) => {
          const value = getNestedValue(row, String(field));
          if (value == null) return false;
          return String(value).toLowerCase().includes(lowerFilter);
        })
      );
    }

    if (hasSort) {
      result = [...result].sort((a, b) => {
        const aVal = getNestedValue(a, sort.field!);
        const bVal = getNestedValue(b, sort.field!);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sort.direction === 'asc' ? 1 : -1;
        if (bVal == null) return sort.direction === 'asc' ? -1 : 1;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, filter, filterFields, columns, sort, wasmCoreReady, wasmIndices, shouldVirtualize]);

  // Build merged view: sortedData + leaving rows at their snapshot positions
  const mergedData = useMemo(() => {
    if (rowExitDuration === 0 || leavingRowsRef.current.size === 0) {
      // Zero-cost passthrough: wrap in {row, isLeaving: false} for consistency
      return sortedData.map((row) => ({ row, isLeaving: false }));
    }

    // Start with sortedData
    const result: Array<{ row: T; isLeaving: boolean }> = sortedData.map((row) => ({
      row,
      isLeaving: false,
    }));

    // Splice leaving rows back in at their snapshot positions
    const leavingEntries = Array.from(leavingRowsRef.current.values()).sort(
      (a, b) => a.snapshotIndex - b.snapshotIndex
    );

    leavingEntries.forEach((entry) => {
      // Clamp index to [0, result.length] to handle edge cases
      const index = Math.max(0, Math.min(entry.snapshotIndex, result.length));
      result.splice(index, 0, { row: entry.row, isLeaving: true });
    });

    return result;
  }, [sortedData, rowExitDuration, leavingRowsVersion]);

  // Flash detection (lazy, per visible row during render)
  const { updateFlashForRow, getCellFlashClass } = useFlashDetection({
    enableFlash,
    columns,
  });

  // Periodic cleanup of expired leaving rows
  useEffect(() => {
    if (rowExitDuration === 0) return;

    const cleanup = setInterval(() => {
      const now = Date.now();
      let cleaned = false;

      leavingRowsRef.current.forEach((entry, key) => {
        if (entry.expiry <= now) {
          leavingRowsRef.current.delete(key);
          cleaned = true;
        }
      });

      if (cleaned) {
        forceUpdate((n) => n + 1);
        setLeavingRowsVersion((v) => v + 1);
      }
    }, 1000); // LEAVING_ROWS_CLEANUP_INTERVAL

    return () => clearInterval(cleanup);
  }, [rowExitDuration]);

  // Clear leaving rows on filter or columnOrder change (context change)
  useEffect(() => {
    if (rowExitDuration > 0 && leavingRowsRef.current.size > 0) {
      leavingRowsRef.current.clear();
      setLeavingRowsVersion((v) => v + 1);
    }
  }, [filter, columnOrder, rowExitDuration]);

  // Row-exit diff: detect removed rows and populate leavingRowsRef
  useEffect(() => {
    // Skip if rowExitDuration is 0 (zero-cost when disabled)
    if (rowExitDuration === 0) {
      prevSortedDataRef.current = sortedData;
      return;
    }

    const prevData = prevSortedDataRef.current;
    const currentData = sortedData;
    prevSortedDataRef.current = currentData;

    // Build sets of current row keys for fast lookup
    const currentKeys = new Set(currentData.map((row) => getRowKey(row)));
    const now = Date.now();
    let changed = false;

    // Detect removed rows (in prev but not in current)
    prevData.forEach((row, index) => {
      const key = getRowKey(row);
      if (!currentKeys.has(key)) {
        // Row was removed - add to leaving state
        if (!leavingRowsRef.current.has(key)) {
          leavingRowsRef.current.set(key, {
            row,
            snapshotIndex: index,
            expiry: now + rowExitDuration,
          });
          changed = true;
        }
      }
    });

    // Cancel leaving state for rows that reappeared
    leavingRowsRef.current.forEach((entry, key) => {
      if (currentKeys.has(key)) {
        leavingRowsRef.current.delete(key);
        changed = true;
      }
    });

    // Cap leavingRowsRef at 1000 entries (memory safety)
    if (leavingRowsRef.current.size > 1000) {
      const entries = Array.from(leavingRowsRef.current.entries());
      const toDelete = entries.slice(0, entries.length - 1000);
      toDelete.forEach(([key]) => {
        leavingRowsRef.current.delete(key);
      });
      changed = true;
    }

    if (changed) {
      setLeavingRowsVersion((v) => v + 1);
    }
  }, [sortedData, rowExitDuration, getRowKey]);

  // Get row at index - uses WASM indices or direct data access
  const getRowAtIndex = useCallback(
    (index: number): T | undefined => {
      if (wasmCoreReady && wasmIndices) {
        const dataIndex = wasmIndices[index];
        return dataIndex !== undefined ? data[dataIndex] : undefined;
      }
      return data[index];
    },
    [data, wasmCoreReady, wasmIndices]
  );

  // Get total visible count
  const visibleCount = useMemo(() => {
    if (wasmCoreReady && wasmIndices) {
      return wasmIndices.length;
    }

    const fieldsToSearch = filterFields || columns.map((c) => c.field as keyof T);
    const hasFilter = filter.trim().length > 0;

    if (!hasFilter) {
      return data.length;
    }

    // For JS fallback with filter, we need to count
    const lowerFilter = filter.toLowerCase();
    return data.filter((row) =>
      fieldsToSearch.some((field) => {
        const value = getNestedValue(row, String(field));
        if (value == null) return false;
        return String(value).toLowerCase().includes(lowerFilter);
      })
    ).length;
  }, [data, filter, filterFields, columns, wasmCoreReady, wasmIndices]);

  // R2: Parent orchestrates clearing leaving rows on sort change
  const handleSort = (field: string) => {
    handleSortBase(field);
    // Clear leaving rows on sort change
    if (rowExitDuration > 0 && leavingRowsRef.current.size > 0) {
      leavingRowsRef.current.clear();
      setLeavingRowsVersion((v) => v + 1);
    }
  };

  // Virtualizer - use mergedData.length to include leaving rows
  const virtualizer = useVirtualizer({
    count: shouldVirtualize && wasmCoreReady ? visibleCount + leavingRowsRef.current.size : mergedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  // Render a single row for standard mode
  const renderTableRow = useCallback(
    (row: T, isLeaving: boolean) => {
      const key = getRowKey(row);
      // Lazy flash detection - only for visible rows, skip for leaving rows
      if (!isLeaving) {
        updateFlashForRow(row, key);
      }
      const rowClassValue = rowClass ? rowClass(row, { isLeaving }) : '';
      return (
        <tr
          key={key}
          className={`${onRowClick ? 'clickable' : ''} ${rowClassValue}`.trim()}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {orderedColumns.map((col) => {
            const field = String(col.field);
            const value = getNestedValue(row, field);
            const flashClass = col.flashOnChange ? getCellFlashClass(key, field) : '';
            const customClass = col.cellClass ? col.cellClass(value, row) : '';
            const alignClass =
              col.align === 'right' ? 'align-right' : col.align === 'center' ? 'align-center' : '';

            return (
              <td key={field} className={`${alignClass} ${flashClass} ${customClass}`.trim()}>
                {col.formatter ? col.formatter(value, row) : String(value ?? '')}
              </td>
            );
          })}
        </tr>
      );
    },
    [orderedColumns, getRowKey, getCellFlashClass, onRowClick, updateFlashForRow, rowClass]
  );

  // Render a virtualized row
  const renderVirtualRow = useCallback(
    (row: T, isLeaving: boolean, style: React.CSSProperties) => {
      const key = getRowKey(row);
      // Lazy flash detection - only for visible rows, skip for leaving rows
      if (!isLeaving) {
        updateFlashForRow(row, key);
      }
      const rowClassValue = rowClass ? rowClass(row, { isLeaving }) : '';
      return (
        <div
          key={key}
          className={`askturret-grid-virtual-row ${onRowClick ? 'clickable' : ''} ${rowClassValue}`.trim()}
          style={style}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {orderedColumns.map((col) => {
            const field = String(col.field);
            const value = getNestedValue(row, field);
            const flashClass = col.flashOnChange ? getCellFlashClass(key, field) : '';
            const customClass = col.cellClass ? col.cellClass(value, row) : '';
            const alignClass =
              col.align === 'right' ? 'align-right' : col.align === 'center' ? 'align-center' : '';
            const width = resizable ? getColumnWidth(col) : undefined;

            return (
              <div
                key={field}
                className={`askturret-grid-virtual-cell ${alignClass} ${flashClass} ${customClass} ${resizable ? 'fixed-width' : ''}`.trim()}
                style={resizable ? { width, minWidth: width, maxWidth: width } : { minWidth: col.width }}
              >
                {col.formatter ? col.formatter(value, row) : String(value ?? '')}
              </div>
            );
          })}
        </div>
      );
    },
    [
      orderedColumns,
      getRowKey,
      getCellFlashClass,
      onRowClick,
      updateFlashForRow,
      resizable,
      getColumnWidth,
      rowClass,
    ]
  );

  // Render virtualized header
  const renderVirtualHeader = () => (
    <div className="askturret-grid-virtual-header" onDrop={handleDrop}>
      {orderedColumns.map((col, index) => {
        const field = String(col.field);
        const isSortable = col.sortable !== false;
        const alignClass =
          col.align === 'right' ? 'align-right' : col.align === 'center' ? 'align-center' : '';
        const width = resizable ? getColumnWidth(col) : undefined;
        const style: React.CSSProperties = resizable
          ? { width, minWidth: width, maxWidth: width }
          : { minWidth: col.width };

        const isColumnResizable = resizable && col.resizable !== false;
        const isColumnReorderable = reorderable && col.reorderable !== false;
        const isDragging = dragging?.field === field;
        const isDragOver = dragging?.targetIndex === index && dragging?.field !== field;

        const dragProps = isColumnReorderable
          ? {
              draggable: true,
              onDragStart: (e: React.DragEvent) => handleDragStart(field, e),
              onDragOver: (e: React.DragEvent) => handleDragOver(field, index, e),
              onDragEnd: handleDragEnd,
            }
          : {};

        const headerClasses = [
          'askturret-grid-virtual-header-cell',
          isSortable ? 'sortable' : '',
          alignClass,
          resizable ? 'fixed-width' : '',
          isDragging ? 'dragging' : '',
          isDragOver ? 'drag-over' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const isResizingThis = resizing?.field === field;
        const resizeHandleClasses = [
          'askturret-grid-resize-handle',
          isResizingThis && resizing?.atLimit === 'min' ? 'at-min' : '',
          isResizingThis && resizing?.atLimit === 'max' ? 'at-max' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const headerContent = (
          <>
            <span className="askturret-grid-header-text">{col.header}</span>
            {sort.field === field && (
              <span className="sort-indicator">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>
            )}
            {isColumnResizable && (
              <div className={resizeHandleClasses} onMouseDown={(e) => handleResizeStart(field, e)} />
            )}
          </>
        );

        return isSortable ? (
          <button
            key={field}
            type="button"
            className={headerClasses}
            style={style}
            onClick={() => handleSort(field)}
            {...dragProps}
          >
            {headerContent}
          </button>
        ) : (
          <div key={field} className={headerClasses} style={style} {...dragProps}>
            {headerContent}
          </div>
        );
      })}
    </div>
  );

  // Render table header
  const renderTableHeader = () => (
    <tr onDrop={handleDrop}>
      {orderedColumns.map((col, index) => {
        const field = String(col.field);
        const isSortable = col.sortable !== false;
        const alignClass =
          col.align === 'right' ? 'align-right' : col.align === 'center' ? 'align-center' : '';
        const width = resizable ? getColumnWidth(col) : undefined;

        const isColumnResizable = resizable && col.resizable !== false;
        const isColumnReorderable = reorderable && col.reorderable !== false;
        const isDragging = dragging?.field === field;
        const isDragOver = dragging?.targetIndex === index && dragging?.field !== field;

        const headerClasses = [
          isSortable ? 'sortable' : '',
          alignClass,
          isDragging ? 'dragging' : '',
          isDragOver ? 'drag-over' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const dragProps = isColumnReorderable
          ? {
              draggable: true,
              onDragStart: (e: React.DragEvent<HTMLTableCellElement>) => handleDragStart(field, e),
              onDragOver: (e: React.DragEvent<HTMLTableCellElement>) => handleDragOver(field, index, e),
              onDragEnd: handleDragEnd,
            }
          : {};

        const isResizingThis = resizing?.field === field;
        const resizeHandleClasses = [
          'askturret-grid-resize-handle',
          isResizingThis && resizing?.atLimit === 'min' ? 'at-min' : '',
          isResizingThis && resizing?.atLimit === 'max' ? 'at-max' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <th
            key={field}
            className={headerClasses}
            style={resizable ? { width } : { width: col.width }}
            onClick={() => isSortable && handleSort(field)}
            {...dragProps}
          >
            <span className="askturret-grid-header-text">{col.header}</span>
            {isSortable && sort.field === field && (
              <span className="sort-indicator">{sort.direction === 'asc' ? '▲' : '▼'}</span>
            )}
            {isColumnResizable && (
              <div className={resizeHandleClasses} onMouseDown={(e) => handleResizeStart(field, e)} />
            )}
          </th>
        );
      })}
    </tr>
  );

  const containerClass = `askturret-grid ${compact ? 'compact' : ''} ${className}`.trim();
  const containerStyle =
    rowExitDuration > 0
      ? ({ '--grid-row-exit-duration': `${rowExitDuration}ms` } as React.CSSProperties)
      : undefined;

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Filter input */}
      {showFilter && (
        <div className="askturret-grid-filter">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={filterPlaceholder}
          />
        </div>
      )}

      {/* Table - Virtualized or Standard */}
      {shouldVirtualize ? (
        <div className={`askturret-grid-virtual ${resizable ? 'fixed-width-mode' : ''}`}>
          <div ref={headerRef} className="sticky" style={resizable ? { overflow: 'hidden' } : undefined}>
            {renderVirtualHeader()}
          </div>
          <div ref={parentRef} className="askturret-grid-virtual-body">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = mergedData[virtualRow.index];
                if (!item) return null;
                return renderVirtualRow(item.row, item.isLeaving, {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                });
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className={`askturret-grid-body ${resizable ? 'fixed-width-mode' : ''}`}>
          <table>
            {resizable && (
              <colgroup>
                {orderedColumns.map((col) => (
                  <col key={String(col.field)} style={{ width: getColumnWidth(col) }} />
                ))}
              </colgroup>
            )}
            <thead className={stickyHeader ? 'sticky' : ''}>{renderTableHeader()}</thead>
            <tbody>
              {mergedData.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length} className="askturret-grid-empty">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                mergedData.map((item) => renderTableRow(item.row, item.isLeaving))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
