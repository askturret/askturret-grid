import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef } from '../DataGrid';

interface UseColumnReorderProps<T> {
  columns: ColumnDef<T>[];
  controlledOrder?: string[];
  onColumnReorder?: (newOrder: string[]) => void;
}

interface UseColumnReorderReturn<T> {
  columnOrder: string[];
  orderedColumns: ColumnDef<T>[];
  dragging: { field: string; targetIndex: number | null } | null;
  handleDragStart: (field: string, e: React.DragEvent) => void;
  handleDragOver: (targetField: string, targetIndex: number, e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragEnd: () => void;
}

/**
 * Hook for managing column reordering via drag and drop.
 * Supports both controlled and uncontrolled modes.
 */
export function useColumnReorder<T>({
  columns,
  controlledOrder,
  onColumnReorder,
}: UseColumnReorderProps<T>): UseColumnReorderReturn<T> {
  const [internalOrder, setInternalOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState<{
    field: string;
    targetIndex: number | null;
  } | null>(null);

  // Determine controlled vs uncontrolled
  const columnOrder = controlledOrder ?? internalOrder;

  // Order columns based on columnOrder
  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return columns;
    return columnOrder
      .map((field) => columns.find((c) => String(c.field) === field))
      .filter((c): c is ColumnDef<T> => c !== undefined);
  }, [columns, columnOrder]);

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

  return {
    columnOrder,
    orderedColumns,
    dragging,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
