import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DataGrid, type ColumnDef } from './DataGrid';

interface TestRow {
  id: string;
  name: string;
  value: number;
  status: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alpha', value: 100, status: 'active' },
  { id: '2', name: 'Beta', value: 200, status: 'pending' },
  { id: '3', name: 'Gamma', value: 150, status: 'active' },
  { id: '4', name: 'Delta', value: 50, status: 'inactive' },
];

const columns: ColumnDef<TestRow>[] = [
  { field: 'name', header: 'Name', sortable: true },
  { field: 'value', header: 'Value', align: 'right', sortable: true },
  { field: 'status', header: 'Status' },
];

describe('DataGrid', () => {
  afterEach(() => {
    cleanup();
  });

  describe('rendering', () => {
    it('renders column headers', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('renders all rows', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
      expect(screen.getByText('Delta')).toBeInTheDocument();
    });

    it('renders empty message when no data', () => {
      render(<DataGrid data={[]} columns={columns} rowKey="id" emptyMessage="No items found" />);

      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('applies custom formatter', () => {
      const columnsWithFormatter: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name' },
        {
          field: 'value',
          header: 'Value',
          formatter: (v) => `$${(v as number).toFixed(2)}`,
        },
      ];

      render(<DataGrid data={testData} columns={columnsWithFormatter} rowKey="id" />);

      expect(screen.getByText('$100.00')).toBeInTheDocument();
      expect(screen.getByText('$200.00')).toBeInTheDocument();
    });

    it('applies custom cellClass', () => {
      const columnsWithClass: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name' },
        {
          field: 'status',
          header: 'Status',
          cellClass: (v) => (v === 'active' ? 'status-active' : 'status-other'),
        },
      ];

      const { container } = render(<DataGrid data={testData} columns={columnsWithClass} rowKey="id" />);

      const activeCells = container.querySelectorAll('.status-active');
      expect(activeCells.length).toBe(2); // Alpha and Gamma are active
    });

    it('supports function rowKey', () => {
      render(<DataGrid data={testData} columns={columns} rowKey={(row) => `custom-${row.id}`} />);

      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts ascending on first click', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);

      const rows = screen.getAllByRole('row');
      // Skip header row, check data rows are sorted A-Z
      expect(rows[1]).toHaveTextContent('Alpha');
      expect(rows[2]).toHaveTextContent('Beta');
      expect(rows[3]).toHaveTextContent('Delta');
      expect(rows[4]).toHaveTextContent('Gamma');
    });

    it('sorts descending on second click', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);
      fireEvent.click(nameHeader);

      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Gamma');
      expect(rows[2]).toHaveTextContent('Delta');
      expect(rows[3]).toHaveTextContent('Beta');
      expect(rows[4]).toHaveTextContent('Alpha');
    });

    it('clears sort on third click', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);
      fireEvent.click(nameHeader);
      fireEvent.click(nameHeader);

      // Should return to original order
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alpha');
      expect(rows[2]).toHaveTextContent('Beta');
      expect(rows[3]).toHaveTextContent('Gamma');
      expect(rows[4]).toHaveTextContent('Delta');
    });

    it('sorts numbers correctly', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      const valueHeader = screen.getByText('Value');
      fireEvent.click(valueHeader);

      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('50'); // Delta
      expect(rows[2]).toHaveTextContent('100'); // Alpha
      expect(rows[3]).toHaveTextContent('150'); // Gamma
      expect(rows[4]).toHaveTextContent('200'); // Beta
    });

    it('shows sort indicator', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);

      expect(screen.getByText('▲')).toBeInTheDocument();

      fireEvent.click(nameHeader);
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    it('respects sortable: false', () => {
      const columnsNonSortable: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name', sortable: false },
        { field: 'value', header: 'Value', sortable: true },
      ];

      render(<DataGrid data={testData} columns={columnsNonSortable} rowKey="id" />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);

      // Should not show sort indicator
      expect(screen.queryByText('▲')).not.toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('shows filter input when showFilter is true', () => {
      render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          showFilter={true}
          filterPlaceholder="Search..."
        />
      );

      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('filters data by text', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" showFilter={true} />);

      const filterInput = screen.getByRole('textbox');
      fireEvent.change(filterInput, { target: { value: 'Alpha' } });

      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
      expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
    });

    it('filters case-insensitively', () => {
      render(<DataGrid data={testData} columns={columns} rowKey="id" showFilter={true} />);

      const filterInput = screen.getByRole('textbox');
      fireEvent.change(filterInput, { target: { value: 'ALPHA' } });

      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });

    it('respects filterFields', () => {
      render(
        <DataGrid data={testData} columns={columns} rowKey="id" showFilter={true} filterFields={['status']} />
      );

      const filterInput = screen.getByRole('textbox');

      // Search for 'active' status
      fireEvent.change(filterInput, { target: { value: 'active' } });
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();

      // Search for name should not match (only searching status field)
      fireEvent.change(filterInput, { target: { value: 'Alpha' } });
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    });

    it('shows empty message when filter matches nothing', () => {
      render(
        <DataGrid data={testData} columns={columns} rowKey="id" showFilter={true} emptyMessage="No results" />
      );

      const filterInput = screen.getByRole('textbox');
      fireEvent.change(filterInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No results')).toBeInTheDocument();
    });
  });

  describe('row interaction', () => {
    it('calls onRowClick when row is clicked', () => {
      const handleClick = vi.fn();

      render(<DataGrid data={testData} columns={columns} rowKey="id" onRowClick={handleClick} />);

      const alphaRow = screen.getByText('Alpha').closest('tr');
      fireEvent.click(alphaRow!);

      expect(handleClick).toHaveBeenCalledWith(testData[0]);
    });

    it('adds clickable class when onRowClick is provided', () => {
      const handleClick = vi.fn();

      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" onRowClick={handleClick} />
      );

      const rows = container.querySelectorAll('tbody tr');
      rows.forEach((row) => {
        expect(row).toHaveClass('clickable');
      });
    });
  });

  describe('virtualization', () => {
    it('enables virtualization when virtualize is true', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" virtualize={true} />
      );

      // Virtualized mode uses divs instead of table
      expect(container.querySelector('.askturret-grid-virtual')).toBeInTheDocument();
    });

    it('disables virtualization when virtualize is false', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" virtualize={false} />
      );

      expect(container.querySelector('table')).toBeInTheDocument();
      expect(container.querySelector('.askturret-grid-virtual')).not.toBeInTheDocument();
    });

    it('auto-enables virtualization at threshold', () => {
      const largeData = Array.from({ length: 150 }, (_, i) => ({
        id: String(i),
        name: `Item ${i}`,
        value: i * 10,
        status: 'active',
      }));

      const { container } = render(
        <DataGrid data={largeData} columns={columns} rowKey="id" virtualize="auto" />
      );

      expect(container.querySelector('.askturret-grid-virtual')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('applies compact class when compact is true', () => {
      const { container } = render(<DataGrid data={testData} columns={columns} rowKey="id" compact={true} />);

      expect(container.querySelector('.askturret-grid.compact')).toBeInTheDocument();
    });
  });

  describe('nested field access', () => {
    it('supports nested field paths', () => {
      interface NestedRow {
        id: string;
        user: { name: string };
      }

      const nestedData: NestedRow[] = [
        { id: '1', user: { name: 'John' } },
        { id: '2', user: { name: 'Jane' } },
      ];

      const nestedColumns: ColumnDef<NestedRow>[] = [{ field: 'user.name', header: 'User Name' }];

      render(<DataGrid data={nestedData} columns={nestedColumns} rowKey="id" />);

      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Jane')).toBeInTheDocument();
    });
  });

  describe('column resizing', () => {
    it('renders resize handles when resizable is true', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" resizable={true} />
      );

      const handles = container.querySelectorAll('.askturret-grid-resize-handle');
      expect(handles.length).toBe(3); // One for each column
    });

    it('does not render resize handles when resizable is false', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" resizable={false} />
      );

      const handles = container.querySelectorAll('.askturret-grid-resize-handle');
      expect(handles.length).toBe(0);
    });

    it('respects column-level resizable setting', () => {
      const columnsWithNonResizable: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name', resizable: false },
        { field: 'value', header: 'Value' },
        { field: 'status', header: 'Status' },
      ];

      const { container } = render(
        <DataGrid data={testData} columns={columnsWithNonResizable} rowKey="id" resizable={true} />
      );

      const handles = container.querySelectorAll('.askturret-grid-resize-handle');
      expect(handles.length).toBe(2); // Only Value and Status have handles
    });

    it('calls onColumnResize when controlled', () => {
      const handleResize = vi.fn();

      const { container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          resizable={true}
          onColumnResize={handleResize}
        />
      );

      const handle = container.querySelector('.askturret-grid-resize-handle');
      fireEvent.mouseDown(handle!, { clientX: 100 });

      // Simulate mousemove
      fireEvent.mouseMove(document, { clientX: 150 });

      expect(handleResize).toHaveBeenCalledWith('name', expect.any(Number));
    });

    it('updates internal width in uncontrolled mode', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" resizable={true} />
      );

      const handle = container.querySelector('.askturret-grid-resize-handle');
      fireEvent.mouseDown(handle!, { clientX: 100 });

      // Simulate mousemove
      fireEvent.mouseMove(document, { clientX: 150 });

      // Mouseup to finalize
      fireEvent.mouseUp(document);

      // Check that the column width was updated
      const headerCell = container.querySelector('th');
      expect(headerCell?.style.width).toBeTruthy();
    });

    it('applies controlled columnWidths', () => {
      const { container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          resizable={true}
          columnWidths={{ name: 200, value: 150 }}
        />
      );

      const headerCells = container.querySelectorAll('th');
      expect(headerCells[0]?.style.width).toBe('200px');
      expect(headerCells[1]?.style.width).toBe('150px');
    });
  });

  describe('column reordering', () => {
    it('enables drag on headers when reorderable is true', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" reorderable={true} />
      );

      const headers = container.querySelectorAll('th[draggable="true"]');
      expect(headers.length).toBe(3);
    });

    it('does not enable drag when reorderable is false', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" reorderable={false} />
      );

      const headers = container.querySelectorAll('th[draggable="true"]');
      expect(headers.length).toBe(0);
    });

    it('respects column-level reorderable setting', () => {
      const columnsWithNonReorderable: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name', reorderable: false },
        { field: 'value', header: 'Value' },
        { field: 'status', header: 'Status' },
      ];

      const { container } = render(
        <DataGrid data={testData} columns={columnsWithNonReorderable} rowKey="id" reorderable={true} />
      );

      const headers = container.querySelectorAll('th[draggable="true"]');
      expect(headers.length).toBe(2); // Only Value and Status are draggable
    });

    it('renders columns in controlled order', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" columnOrder={['status', 'name', 'value']} />
      );

      const headers = container.querySelectorAll('th .askturret-grid-header-text');
      expect(headers[0]?.textContent).toBe('Status');
      expect(headers[1]?.textContent).toBe('Name');
      expect(headers[2]?.textContent).toBe('Value');
    });

    it('calls onColumnReorder when columns are reordered', () => {
      const handleReorder = vi.fn();

      const { container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          reorderable={true}
          onColumnReorder={handleReorder}
        />
      );

      const headers = container.querySelectorAll('th');
      const sourceHeader = headers[0]; // Name
      const targetHeader = headers[2]; // Status

      // Start drag
      fireEvent.dragStart(sourceHeader, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      // Drag over target
      fireEvent.dragOver(targetHeader);

      // Drop
      fireEvent.drop(targetHeader.closest('tr')!);

      expect(handleReorder).toHaveBeenCalled();
    });

    it('adds dragging class during drag', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" reorderable={true} />
      );

      const header = container.querySelector('th')!;

      fireEvent.dragStart(header, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      expect(header).toHaveClass('dragging');
    });
  });

  describe('resize and reorder together', () => {
    it('supports both resizable and reorderable simultaneously', () => {
      const { container } = render(
        <DataGrid data={testData} columns={columns} rowKey="id" resizable={true} reorderable={true} />
      );

      const handles = container.querySelectorAll('.askturret-grid-resize-handle');
      const draggableHeaders = container.querySelectorAll('th[draggable="true"]');

      expect(handles.length).toBe(3);
      expect(draggableHeaders.length).toBe(3);
    });
  });

  describe('row-exit lifecycle', () => {
    it('renders leaving row with isLeaving: true for rowExitDuration', async () => {
      vi.useFakeTimers();
      const rowClassMock = vi.fn((row: TestRow, meta: { isLeaving: boolean }) => {
        return meta.isLeaving ? 'leaving' : '';
      });

      const { rerender, container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Verify Alpha is present
      expect(screen.getByText('Alpha')).toBeInTheDocument();

      // Remove Alpha from data
      const newData = testData.filter((r) => r.id !== '1');
      rerender(
        <DataGrid
          data={newData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Alpha should still be rendered with leaving class
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      const leavingRow = container.querySelector('.leaving');
      expect(leavingRow).toBeInTheDocument();

      // rowClass should have been called with isLeaving: true
      expect(rowClassMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', name: 'Alpha' }),
        { isLeaving: true }
      );

      // After rowExitDuration + cleanup interval, Alpha should be unmounted
      // Cleanup runs every 1000ms (FLASH_CLEANUP_INTERVAL)
      vi.advanceTimersByTime(1001);
      await vi.waitFor(() => {
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
      });

      vi.useRealTimers();
    });

    it('cancels exit when row reappears during transition', () => {
      vi.useFakeTimers();
      const rowClassMock = vi.fn((row: TestRow, meta: { isLeaving: boolean }) => {
        return meta.isLeaving ? 'leaving' : '';
      });

      const { rerender, container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Remove Alpha
      const withoutAlpha = testData.filter((r) => r.id !== '1');
      rerender(
        <DataGrid
          data={withoutAlpha}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Alpha should be leaving
      expect(container.querySelector('.leaving')).toBeInTheDocument();

      // Advance halfway through duration
      vi.advanceTimersByTime(150);

      // Re-add Alpha before expiry
      rerender(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Alpha should now render normally (not leaving)
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      // Leaving class should be gone
      expect(container.querySelector('.leaving')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('has zero overhead when rowExitDuration is 0 (default)', () => {
      const rowClassMock = vi.fn();

      render(<DataGrid data={testData} columns={columns} rowKey="id" rowClass={rowClassMock} />);

      // rowClass should be called with isLeaving: false for all rows
      testData.forEach((row) => {
        expect(rowClassMock).toHaveBeenCalledWith(row, { isLeaving: false });
      });

      // No leaving class should exist
      const { container } = render(<DataGrid data={testData} columns={columns} rowKey="id" />);
      expect(container.querySelector('.leaving')).not.toBeInTheDocument();
    });

    it('clears leaving state on sort change', () => {
      vi.useFakeTimers();
      const rowClassMock = vi.fn((row: TestRow, meta: { isLeaving: boolean }) => {
        return meta.isLeaving ? 'leaving' : '';
      });

      const { rerender, container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Remove Alpha
      const newData = testData.filter((r) => r.id !== '1');
      rerender(
        <DataGrid
          data={newData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
        />
      );

      // Alpha should be leaving
      expect(container.querySelector('.leaving')).toBeInTheDocument();

      // Click sort header to trigger context change
      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);

      // Leaving row should be immediately cleared
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('clears leaving state on filter change', () => {
      vi.useFakeTimers();
      const rowClassMock = vi.fn((row: TestRow, meta: { isLeaving: boolean }) => {
        return meta.isLeaving ? 'leaving' : '';
      });

      const { rerender, container } = render(
        <DataGrid
          data={testData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
          showFilter={true}
        />
      );

      // Remove Alpha
      const newData = testData.filter((r) => r.id !== '1');
      rerender(
        <DataGrid
          data={newData}
          columns={columns}
          rowKey="id"
          rowClass={rowClassMock}
          rowExitDuration={300}
          showFilter={true}
        />
      );

      // Alpha should be leaving
      expect(container.querySelector('.leaving')).toBeInTheDocument();

      // Change filter
      const filterInput = screen.getByPlaceholderText('Filter...');
      fireEvent.change(filterInput, { target: { value: 'Beta' } });

      // Leaving row should be immediately cleared
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('does not update flash state for leaving rows', () => {
      vi.useFakeTimers();

      const columnsWithFlash: ColumnDef<TestRow>[] = [
        { field: 'name', header: 'Name' },
        { field: 'value', header: 'Value', flashOnChange: true },
      ];

      const { rerender, container } = render(
        <DataGrid
          data={testData}
          columns={columnsWithFlash}
          rowKey="id"
          rowExitDuration={300}
        />
      );

      // Remove Alpha (which has flashOnChange value column)
      const newData = testData.filter((r) => r.id !== '1');
      rerender(
        <DataGrid
          data={newData}
          columns={columnsWithFlash}
          rowKey="id"
          rowExitDuration={300}
        />
      );

      // Alpha should be leaving
      expect(screen.getByText('Alpha')).toBeInTheDocument();

      // Try to trigger flash by changing value (simulate data update)
      // Since Alpha is leaving, no flash should be applied
      const leavingCells = container.querySelectorAll('.leaving td');
      leavingCells.forEach((cell) => {
        expect(cell).not.toHaveClass('flash-up');
        expect(cell).not.toHaveClass('flash-down');
      });

      vi.useRealTimers();
    });
  });
});
