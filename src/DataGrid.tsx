import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { filterAndSort, isWasmAvailable, type SortDirection as WasmSortDirection } from './wasm';
import { GridCore } from './wasm/GridCore';

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
  /** Enable flash highlighting on numeric value changes */
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
  /** Disable flash highlighting */
  disableFlash?: boolean;
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

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  field: string | null;
  direction: SortDirection;
}

interface FlashEntry {
  direction: 'up' | 'down';
  expiry: number;
}

const FLASH_DURATION = 800;
const FLASH_CLEANUP_INTERVAL = 1000;
const VIRTUALIZATION_THRESHOLD = 100;
const WASM_CORE_THRESHOLD = 1000;
// Flash is now optimized to only track visible rows, so no disable threshold needed

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
  const [sort, setSort] = useState<SortState>({ field: null, direction: null });
  const [filter, setFilter] = useState('');
  const [, forceUpdate] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridCoreRef = useRef<GridCore | null>(null);
  const [wasmCoreReady, setWasmCoreReady] = useState(false);

  const flashMapRef = useRef<Map<string, FlashEntry>>(new Map());
  const prevValuesRef = useRef<Map<string, number>>(new Map());

  // Leaving rows state for row-exit lifecycle
  const leavingRowsRef = useRef<Map<string, { row: T; snapshotIndex: number; expiry: number }>>(new Map());
  const [leavingRowsVersion, setLeavingRowsVersion] = useState(0);

  // Column resize state (uncontrolled mode)
  const [internalWidths, setInternalWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<{
    field: string;
    startX: number;
    startWidth: number;
    atLimit: 'min' | 'max' | null;
  } | null>(null);

  // Column reorder state (uncontrolled mode)
  const [internalOrder, setInternalOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState<{
    field: string;
    targetIndex: number | null;
  } | null>(null);

  // Determine controlled vs uncontrolled
  const columnWidths = controlledWidths ?? internalWidths;
  const columnOrder = controlledOrder ?? internalOrder;

  // Order columns based on columnOrder prop
  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return columns;
    return columnOrder
      .map((field) => columns.find((c) => String(c.field) === field))
      .filter((c): c is ColumnDef<T> => c !== undefined);
  }, [columns, columnOrder]);

  // Get column width (controlled > column.width > default)
  const getColumnWidth = useCallback(
    (col: ColumnDef<T>): number => {
      const field = String(col.field);
      if (columnWidths[field] !== undefined) return columnWidths[field];
      // Parse column width if specified (e.g., "100px" -> 100)
      if (col.width) {
        const parsed = parseInt(col.width, 10);
        if (!isNaN(parsed)) return parsed;
      }
      return 100; // default width
    },
    [columnWidths]
  );

  // Resize handlers
  const handleResizeStart = useCallback(
    (field: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const col = columns.find((c) => String(c.field) === field);
      const currentWidth = getColumnWidth(col!);
      setResizing({ field, startX: e.clientX, startWidth: currentWidth, atLimit: null });
      document.body.classList.add('askturret-grid-resizing');
    },
    [columns, getColumnWidth]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing) return;
      const col = columns.find((c) => String(c.field) === resizing.field);
      const colMinWidth = col?.minWidth ?? minColumnWidth;
      const colMaxWidth = col?.maxWidth ?? maxColumnWidth;
      const delta = e.clientX - resizing.startX;
      const rawWidth = resizing.startWidth + delta;
      const newWidth = Math.max(colMinWidth, Math.min(colMaxWidth, rawWidth));

      // Detect if we're at a limit
      let atLimit: 'min' | 'max' | null = null;
      if (rawWidth <= colMinWidth) {
        atLimit = 'min';
      } else if (rawWidth >= colMaxWidth) {
        atLimit = 'max';
      }

      // Update limit state for visual feedback
      if (atLimit !== resizing.atLimit) {
        setResizing((prev) => (prev ? { ...prev, atLimit } : null));
        // Update body class for cursor feedback
        document.body.classList.toggle('askturret-grid-at-min', atLimit === 'min');
        document.body.classList.toggle('askturret-grid-at-max', atLimit === 'max');
      }

      if (onColumnResize) {
        onColumnResize(resizing.field, newWidth);
      } else {
        setInternalWidths((prev) => ({ ...prev, [resizing.field]: newWidth }));
      }
    },
    [resizing, columns, minColumnWidth, maxColumnWidth, onColumnResize]
  );

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
    document.body.classList.remove('askturret-grid-resizing');
    document.body.classList.remove('askturret-grid-at-min');
    document.body.classList.remove('askturret-grid-at-max');
  }, []);

  // Attach/detach resize listeners
  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizing, handleResizeMove, handleResizeEnd]);

  // Sync horizontal scroll between header and body in virtualized fixed-width mode
  useEffect(() => {
    if (!resizable) return;
    const body = parentRef.current;
    const header = headerRef.current;
    if (!body || !header) return;

    const handleScroll = () => {
      header.scrollLeft = body.scrollLeft;
    };

    body.addEventListener('scroll', handleScroll);
    return () => body.removeEventListener('scroll', handleScroll);
  }, [resizable]);

  // Drag & drop handlers for column reordering
  const handleDragStart = useCallback((field: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', field);
    setDragging({ field, targetIndex: null });
  }, []);

  const handleDragOver = useCallback(
    (targetField: string, targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging || dragging.field === targetField) return;
      setDragging((prev) => (prev ? { ...prev, targetIndex } : null));
    },
    [dragging]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging || dragging.targetIndex === null) return;

      const currentOrder = columnOrder.length > 0 ? columnOrder : columns.map((c) => String(c.field));

      const fromIndex = currentOrder.indexOf(dragging.field);
      if (fromIndex === -1) return;

      const newOrder = [...currentOrder];
      newOrder.splice(fromIndex, 1);
      newOrder.splice(dragging.targetIndex, 0, dragging.field);

      if (onColumnReorder) {
        onColumnReorder(newOrder);
      } else {
        setInternalOrder(newOrder);
      }
      setDragging(null);
    },
    [dragging, columnOrder, columns, onColumnReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragging(null);
  }, []);

  const rowHeight = rowHeightProp ?? (compact ? 28 : 36);

  const shouldVirtualize = useMemo(() => {
    if (virtualize === true) return true;
    if (virtualize === false) return false;
    return data.length > VIRTUALIZATION_THRESHOLD;
  }, [virtualize, data.length]);

  const enableFlash = !disableFlash;

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

  const flashColumns = useMemo(
    () => columns.filter((col) => col.flashOnChange).map((col) => String(col.field)),
    [columns]
  );

  // Flash detection now happens lazily during render (see updateFlashForRow)
  // This avoids O(n) iteration on every data change

  // Update flash state for a single row (called during render for visible rows only)
  const updateFlashForRow = useCallback(
    (row: T, rowId: string): boolean => {
      if (!enableFlash || flashColumns.length === 0) return false;

      const now = Date.now();
      let hasNewFlash = false;

      flashColumns.forEach((field) => {
        const cellKey = `${rowId}-${field}`;
        const currentValue = getNestedValue(row, field);

        if (typeof currentValue !== 'number') return;

        const prevValue = prevValuesRef.current.get(cellKey);
        prevValuesRef.current.set(cellKey, currentValue);

        if (prevValue === undefined) return;

        if (currentValue !== prevValue) {
          flashMapRef.current.set(cellKey, {
            direction: currentValue > prevValue ? 'up' : 'down',
            expiry: now + FLASH_DURATION,
          });
          hasNewFlash = true;
        }
      });

      return hasNewFlash;
    },
    [enableFlash, flashColumns]
  );

  // Periodic cleanup of expired flashes and leaving rows
  useEffect(() => {
    if (!enableFlash && rowExitDuration === 0) return;

    const cleanup = setInterval(() => {
      const now = Date.now();
      let cleaned = false;

      // Clean expired flashes
      if (enableFlash) {
        flashMapRef.current.forEach((entry, key) => {
          if (entry.expiry <= now) {
            flashMapRef.current.delete(key);
            cleaned = true;
          }
        });
      }

      // Clean expired leaving rows
      if (rowExitDuration > 0) {
        leavingRowsRef.current.forEach((entry, key) => {
          if (entry.expiry <= now) {
            leavingRowsRef.current.delete(key);
            cleaned = true;
          }
        });
      }

      if (cleaned) {
        forceUpdate((n) => n + 1);
        if (rowExitDuration > 0) {
          setLeavingRowsVersion((v) => v + 1);
        }
      }
    }, FLASH_CLEANUP_INTERVAL);

    return () => clearInterval(cleanup);
  }, [enableFlash, rowExitDuration]);

  // Limit map sizes to prevent memory leaks (simple LRU-like cleanup)
  useEffect(() => {
    const maxEntries = 10000; // Keep at most 10k entries
    if (prevValuesRef.current.size > maxEntries) {
      // Clear oldest entries (maps maintain insertion order)
      const entries = Array.from(prevValuesRef.current.keys());
      const toDelete = entries.slice(0, entries.length - maxEntries);
      toDelete.forEach((key) => {
        prevValuesRef.current.delete(key);
        flashMapRef.current.delete(key);
      });
    }
  }, [data.length]);

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

  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev.field !== field) {
        return { field, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      return { field: null, direction: null };
    });
    // Clear leaving rows on sort change
    if (rowExitDuration > 0 && leavingRowsRef.current.size > 0) {
      leavingRowsRef.current.clear();
      setLeavingRowsVersion((v) => v + 1);
    }
  };

  const getCellFlashClass = useCallback(
    (rowId: string, field: string): string => {
      if (!enableFlash) return '';
      const cellKey = `${rowId}-${field}`;
      const entry = flashMapRef.current.get(cellKey);
      if (!entry || entry.expiry <= Date.now()) return '';
      return entry.direction === 'up' ? 'flash-up' : 'flash-down';
    },
    [enableFlash]
  );

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

/** Helper to get nested values like "foo.bar" */
function getNestedValue<T>(obj: T, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object' && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj as unknown);
}
