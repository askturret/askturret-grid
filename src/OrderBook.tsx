/**
 * OrderBook - Level 2 order book display component
 *
 * Displays bid/ask depth at price levels with:
 * - Visual depth bars showing relative size
 * - Flash highlighting on quantity changes
 * - Spread indicator
 * - Click-to-select price levels
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { formatPrice, formatQuantity } from './utils/formatters';

// Constants
const FLASH_DURATION = 800;

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders?: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastPrice?: number;
  spread?: number;
}

export interface OrderBookProps {
  /** Order book data with bids and asks */
  data: OrderBookData;
  /** Number of price levels to show per side (default: 10) */
  levels?: number;
  /** Price decimal places (default: 2) */
  priceDecimals?: number;
  /** Quantity decimal places (default: 0) */
  quantityDecimals?: number;
  /** Show spread indicator between bid/ask (default: true) */
  showSpread?: boolean;
  /** Show depth bars (default: true) */
  showDepthBars?: boolean;
  /** Show order count column (default: false) */
  showOrderCount?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Callback when price level clicked */
  onPriceClick?: (price: number, side: 'bid' | 'ask') => void;
  /** Flash on quantity changes (default: true) */
  flashOnChange?: boolean;
  /** Container CSS class */
  className?: string;
}

interface FlashState {
  direction: 'up' | 'down';
  expiry: number;
}

export function OrderBook({
  data,
  levels = 10,
  priceDecimals = 2,
  quantityDecimals = 0,
  showSpread = true,
  showDepthBars = true,
  showOrderCount = false,
  compact = false,
  onPriceClick,
  flashOnChange = true,
  className = '',
}: OrderBookProps) {
  // Flash tracking
  const prevQuantitiesRef = useRef<Map<string, number>>(new Map());
  const flashMapRef = useRef<Map<string, FlashState>>(new Map());
  const [, forceUpdate] = React.useState(0);

  // Slice data to requested levels
  const visibleBids = useMemo(() => data.bids.slice(0, levels), [data.bids, levels]);
  const visibleAsks = useMemo(() => data.asks.slice(0, levels), [data.asks, levels]);

  // Calculate max quantity for depth bar scaling
  const maxQuantity = useMemo(() => {
    const allQuantities = [...visibleBids, ...visibleAsks].map((l) => l.quantity);
    return Math.max(...allQuantities, 1);
  }, [visibleBids, visibleAsks]);

  // Calculate spread
  const spread = useMemo(() => {
    if (data.spread !== undefined) return data.spread;
    const firstAsk = visibleAsks[0];
    const firstBid = visibleBids[0];
    if (firstAsk && firstBid) {
      return firstAsk.price - firstBid.price;
    }
    return 0;
  }, [data.spread, visibleAsks, visibleBids]);

  const spreadPercent = useMemo(() => {
    const firstBid = visibleBids[0];
    if (firstBid && spread > 0) {
      return (spread / firstBid.price) * 100;
    }
    return 0;
  }, [spread, visibleBids]);

  // Flash detection
  useEffect(() => {
    if (!flashOnChange) return;

    const now = Date.now();
    const prevQuantities = prevQuantitiesRef.current;
    const flashMap = flashMapRef.current;
    let hasNewFlash = false;

    // Check bids
    for (const level of visibleBids) {
      const key = `bid-${level.price}`;
      const prevQty = prevQuantities.get(key);
      if (prevQty !== undefined && prevQty !== level.quantity) {
        flashMap.set(key, {
          direction: level.quantity > prevQty ? 'up' : 'down',
          expiry: now + FLASH_DURATION,
        });
        hasNewFlash = true;
      }
      prevQuantities.set(key, level.quantity);
    }

    // Check asks
    for (const level of visibleAsks) {
      const key = `ask-${level.price}`;
      const prevQty = prevQuantities.get(key);
      if (prevQty !== undefined && prevQty !== level.quantity) {
        flashMap.set(key, {
          direction: level.quantity > prevQty ? 'up' : 'down',
          expiry: now + FLASH_DURATION,
        });
        hasNewFlash = true;
      }
      prevQuantities.set(key, level.quantity);
    }

    if (hasNewFlash) {
      forceUpdate((n) => n + 1);
    }
  }, [visibleBids, visibleAsks, flashOnChange]);

  // Cleanup expired flashes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const flashMap = flashMapRef.current;
      let hasExpired = false;

      for (const [key, flash] of flashMap) {
        if (flash.expiry < now) {
          flashMap.delete(key);
          hasExpired = true;
        }
      }

      if (hasExpired) {
        forceUpdate((n) => n + 1);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Get flash class for a level
  const getFlashClass = (side: 'bid' | 'ask', price: number): string => {
    const key = `${side}-${price}`;
    const flash = flashMapRef.current.get(key);
    if (!flash) return '';
    return flash.direction === 'up' ? 'flash-up' : 'flash-down';
  };

  // Render a single level row
  const renderLevel = (level: OrderBookLevel, side: 'bid' | 'ask', index: number) => {
    const depthPercent = (level.quantity / maxQuantity) * 100;
    const flashClass = getFlashClass(side, level.price);
    const isBid = side === 'bid';

    return (
      <div
        key={`${side}-${level.price}`}
        className={`askturret-orderbook-row ${side} ${flashClass} ${onPriceClick ? 'clickable' : ''}`}
        onClick={() => onPriceClick?.(level.price, side)}
      >
        {showDepthBars && (
          <div
            className={`askturret-orderbook-depth-bar ${side}`}
            style={{
              width: `${depthPercent}%`,
              [isBid ? 'right' : 'left']: 0,
            }}
          />
        )}
        {isBid ? (
          <>
            {showOrderCount && <span className="askturret-orderbook-orders">{level.orders ?? '—'}</span>}
            <span className="askturret-orderbook-qty">
              {formatQuantity(level.quantity, quantityDecimals)}
            </span>
            <span className="askturret-orderbook-price bid">{formatPrice(level.price, priceDecimals)}</span>
          </>
        ) : (
          <>
            <span className="askturret-orderbook-price ask">{formatPrice(level.price, priceDecimals)}</span>
            <span className="askturret-orderbook-qty">
              {formatQuantity(level.quantity, quantityDecimals)}
            </span>
            {showOrderCount && <span className="askturret-orderbook-orders">{level.orders ?? '—'}</span>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`askturret-orderbook ${compact ? 'compact' : ''} ${className}`}>
      {/* Header */}
      <div className="askturret-orderbook-header">
        <span className="askturret-orderbook-header-side bid">Bid</span>
        <span className="askturret-orderbook-header-price">Price</span>
        <span className="askturret-orderbook-header-side ask">Ask</span>
      </div>

      {/* Asks (reversed so best ask is at bottom, near spread) */}
      <div className="askturret-orderbook-asks">
        {[...visibleAsks].reverse().map((level, i) => renderLevel(level, 'ask', i))}
      </div>

      {/* Spread indicator */}
      {showSpread && (
        <div className="askturret-orderbook-spread">
          <span className="askturret-orderbook-spread-label">Spread</span>
          <span className="askturret-orderbook-spread-value">
            {formatPrice(spread, priceDecimals)} ({spreadPercent.toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Bids (best bid at top, near spread) */}
      <div className="askturret-orderbook-bids">
        {visibleBids.map((level, i) => renderLevel(level, 'bid', i))}
      </div>
    </div>
  );
}
