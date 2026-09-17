import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAdaptiveFlash } from './hooks/useAdaptiveFlash';
import { useFlashDetection } from './hooks/useFlashDetection';
import { useColumnReorder } from './hooks/useColumnReorder';
import { useColumnResize } from './hooks/useColumnResize';
import { useSortState } from './hooks/useSortState';
import { useWasmView } from './hooks/useWasmView';
import { useSortedData } from './hooks/useSortedData';
import { useRowExit } from './hooks/useRowExit';
import { getNestedValue } from './utils/nested';
import { type GridColumn, toColumnDef } from './columns';

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
  /** Column definitions - accepts legacy ColumnDef or unified GridColumn */
  columns: ColumnDef<T>[] | GridColumn<T>[];
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

  // Controlled Filter/Sort (for external store integration)
  /**
   * Controlled filter value. When provided, DataGrid does not manage filter
   * state internally and skips its own filter pass (trusts data as pre-filtered).
   */
  filter?: string;
  /**
   * Callback when filter input changes. Required if `filter` is provided and
   * `showFilter` is true.
   */
  onFilterChange?: (filter: string) => void;
  /**
   * Controlled sort state. When provided, DataGrid does not manage sort state
   * internally and skips its own sort pass (trusts data as pre-sorted).
   */
  sort?: { field: string | null; direction: 'asc' | 'desc' | null };
  /**
   * Callback when a sortable header is clicked. Required if `sort` is provided.
   */
  onSortChange?: (sort: { field: string | null; direction: 'asc' | 'desc' | null }) => void;

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
  // Controlled filter/sort
  filter: controlledFilter,
  onFilterChange,
  sort: controlledSort,
  onSortChange,
  // Row exit lifecycle
  rowClass,
  rowExitDuration = 0,
}: DataGridProps<T>) {
  // R1: Runtime shape discrimination - normalize GridColumn[] to ColumnDef[]
  // GridColumn has 'name' (required) and no 'field'; ColumnDef has 'field' (required) and no 'name'
  const normalizedColumns: ColumnDef<T>[] = useMemo(() => {
    if (columns.length === 0) return [];

    const firstCol = columns[0];
    const isGridColumn = 'name' in firstCol && !('field' in firstCol);

    if (isGridColumn) {
      // Convert GridColumn[] to ColumnDef[]
      return (columns as GridColumn<T>[]).map(toColumnDef);
    }

    // Already ColumnDef[], use as-is
    return columns as ColumnDef<T>[];
  }, [columns]);

  // Filter state - controlled or uncontrolled
  const [internalFilter, setInternalFilter] = useState('');
  const filter = controlledFilter ?? internalFilter;
  const handleFilterChange = onFilterChange ?? setInternalFilter;

  // Sort state - controlled or uncontrolled
  const { sort: internalSort, handleSort: handleSortBase } = useSortState();
  const sort = controlledSort ?? internalSort;
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Dev warnings for controlled/uncontrolled mode (R2, R3, R5)
  useEffect(() => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return;

    // R2: Warn when controlled prop is set without callback
    if (controlledFilter !== undefined && !onFilterChange && showFilter) {
      console.warn(
        '[DataGrid] `filter` is controlled but `onFilterChange` is not provided. ' +
          'The filter input will be read-only. Either provide `onFilterChange` or remove `filter`.'
      );
    }

    if (controlledSort !== undefined && !onSortChange) {
      console.warn(
        '[DataGrid] `sort` is controlled but `onSortChange` is not provided. ' +
          'Sort headers will ignore clicks. Either provide `onSortChange` or remove `sort`.'
      );
    }
  }, [controlledFilter, onFilterChange, controlledSort, onSortChange, showFilter]);

  // R3: Warn on transitions between controlled and uncontrolled
  const prevFilterControlled = useRef(controlledFilter !== undefined);
  const prevSortControlled = useRef(controlledSort !== undefined);

  useEffect(() => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return;

    const nowFilterControlled = controlledFilter !== undefined;
    const nowSortControlled = controlledSort !== undefined;

    if (prevFilterControlled.current !== nowFilterControlled) {
      console.warn(
        '[DataGrid] `filter` prop changed from ' +
          (prevFilterControlled.current ? 'controlled to uncontrolled' : 'uncontrolled to controlled') +
          '. This is an anti-pattern and may cause unexpected behavior. ' +
          'Decide whether `filter` should be controlled on mount and keep it consistent.'
      );
    }

    if (prevSortControlled.current !== nowSortControlled) {
      console.warn(
        '[DataGrid] `sort` prop changed from ' +
          (prevSortControlled.current ? 'controlled to uncontrolled' : 'uncontrolled to controlled') +
          '. This is an anti-pattern and may cause unexpected behavior. ' +
          'Decide whether `sort` should be controlled on mount and keep it consistent.'
      );
    }

    prevFilterControlled.current = nowFilterControlled;
    prevSortControlled.current = nowSortControlled;
  }, [controlledFilter, controlledSort]);

  // Adaptive flash monitoring (when enabled)
  const { disableFlash: adaptiveDisable } = useAdaptiveFlash(adaptiveFlash);

  // Column reordering
  const {
    columnOrder,
    orderedColumns,
    dragging,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useColumnReorder({
    columns: normalizedColumns,
    controlledOrder,
    onColumnReorder,
  });

  // Column resizing
  const { columnWidths, resizing, getColumnWidth, handleResizeStart } = useColumnResize({
    columns: normalizedColumns,
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
  // Disable when filter is controlled (external store already filtered)
  const shouldUseWasmCore = useMemo(() => {
    if (onFilterChange) return false; // Controlled - skip internal filter
    if (useWasmCore === true) return true;
    if (useWasmCore === false) return false;
    return data.length > WASM_CORE_THRESHOLD;
  }, [useWasmCore, data.length, onFilterChange]);

  // WASM view (GridCore integration)
  const { wasmCoreReady, wasmIndices } = useWasmView({
    data,
    columns: normalizedColumns,
    filter,
    sort,
    shouldUseWasmCore,
  });

  const getRowKey = useCallback(
    (row: T): string => {
      if (typeof rowKey === 'function') {
        return rowKey(row);
      }
      return String(row[rowKey]);
    },
    [rowKey]
  );

  // Sorted/filtered data (pure derivation)
  const { sortedData, visibleCount, getRowAtIndex } = useSortedData({
    data,
    filter,
    filterFields,
    columns: normalizedColumns,
    sort,
    wasmCoreReady,
    wasmIndices,
    shouldVirtualize,
  });

  // Row-exit lifecycle (leaving rows + cleanup)
  const { mergedData, leavingRowsSize, clearLeaving } = useRowExit({
    sortedData,
    rowExitDuration,
    getRowKey,
    filter,
    columnOrder,
  });

  // Flash detection (lazy, per visible row during render)
  const { updateFlashForRow, getCellFlashClass } = useFlashDetection({
    enableFlash,
    columns: normalizedColumns,
  });

  // R2: Parent orchestrates clearing leaving rows on sort change
  const handleSort = (field: string) => {
    if (onSortChange) {
      // Controlled mode - dispatch to callback
      const currentField = sort?.field;
      const currentDir = sort?.direction;
      let newDir: 'asc' | 'desc' | null = 'asc';

      if (currentField === field) {
        newDir = currentDir === 'asc' ? 'desc' : currentDir === 'desc' ? null : 'asc';
      }

      onSortChange({ field: newDir ? field : null, direction: newDir });
    } else {
      // Uncontrolled mode - use internal state
      handleSortBase(field);
    }
    clearLeaving();
  };

  // Virtualizer - use mergedData.length to include leaving rows
  const virtualizer = useVirtualizer({
    count: shouldVirtualize && wasmCoreReady ? visibleCount + leavingRowsSize : mergedData.length,
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
            onChange={(e) => handleFilterChange(e.target.value)}
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
