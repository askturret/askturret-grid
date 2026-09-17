/**
 * TimeSales - Trade tape component
 *
 * Displays executed trades chronologically with:
 * - Flash highlighting on new trades
 * - Tick direction indicator (price up/down)
 * - Large trade highlighting
 * - Auto-scroll to latest trades
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { formatPrice, formatQuantity, formatTime } from './utils/formatters';

// Constants
const FLASH_DURATION = 800;

export interface Trade {
  /** Unique trade identifier */
  id: string | number;
  /** Trade timestamp (Unix ms) */
  timestamp: number;
  /** Trade side - buy or sell */
  side: 'buy' | 'sell';
  /** Trade price */
  price: number;
  /** Trade quantity */
  quantity: number;
  /** Trading symbol (optional) */
  symbol?: string;
}

export interface TimeSalesProps {
  /** Array of trades (newest first) */
  trades: Trade[];
  /** Maximum number of trades to display (default: 100) */
  maxTrades?: number;
  /** Show tick direction indicator (default: false) */
  showTickDirection?: boolean;
  /** Flash highlight new trades (default: true) */
  flashOnNew?: boolean;
  /** Auto-scroll to show latest trades (default: true) */
  autoScroll?: boolean;
  /** Highlight trades above this quantity (optional) */
  largeTradeThreshold?: number;
  /** Price decimal places (default: 2) */
  priceDecimals?: number;
  /** Quantity decimal places (default: 0) */
  quantityDecimals?: number;
  /** Callback when trade row is clicked */
  onTradeClick?: (trade: Trade) => void;
  /** Show column headers (default: true) */
  showHeader?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Container CSS class */
  className?: string;
}

interface FlashState {
  expiry: number;
}

export function TimeSales({
  trades,
  maxTrades = 100,
  showTickDirection = false,
  flashOnNew = true,
  autoScroll = true,
  largeTradeThreshold,
  priceDecimals = 2,
  quantityDecimals = 0,
  onTradeClick,
  showHeader = true,
  compact = false,
  className = '',
}: TimeSalesProps) {
  // Flash tracking
  const seenIdsRef = useRef<Set<string | number>>(new Set());
  const flashMapRef = useRef<Map<string | number, FlashState>>(new Map());
  const [, forceUpdate] = React.useState(0);

  // Container ref for auto-scroll
  const containerRef = useRef<HTMLDivElement>(null);

  // Slice data to max trades
  const visibleTrades = useMemo(() => trades.slice(0, maxTrades), [trades, maxTrades]);

  // Build price map for tick direction (compare to previous trade)
  const tickDirections = useMemo(() => {
    if (!showTickDirection) return new Map<string | number, 'up' | 'down' | 'none'>();

    const directions = new Map<string | number, 'up' | 'down' | 'none'>();
    for (let i = 0; i < visibleTrades.length; i++) {
      const trade = visibleTrades[i];
      if (!trade) continue;
      const nextTrade = visibleTrades[i + 1]; // Previous in time (array is newest-first)
      if (nextTrade) {
        if (trade.price > nextTrade.price) {
          directions.set(trade.id, 'up');
        } else if (trade.price < nextTrade.price) {
          directions.set(trade.id, 'down');
        } else {
          directions.set(trade.id, 'none');
        }
      } else {
        directions.set(trade.id, 'none');
      }
    }
    return directions;
  }, [visibleTrades, showTickDirection]);

  // Flash detection for new trades
  useEffect(() => {
    if (!flashOnNew) return;

    const now = Date.now();
    const seenIds = seenIdsRef.current;
    const flashMap = flashMapRef.current;
    let hasNewFlash = false;

    for (const trade of visibleTrades) {
      if (!seenIds.has(trade.id)) {
        seenIds.add(trade.id);
        flashMap.set(trade.id, { expiry: now + FLASH_DURATION });
        hasNewFlash = true;
      }
    }

    // Clean up old IDs to prevent memory leak
    const visibleIds = new Set(visibleTrades.map((t) => t.id));
    for (const id of seenIds) {
      if (!visibleIds.has(id)) {
        seenIds.delete(id);
      }
    }

    if (hasNewFlash) {
      forceUpdate((n) => n + 1);
    }
  }, [visibleTrades, flashOnNew]);

  // Cleanup expired flashes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const flashMap = flashMapRef.current;
      let hasExpired = false;

      for (const [id, flash] of flashMap) {
        if (flash.expiry < now) {
          flashMap.delete(id);
          hasExpired = true;
        }
      }

      if (hasExpired) {
        forceUpdate((n) => n + 1);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to top when new trades arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [visibleTrades, autoScroll]);

  // Get flash class for a trade
  const getFlashClass = (tradeId: string | number): string => {
    const flash = flashMapRef.current.get(tradeId);
    return flash ? 'flash-new' : '';
  };

  // Get tick direction indicator
  const getTickIndicator = (tradeId: string | number): string => {
    if (!showTickDirection) return '';
    const direction = tickDirections.get(tradeId);
    if (direction === 'up') return '▲';
    if (direction === 'down') return '▼';
    return '—';
  };

  // Render a single trade row
  const renderTrade = (trade: Trade) => {
    const flashClass = getFlashClass(trade.id);
    const isLarge = largeTradeThreshold !== undefined && trade.quantity >= largeTradeThreshold;
    const tickIndicator = getTickIndicator(trade.id);
    const tickDirection = tickDirections.get(trade.id) || 'none';

    return (
      <div
        key={trade.id}
        className={`askturret-timesales-trade ${trade.side} ${flashClass} ${isLarge ? 'large' : ''} ${onTradeClick ? 'clickable' : ''}`}
        onClick={() => onTradeClick?.(trade)}
      >
        <span className="askturret-timesales-time">{formatTime(trade.timestamp, 'HH:mm:ss.SSS')}</span>
        {showTickDirection && (
          <span className={`askturret-timesales-tick ${tickDirection}`}>{tickIndicator}</span>
        )}
        <span className={`askturret-timesales-side ${trade.side}`}>{trade.side.toUpperCase()}</span>
        <span className="askturret-timesales-price">{formatPrice(trade.price, priceDecimals)}</span>
        <span className="askturret-timesales-qty">{formatQuantity(trade.quantity, quantityDecimals)}</span>
      </div>
    );
  };

  return (
    <div className={`askturret-timesales ${compact ? 'compact' : ''} ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="askturret-timesales-header">
          <span className="askturret-timesales-header-time">Time</span>
          {showTickDirection && <span className="askturret-timesales-header-tick">Tick</span>}
          <span className="askturret-timesales-header-side">Side</span>
          <span className="askturret-timesales-header-price">Price</span>
          <span className="askturret-timesales-header-qty">Qty</span>
        </div>
      )}

      {/* Trade list */}
      <div className="askturret-timesales-body" ref={containerRef}>
        {visibleTrades.length === 0 ? (
          <div className="askturret-timesales-empty">No trades</div>
        ) : (
          visibleTrades.map(renderTrade)
        )}
      </div>
    </div>
  );
}
