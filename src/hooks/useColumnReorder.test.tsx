import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnReorder } from './useColumnReorder';
import type { ColumnDef } from '../DataGrid';

describe('useColumnReorder', () => {
  const mockColumns: ColumnDef<{ id: number; name: string; age: number }>[] = [
    { field: 'id' },
    { field: 'name' },
    { field: 'age' },
  ];

  const createDragEvent = (field: string): Partial<React.DragEvent> => ({
    dataTransfer: {
      effectAllowed: 'move',
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue(field),
    } as unknown as DataTransfer,
    preventDefault: vi.fn(),
  });

  it('returns columns in original order when no reordering is done', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    expect(result.current.orderedColumns).toEqual(mockColumns);
    expect(result.current.columnOrder).toEqual([]);
  });

  it('handles controlled mode with controlledOrder prop', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        controlledOrder: ['age', 'id', 'name'],
      })
    );

    expect(result.current.columnOrder).toEqual(['age', 'id', 'name']);
    expect(result.current.orderedColumns[0].field).toBe('age');
    expect(result.current.orderedColumns[1].field).toBe('id');
    expect(result.current.orderedColumns[2].field).toBe('name');
  });

  it('sets dragging state on handleDragStart', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    expect(result.current.dragging).toEqual({ field: 'name', targetIndex: null });
    expect(dragEvent.dataTransfer?.setData).toHaveBeenCalledWith('text/plain', 'name');
  });

  it('updates targetIndex on handleDragOver', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });

    expect(result.current.dragging?.targetIndex).toBe(2);
    expect(dragEvent.preventDefault).toHaveBeenCalled();
  });

  it('does not update targetIndex when dragging field is same as target', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    act(() => {
      result.current.handleDragOver('name', 1, dragEvent as React.DragEvent);
    });

    expect(result.current.dragging?.targetIndex).toBeNull();
  });

  it('reorders columns on handleDrop (uncontrolled mode)', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    // Start dragging 'name' (index 1)
    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    // Drag over 'age' (index 2)
    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });

    // Drop
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    // Order should be: id, age, name
    expect(result.current.columnOrder).toEqual(['id', 'age', 'name']);
    expect(result.current.orderedColumns[0].field).toBe('id');
    expect(result.current.orderedColumns[1].field).toBe('age');
    expect(result.current.orderedColumns[2].field).toBe('name');
    expect(result.current.dragging).toBeNull();
  });

  it('calls onColumnReorder callback in controlled mode', () => {
    const onColumnReorder = vi.fn();

    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        controlledOrder: ['id', 'name', 'age'],
        onColumnReorder,
      })
    );

    const dragEvent = createDragEvent('name');

    // Start dragging 'name' (currently at index 1)
    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    // Drag to index 2
    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });

    // Drop
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    // Callback should be called with new order
    expect(onColumnReorder).toHaveBeenCalledWith(['id', 'age', 'name']);
  });

  it('does not drop if targetIndex is null', () => {
    const onColumnReorder = vi.fn();

    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        onColumnReorder,
      })
    );

    const dragEvent = createDragEvent('name');

    // Start dragging but don't set targetIndex
    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    // Drop without dragging over anything
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    expect(onColumnReorder).not.toHaveBeenCalled();
    expect(result.current.columnOrder).toEqual([]);
  });

  it('does not drop if dragging is null', () => {
    const onColumnReorder = vi.fn();

    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        onColumnReorder,
      })
    );

    const dragEvent = createDragEvent('name');

    // Drop without starting drag
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    expect(onColumnReorder).not.toHaveBeenCalled();
  });

  it('clears dragging state on handleDragEnd', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    expect(result.current.dragging).not.toBeNull();

    act(() => {
      result.current.handleDragEnd();
    });

    expect(result.current.dragging).toBeNull();
  });

  it('handles reordering from last to first position', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('age');

    // Start dragging 'age' (index 2)
    act(() => {
      result.current.handleDragStart('age', dragEvent as React.DragEvent);
    });

    // Drag to index 0
    act(() => {
      result.current.handleDragOver('id', 0, dragEvent as React.DragEvent);
    });

    // Drop
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    // Order should be: age, id, name
    expect(result.current.columnOrder).toEqual(['age', 'id', 'name']);
    expect(result.current.orderedColumns[0].field).toBe('age');
  });

  it('handles reordering from first to last position', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('id');

    // Start dragging 'id' (index 0)
    act(() => {
      result.current.handleDragStart('id', dragEvent as React.DragEvent);
    });

    // Drag to index 2
    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });

    // Drop
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    // Order should be: name, age, id
    expect(result.current.columnOrder).toEqual(['name', 'age', 'id']);
    expect(result.current.orderedColumns[2].field).toBe('id');
  });

  it('filters out columns not found in the columns array', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        controlledOrder: ['id', 'nonexistent', 'age'],
      })
    );

    // 'nonexistent' should be filtered out
    expect(result.current.orderedColumns).toHaveLength(2);
    expect(result.current.orderedColumns[0].field).toBe('id');
    expect(result.current.orderedColumns[1].field).toBe('age');
  });

  it('returns original columns when columnOrder is empty', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
        controlledOrder: [],
      })
    );

    expect(result.current.orderedColumns).toEqual(mockColumns);
  });

  it('does not mutate the columns prop', () => {
    const originalColumns = [...mockColumns];

    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const dragEvent = createDragEvent('name');

    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });

    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });

    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    expect(mockColumns).toEqual(originalColumns);
  });

  it('handles multiple reorders sequentially', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    // First reorder: move 'name' to end
    let dragEvent = createDragEvent('name');
    act(() => {
      result.current.handleDragStart('name', dragEvent as React.DragEvent);
    });
    act(() => {
      result.current.handleDragOver('age', 2, dragEvent as React.DragEvent);
    });
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    expect(result.current.columnOrder).toEqual(['id', 'age', 'name']);

    // Second reorder: move 'age' to beginning
    dragEvent = createDragEvent('age');
    act(() => {
      result.current.handleDragStart('age', dragEvent as React.DragEvent);
    });
    act(() => {
      result.current.handleDragOver('id', 0, dragEvent as React.DragEvent);
    });
    act(() => {
      result.current.handleDrop(dragEvent as React.DragEvent);
    });

    expect(result.current.columnOrder).toEqual(['age', 'id', 'name']);
  });

  it('handles drag event with missing dataTransfer gracefully', () => {
    const { result } = renderHook(() =>
      useColumnReorder({
        columns: mockColumns,
      })
    );

    const invalidEvent = {
      dataTransfer: {
        effectAllowed: 'none',
        setData: vi.fn(),
      } as unknown as DataTransfer,
      preventDefault: vi.fn(),
    };

    // Should not throw
    act(() => {
      result.current.handleDragStart('name', invalidEvent as unknown as React.DragEvent);
    });

    expect(result.current.dragging).toEqual({ field: 'name', targetIndex: null });
  });
});
