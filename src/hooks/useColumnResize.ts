import { useState, useEffect, useCallback, type RefObject } from 'react';

export interface ColumnDef<T> {
  field: keyof T | string;
  width?: string | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

export interface UseColumnResizeParams<T> {
  columns: ColumnDef<T>[];
  controlledWidths?: Record<string, number> | undefined;
  onColumnResize?: ((field: string, width: number) => void) | undefined;
  minColumnWidth: number;
  maxColumnWidth: number;
  resizable: boolean;
  parentRef: RefObject<HTMLDivElement>;
  headerRef: RefObject<HTMLDivElement>;
}

export interface UseColumnResizeReturn<T> {
  columnWidths: Record<string, number>;
  resizing: {
    field: string;
    startX: number;
    startWidth: number;
    atLimit: 'min' | 'max' | null;
  } | null;
  getColumnWidth: (col: ColumnDef<T>) => number;
  handleResizeStart: (field: string, e: React.MouseEvent) => void;
}

/**
 * Hook for managing column resize state and handlers.
 *
 * Extracted from DataGrid.tsx per Architect's refactor plan (#33).
 * Manages internal resize state (widths, active resize), provides handlers,
 * and coordinates two effects: document-level mousemove/up listeners and
 * header⇄body scroll sync.
 */
export function useColumnResize<T>({
  columns,
  controlledWidths,
  onColumnResize,
  minColumnWidth,
  maxColumnWidth,
  resizable,
  parentRef,
  headerRef,
}: UseColumnResizeParams<T>): UseColumnResizeReturn<T> {
  // Uncontrolled resize state
  const [internalWidths, setInternalWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<{
    field: string;
    startX: number;
    startWidth: number;
    atLimit: 'min' | 'max' | null;
  } | null>(null);

  // Determine controlled vs uncontrolled
  const columnWidths = controlledWidths ?? internalWidths;

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
      // R3: Non-null assertion safety — early-return if column was removed
      if (!col) return;
      const currentWidth = getColumnWidth(col);
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
  }, [resizable, parentRef, headerRef]);

  return {
    columnWidths,
    resizing,
    getColumnWidth,
    handleResizeStart,
  };
}
