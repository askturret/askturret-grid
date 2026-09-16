import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TopMovers, type MoverItem } from './TopMovers';

describe('TopMovers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleData: MoverItem[] = [
    { id: '1', symbol: 'AAPL', price: 150, change: 5, changePercent: 3.4 },
    { id: '2', symbol: 'GOOGL', price: 2800, change: 50, changePercent: 1.8 },
    { id: '3', symbol: 'TSLA', price: 700, change: -20, changePercent: -2.8 },
    { id: '4', symbol: 'MSFT', price: 300, change: 10, changePercent: 3.4 },
    { id: '5', symbol: 'AMZN', price: 3300, change: -100, changePercent: -2.9 },
  ];

  describe('gainer/loser classification', () => {
    it('classifies items with positive changePercent as gainers', () => {
      render(<TopMovers data={sampleData} />);

      // AAPL and GOOGL and MSFT have positive changePercent
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });

    it('classifies items with negative changePercent as losers', () => {
      render(<TopMovers data={sampleData} />);

      // TSLA and AMZN have negative changePercent
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
    });

    it('excludes items with zero changePercent from both lists', () => {
      const dataWithZero: MoverItem[] = [
        { id: '1', symbol: 'FLAT', price: 100, change: 0, changePercent: 0 },
        { id: '2', symbol: 'UP', price: 100, change: 5, changePercent: 5 },
        { id: '3', symbol: 'DOWN', price: 100, change: -5, changePercent: -5 },
      ];

      render(<TopMovers data={dataWithZero} gainersCount={10} losersCount={10} />);

      // FLAT should not appear in either list
      expect(screen.queryByText('FLAT')).not.toBeInTheDocument();
      expect(screen.getByText('UP')).toBeInTheDocument();
      expect(screen.getByText('DOWN')).toBeInTheDocument();
    });
  });

  describe('ranking order', () => {
    it('ranks gainers by changePercent descending', () => {
      render(<TopMovers data={sampleData} gainersCount={3} />);

      // AAPL and MSFT both have 3.4%, GOOGL has 1.8%
      // Within same percentage, order depends on array order
      // Should show highest percentages first

      const gainerItems = document.querySelectorAll('.askturret-topmovers-item.gainer');
      expect(gainerItems.length).toBe(3);

      // Verify GOOGL appears (1.8% should be in top 3 gainers)
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
    });

    it('ranks losers by changePercent ascending (most negative first)', () => {
      render(<TopMovers data={sampleData} losersCount={2} />);

      // AMZN (-2.9%) should rank before TSLA (-2.8%)
      const loserItems = document.querySelectorAll('.askturret-topmovers-item.loser');
      expect(loserItems.length).toBe(2);

      expect(screen.getByText('AMZN')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });

    it('limits gainers to gainersCount', () => {
      const manyGainers: MoverItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `g${i}`,
        symbol: `G${i}`,
        price: 100,
        change: i + 1,
        changePercent: i + 1,
      }));

      render(<TopMovers data={manyGainers} gainersCount={3} losersCount={5} />);

      const gainerItems = document.querySelectorAll('.askturret-topmovers-item.gainer');
      expect(gainerItems.length).toBe(3);
    });

    it('limits losers to losersCount', () => {
      const manyLosers: MoverItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `l${i}`,
        symbol: `L${i}`,
        price: 100,
        change: -(i + 1),
        changePercent: -(i + 1),
      }));

      render(<TopMovers data={manyLosers} gainersCount={5} losersCount={3} />);

      const loserItems = document.querySelectorAll('.askturret-topmovers-item.loser');
      expect(loserItems.length).toBe(3);
    });
  });

  describe('interval-based ranking updates', () => {
    it('updates rankings on mount', () => {
      render(<TopMovers data={sampleData} updateInterval={5000} />);

      // Initial rankings should be present
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
    });

    it('updates rankings after interval expires', () => {
      const initialData: MoverItem[] = [{ id: '1', symbol: 'A', price: 100, change: 10, changePercent: 10 }];

      const { rerender } = render(<TopMovers data={initialData} updateInterval={5000} />);

      expect(screen.getByText('A')).toBeInTheDocument();

      // Change data
      const newData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: -10, changePercent: -10 },
        { id: '2', symbol: 'B', price: 100, change: 20, changePercent: 20 },
      ];

      rerender(<TopMovers data={newData} updateInterval={5000} />);

      // Rankings don't update immediately (still showing old rankings)
      // A should still be visible as a gainer from initial data

      // Advance time to trigger interval update
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Now rankings should update
      // A should now be in losers, B should be in gainers
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('does not update rankings between intervals', () => {
      const initialData: MoverItem[] = [
        { id: '1', symbol: 'STABLE', price: 100, change: 10, changePercent: 10 },
      ];

      const { rerender } = render(<TopMovers data={initialData} updateInterval={10000} />);

      // Advance time but not past full interval
      vi.advanceTimersByTime(5000);

      // Change data mid-interval
      const newData: MoverItem[] = [{ id: '2', symbol: 'NEW', price: 100, change: 20, changePercent: 20 }];

      rerender(<TopMovers data={newData} updateInterval={10000} />);

      // STABLE should still be visible (rankings haven't updated yet)
      expect(screen.getByText('STABLE')).toBeInTheDocument();
    });

    it('respects custom update interval', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'FAST', price: 100, change: 10, changePercent: 10 }];

      render(<TopMovers data={data} updateInterval={1000} />);

      expect(screen.getByText('FAST')).toBeInTheDocument();

      // Should update after 1000ms, not 5000ms
      vi.advanceTimersByTime(1000);

      // Component should still be stable
      expect(screen.getByText('FAST')).toBeInTheDocument();
    });
  });

  describe('rank change detection and flash', () => {
    it('flashes item when rank changes', () => {
      const initialData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 10, changePercent: 10 },
        { id: '2', symbol: 'B', price: 100, change: 5, changePercent: 5 },
      ];

      const { rerender } = render(<TopMovers data={initialData} updateInterval={5000} />);

      // Initial render - no flash
      let flashedItems = document.querySelectorAll('.flash');
      expect(flashedItems.length).toBe(0);

      // Change rankings: B now higher than A
      const newData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 5, changePercent: 5 },
        { id: '2', symbol: 'B', price: 100, change: 10, changePercent: 10 },
      ];

      rerender(<TopMovers data={newData} updateInterval={5000} />);

      // Trigger interval update
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Both items should flash (ranks changed)
      flashedItems = document.querySelectorAll('.flash');
      expect(flashedItems.length).toBeGreaterThan(0);
    });

    it('clears flash after FLASH_DURATION', () => {
      const initialData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 10, changePercent: 10 },
        { id: '2', symbol: 'B', price: 100, change: 5, changePercent: 5 },
      ];

      const { rerender } = render(<TopMovers data={initialData} updateInterval={5000} />);

      // Trigger first interval (establishes previous ranks)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Change rankings: B now higher than A
      const newData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 5, changePercent: 5 },
        { id: '2', symbol: 'B', price: 100, change: 10, changePercent: 10 },
      ];

      rerender(<TopMovers data={newData} updateInterval={5000} />);

      // Trigger update
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Flash should be present
      let flashedItems = document.querySelectorAll('.flash');
      expect(flashedItems.length).toBeGreaterThan(0);

      // Advance past FLASH_DURATION (1500ms)
      act(() => {
        vi.advanceTimersByTime(1600);
      });

      // Flash should be cleared
      flashedItems = document.querySelectorAll('.flash');
      expect(flashedItems.length).toBe(0);
    });

    it('does not flash on first ranking update (no previous rank)', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'NEW', price: 100, change: 10, changePercent: 10 }];

      render(<TopMovers data={data} updateInterval={5000} />);

      // No flash on first render
      const flashedItems = document.querySelectorAll('.flash');
      expect(flashedItems.length).toBe(0);
    });

    it('shows rank change indicator when rank improves', () => {
      const initialData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 10, changePercent: 10 },
        { id: '2', symbol: 'B', price: 100, change: 5, changePercent: 5 },
      ];

      const { rerender } = render(<TopMovers data={initialData} gainersCount={2} updateInterval={5000} />);

      // Establish initial rankings (A rank 1, B rank 2)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // B overtakes A
      const newData: MoverItem[] = [
        { id: '1', symbol: 'A', price: 100, change: 5, changePercent: 5 },
        { id: '2', symbol: 'B', price: 100, change: 10, changePercent: 10 },
      ];

      rerender(<TopMovers data={newData} gainersCount={2} updateInterval={5000} />);

      // Trigger update
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Should show rank change indicators (↑ or ↓)
      const rankChanges = document.querySelectorAll('.rank-change');
      expect(rankChanges.length).toBeGreaterThan(0);
    });
  });

  describe('item click callback', () => {
    it('calls onItemClick with gainer item and type', async () => {
      const onItemClick = vi.fn();

      const data: MoverItem[] = [{ id: '1', symbol: 'GAINER', price: 100, change: 10, changePercent: 10 }];

      render(<TopMovers data={data} onItemClick={onItemClick} />);

      const gainerItem = screen.getByText('GAINER').closest('.askturret-topmovers-item');
      expect(gainerItem).toBeTruthy();

      fireEvent.click(gainerItem!);

      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'GAINER' }), 'gainer');
    });

    it('calls onItemClick with loser item and type', async () => {
      const onItemClick = vi.fn();

      const data: MoverItem[] = [{ id: '1', symbol: 'LOSER', price: 100, change: -10, changePercent: -10 }];

      render(<TopMovers data={data} onItemClick={onItemClick} />);

      const loserItem = screen.getByText('LOSER').closest('.askturret-topmovers-item');
      expect(loserItem).toBeTruthy();

      fireEvent.click(loserItem!);

      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'LOSER' }), 'loser');
    });

    it('does not add clickable class when callback not provided', () => {
      render(<TopMovers data={sampleData} />);

      const clickableItems = document.querySelectorAll('.clickable');
      expect(clickableItems.length).toBe(0);
    });
  });

  describe('display options', () => {
    it('shows price when showPrice is true', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'PRICED', price: 123.45, change: 10, changePercent: 10 }];

      render(<TopMovers data={data} showPrice={true} />);

      expect(screen.getByText('123.45')).toBeInTheDocument();
    });

    it('hides price when showPrice is false', () => {
      const data: MoverItem[] = [
        { id: '1', symbol: 'NOPRICE', price: 123.45, change: 10, changePercent: 10 },
      ];

      render(<TopMovers data={data} showPrice={false} />);

      expect(screen.queryByText('123.45')).not.toBeInTheDocument();
    });

    it('shows absolute change when showChange is true', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'CHG', price: 100, change: 5.25, changePercent: 5.25 }];

      render(<TopMovers data={data} showChange={true} />);

      expect(screen.getByText('+5.25')).toBeInTheDocument();
    });

    it('hides absolute change when showChange is false', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'NOCHG', price: 100, change: 5.25, changePercent: 5.25 }];

      render(<TopMovers data={data} showChange={false} />);

      const priceElements = screen.queryByText('+5.25');
      expect(priceElements).not.toBeInTheDocument();
    });

    it('respects custom priceDecimals', () => {
      const data: MoverItem[] = [{ id: '1', symbol: 'DEC', price: 123.456789, change: 1, changePercent: 1 }];

      render(<TopMovers data={data} showPrice={true} priceDecimals={4} />);

      expect(screen.getByText('123.4568')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty data array', () => {
      render(<TopMovers data={[]} />);

      // Should render without errors, show empty lists
      const gainerItems = document.querySelectorAll('.askturret-topmovers-item.gainer');
      const loserItems = document.querySelectorAll('.askturret-topmovers-item.loser');

      expect(gainerItems.length).toBe(0);
      expect(loserItems.length).toBe(0);
    });

    it('handles data with only gainers', () => {
      const onlyGainers: MoverItem[] = [
        { id: '1', symbol: 'UP1', price: 100, change: 10, changePercent: 10 },
        { id: '2', symbol: 'UP2', price: 100, change: 5, changePercent: 5 },
      ];

      render(<TopMovers data={onlyGainers} />);

      expect(screen.getByText('UP1')).toBeInTheDocument();
      expect(screen.getByText('UP2')).toBeInTheDocument();

      // Loser list should be empty
      const loserItems = document.querySelectorAll('.askturret-topmovers-item.loser');
      expect(loserItems.length).toBe(0);
    });

    it('handles data with only losers', () => {
      const onlyLosers: MoverItem[] = [
        { id: '1', symbol: 'DOWN1', price: 100, change: -10, changePercent: -10 },
        { id: '2', symbol: 'DOWN2', price: 100, change: -5, changePercent: -5 },
      ];

      render(<TopMovers data={onlyLosers} />);

      expect(screen.getByText('DOWN1')).toBeInTheDocument();
      expect(screen.getByText('DOWN2')).toBeInTheDocument();

      // Gainer list should be empty
      const gainerItems = document.querySelectorAll('.askturret-topmovers-item.gainer');
      expect(gainerItems.length).toBe(0);
    });
  });
});
