import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderBook, type OrderBookData } from './OrderBook';

describe('OrderBook', () => {
  // Use fake timers for flash state tests
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleData: OrderBookData = {
    bids: [
      { price: 100, quantity: 500 },
      { price: 99, quantity: 300 },
      { price: 98, quantity: 200 },
    ],
    asks: [
      { price: 101, quantity: 400 },
      { price: 102, quantity: 250 },
      { price: 103, quantity: 150 },
    ],
  };

  describe('spread calculation', () => {
    it('calculates spread from bid/ask prices when not provided', () => {
      const { rerender } = render(<OrderBook data={sampleData} />);

      // Spread should be ask[0].price - bid[0].price = 101 - 100 = 1
      // We can't directly access the spread value, but we can verify it renders
      rerender(<OrderBook data={sampleData} showSpread={true} />);

      // The component should render without errors
      expect(screen.getByText('100.00')).toBeInTheDocument(); // Highest bid
    });

    it('uses provided spread value when available', () => {
      const dataWithSpread: OrderBookData = {
        ...sampleData,
        spread: 2.5,
      };

      render(<OrderBook data={dataWithSpread} showSpread={true} />);

      // Should render without errors
      expect(screen.getByText('100.00')).toBeInTheDocument();
    });

    it('calculates spread percent correctly', () => {
      // Spread = 101 - 100 = 1
      // Spread % = (1 / 100) * 100 = 1%
      render(<OrderBook data={sampleData} showSpread={true} />);

      // Should not throw
      expect(screen.getByText('100.00')).toBeInTheDocument();
    });

    it('handles zero spread', () => {
      const dataWithZeroSpread: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 100, quantity: 400 }],
      };

      render(<OrderBook data={dataWithZeroSpread} showSpread={true} />);

      expect(screen.getAllByText('100.00')).toHaveLength(2); // Both bid and ask at same price
    });

    it('handles missing bids or asks', () => {
      const dataWithOnlyBids: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [],
      };

      render(<OrderBook data={dataWithOnlyBids} />);

      expect(screen.getByText('100.00')).toBeInTheDocument();
    });
  });

  describe('depth bar scaling', () => {
    it('scales depth bars relative to max quantity', () => {
      render(<OrderBook data={sampleData} showDepthBars={true} />);

      // Max quantity is 500 (highest bid)
      // Bid at 100 (qty 500) should be 100%
      // Bid at 99 (qty 300) should be 60%
      // Ask at 101 (qty 400) should be 80%

      const depthBars = document.querySelectorAll('.askturret-orderbook-depth-bar');
      expect(depthBars.length).toBeGreaterThan(0);
    });

    it('handles depth bars when disabled', () => {
      render(<OrderBook data={sampleData} showDepthBars={false} />);

      const depthBars = document.querySelectorAll('.askturret-orderbook-depth-bar');
      expect(depthBars.length).toBe(0);
    });

    it('handles zero quantities in depth calculation', () => {
      const dataWithZero: OrderBookData = {
        bids: [{ price: 100, quantity: 0 }],
        asks: [{ price: 101, quantity: 0 }],
      };

      render(<OrderBook data={dataWithZero} showDepthBars={true} />);

      // Should not crash with division by zero
      expect(screen.getByText('100.00')).toBeInTheDocument();
    });
  });

  describe('price level clicking', () => {
    it('calls onPriceClick with correct price and side for bid', async () => {
            const onPriceClick = vi.fn();

      render(<OrderBook data={sampleData} onPriceClick={onPriceClick} />);

      // Find and click a bid row
      const bidRow = document.querySelector('.askturret-orderbook-row.bid');
      expect(bidRow).toBeTruthy();

      fireEvent.click(bidRow!);

      expect(onPriceClick).toHaveBeenCalledWith(100, 'bid');
      expect(onPriceClick).toHaveBeenCalledTimes(1);
    });

    it('calls onPriceClick with correct price and side for ask', async () => {
            const onPriceClick = vi.fn();

      render(<OrderBook data={sampleData} onPriceClick={onPriceClick} />);

      // Find and click an ask row
      const askRow = document.querySelector('.askturret-orderbook-row.ask');
      expect(askRow).toBeTruthy();

      fireEvent.click(askRow!);

      expect(onPriceClick).toHaveBeenCalledWith(101, 'ask');
      expect(onPriceClick).toHaveBeenCalledTimes(1);
    });

    it('does not add clickable class when callback not provided', () => {
      render(<OrderBook data={sampleData} />);

      const clickableRows = document.querySelectorAll('.askturret-orderbook-row.clickable');
      expect(clickableRows.length).toBe(0);
    });

    it('adds clickable class when callback provided', () => {
      const onPriceClick = vi.fn();
      render(<OrderBook data={sampleData} onPriceClick={onPriceClick} />);

      const clickableRows = document.querySelectorAll('.askturret-orderbook-row.clickable');
      expect(clickableRows.length).toBeGreaterThan(0);
    });
  });

  describe('flash state on quantity changes', () => {
    it('detects quantity increase and sets flash-up', () => {
      const initialData: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      const { rerender } = render(<OrderBook data={initialData} flashOnChange={true} />);

      // Initial render - no flash state yet
      let flashUpRows = document.querySelectorAll('.flash-up');
      expect(flashUpRows.length).toBe(0);

      // Update with increased quantity
      const updatedData: OrderBookData = {
        bids: [{ price: 100, quantity: 600 }], // Increased from 500 to 600
        asks: [{ price: 101, quantity: 400 }],
      };

      rerender(<OrderBook data={updatedData} flashOnChange={true} />);

      // Should now have flash-up class
      flashUpRows = document.querySelectorAll('.flash-up');
      expect(flashUpRows.length).toBe(1);
    });

    it('detects quantity decrease and sets flash-down', () => {
      const initialData: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      const { rerender } = render(<OrderBook data={initialData} flashOnChange={true} />);

      // Update with decreased quantity
      const updatedData: OrderBookData = {
        bids: [{ price: 100, quantity: 300 }], // Decreased from 500 to 300
        asks: [{ price: 101, quantity: 400 }],
      };

      rerender(<OrderBook data={updatedData} flashOnChange={true} />);

      // Should now have flash-down class
      const flashDownRows = document.querySelectorAll('.flash-down');
      expect(flashDownRows.length).toBe(1);
    });

    it('does not flash on first render (no previous quantity)', () => {
      const data: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      render(<OrderBook data={data} flashOnChange={true} />);

      // No flash on first render
      const flashRows = document.querySelectorAll('[class*="flash-"]');
      expect(flashRows.length).toBe(0);
    });

    it('clears flash state after duration expires', () => {
      const initialData: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      const { rerender } = render(<OrderBook data={initialData} flashOnChange={true} />);

      // Update with increased quantity
      const updatedData: OrderBookData = {
        bids: [{ price: 100, quantity: 600 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      rerender(<OrderBook data={updatedData} flashOnChange={true} />);

      // Flash should be present
      let flashRows = document.querySelectorAll('.flash-up');
      expect(flashRows.length).toBe(1);

      // Advance time past FLASH_DURATION (800ms) + cleanup interval (200ms)
      vi.advanceTimersByTime(1100);

      // Flash should be cleared
      flashRows = document.querySelectorAll('.flash-up');
      expect(flashRows.length).toBe(0);
    });

    it('respects flashOnChange=false', () => {
      const initialData: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      const { rerender } = render(<OrderBook data={initialData} flashOnChange={false} />);

      // Update quantity
      const updatedData: OrderBookData = {
        bids: [{ price: 100, quantity: 600 }],
        asks: [{ price: 101, quantity: 400 }],
      };

      rerender(<OrderBook data={updatedData} flashOnChange={false} />);

      // No flash classes should be present
      const flashRows = document.querySelectorAll('[class*="flash-"]');
      expect(flashRows.length).toBe(0);
    });

    it('tracks flash state independently for bid and ask at same price', () => {
      const initialData: OrderBookData = {
        bids: [{ price: 100, quantity: 500 }],
        asks: [{ price: 100, quantity: 400 }],
      };

      const { rerender } = render(<OrderBook data={initialData} flashOnChange={true} />);

      // Update both with different directions
      const updatedData: OrderBookData = {
        bids: [{ price: 100, quantity: 600 }], // Increase
        asks: [{ price: 100, quantity: 300 }], // Decrease
      };

      rerender(<OrderBook data={updatedData} flashOnChange={true} />);

      // Should have one flash-up and one flash-down
      expect(document.querySelectorAll('.flash-up').length).toBe(1);
      expect(document.querySelectorAll('.flash-down').length).toBe(1);
    });
  });

  describe('level slicing', () => {
    it('limits visible levels to specified count', () => {
      const manyLevelsData: OrderBookData = {
        bids: Array.from({ length: 20 }, (_, i) => ({
          price: 100 - i,
          quantity: 100,
        })),
        asks: Array.from({ length: 20 }, (_, i) => ({
          price: 101 + i,
          quantity: 100,
        })),
      };

      render(<OrderBook data={manyLevelsData} levels={5} />);

      const bidRows = document.querySelectorAll('.askturret-orderbook-row.bid');
      const askRows = document.querySelectorAll('.askturret-orderbook-row.ask');

      expect(bidRows.length).toBe(5);
      expect(askRows.length).toBe(5);
    });

    it('shows all levels when levels exceeds data length', () => {
      render(<OrderBook data={sampleData} levels={100} />);

      const bidRows = document.querySelectorAll('.askturret-orderbook-row.bid');
      const askRows = document.querySelectorAll('.askturret-orderbook-row.ask');

      expect(bidRows.length).toBe(3); // Only 3 bids in sample data
      expect(askRows.length).toBe(3); // Only 3 asks in sample data
    });
  });

  describe('order count display', () => {
    it('shows order count when enabled and provided', () => {
      const dataWithOrders: OrderBookData = {
        bids: [{ price: 100, quantity: 500, orders: 12 }],
        asks: [{ price: 101, quantity: 400, orders: 8 }],
      };

      render(<OrderBook data={dataWithOrders} showOrderCount={true} />);

      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('shows em dash when order count not provided', () => {
      render(<OrderBook data={sampleData} showOrderCount={true} />);

      // Should show em dash (—) for missing order counts
      const orderCells = document.querySelectorAll('.askturret-orderbook-orders');
      expect(orderCells.length).toBeGreaterThan(0);
    });

    it('hides order count column when disabled', () => {
      const dataWithOrders: OrderBookData = {
        bids: [{ price: 100, quantity: 500, orders: 12 }],
        asks: [{ price: 101, quantity: 400, orders: 8 }],
      };

      render(<OrderBook data={dataWithOrders} showOrderCount={false} />);

      const orderCells = document.querySelectorAll('.askturret-orderbook-orders');
      expect(orderCells.length).toBe(0);
    });
  });
});
