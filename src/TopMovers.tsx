/**
 * TopMovers - Shows top gainers and losers with periodic ranking updates
 *
 * Unlike real-time re-sorting grids, this component:
 * - Updates rankings on a configurable interval (not every tick)
 * - Provides stable display between updates
 * - Flashes when rankings change
 * - Designed as a compact widget alongside main grids
 */

import React, { useState, useEffect, useRef } from 'react';
import { formatPrice } from './utils/formatters';

export interface MoverItem {
  /** Unique identifier */
  id: string;
  /** Display symbol */
  symbol: string;
  /** Current price */
  price: number;
  /** Change value (absolute) */
  change: number;
  /** Change percentage */
  changePercent: number;
}

export interface TopMoversProps {
  /** Array of items to rank */
  data: MoverItem[];
  /** Number of top gainers to show (default: 5) */
  gainersCount?: number;
  /** Number of top losers to show (default: 5) */
  losersCount?: number;
  /** How often to update rankings in ms (default: 5000) */
  updateInterval?: number;
  /** Show price column (default: true) */
  showPrice?: boolean;
  /** Show absolute change (default: false) */
  showChange?: boolean;
  /** Price decimal places (default: 2) */
  priceDecimals?: number;
  /** Callback when item is clicked */
  onItemClick?: (item: MoverItem, type: 'gainer' | 'loser') => void;
  /** Show section headers (default: true) */
  showHeaders?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Container CSS class */
  className?: string;
}

interface RankedItem extends MoverItem {
  rank: number;
  previousRank?: number;
}

const FLASH_DURATION = 1500;

export function TopMovers({
  data,
  gainersCount = 5,
  losersCount = 5,
  updateInterval = 5000,
  showPrice = true,
  showChange = false,
  priceDecimals = 2,
  onItemClick,
  showHeaders = true,
  compact = false,
  className = '',
}: TopMoversProps) {
  // Current displayed rankings (only updates on interval)
  const [gainers, setGainers] = useState<RankedItem[]>([]);
  const [losers, setLosers] = useState<RankedItem[]>([]);

  // Track previous rankings for flash detection
  const prevGainersRef = useRef<Map<string, number>>(new Map());
  const prevLosersRef = useRef<Map<string, number>>(new Map());

  // Store current props in refs so interval callback uses latest values
  const dataRef = useRef(data);
  const gainersCountRef = useRef(gainersCount);
  const losersCountRef = useRef(losersCount);

  // Update refs when props change
  useEffect(() => {
    dataRef.current = data;
    gainersCountRef.current = gainersCount;
    losersCountRef.current = losersCount;
  }, [data, gainersCount, losersCount]);

  // Flash state
  const [flashedItems, setFlashedItems] = useState<Set<string>>(new Set());

  // Update rankings on interval
  useEffect(() => {
    const updateRankings = () => {
      // Calculate rankings from current data (use refs to get latest values)
      const sorted = [...dataRef.current].sort((a, b) => b.changePercent - a.changePercent);

      const newGainers: RankedItem[] = sorted
        .filter((item) => item.changePercent > 0)
        .slice(0, gainersCountRef.current)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          previousRank: prevGainersRef.current.get(item.id),
        }));

      const newLosers: RankedItem[] = sorted
        .filter((item) => item.changePercent < 0)
        .reverse()
        .slice(0, losersCountRef.current)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          previousRank: prevLosersRef.current.get(item.id),
        }));

      // Detect ranking changes for flash
      const newFlashed = new Set<string>();

      for (const item of newGainers) {
        const prevRank = prevGainersRef.current.get(item.id);
        if (prevRank !== undefined && prevRank !== item.rank) {
          newFlashed.add(`gainer-${item.id}`);
        }
      }

      for (const item of newLosers) {
        const prevRank = prevLosersRef.current.get(item.id);
        if (prevRank !== undefined && prevRank !== item.rank) {
          newFlashed.add(`loser-${item.id}`);
        }
      }

      // Update previous rankings
      prevGainersRef.current.clear();
      for (const item of newGainers) {
        prevGainersRef.current.set(item.id, item.rank);
      }

      prevLosersRef.current.clear();
      for (const item of newLosers) {
        prevLosersRef.current.set(item.id, item.rank);
      }

      setGainers(newGainers);
      setLosers(newLosers);

      if (newFlashed.size > 0) {
        setFlashedItems(newFlashed);
        setTimeout(() => setFlashedItems(new Set()), FLASH_DURATION);
      }
    };

    // Initial update
    updateRankings();

    // Periodic updates
    const interval = setInterval(updateRankings, updateInterval);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateInterval]);

  const renderItem = (item: RankedItem, type: 'gainer' | 'loser') => {
    const key = `${type}-${item.id}`;
    const isFlashed = flashedItems.has(key);
    const rankChange = item.previousRank !== undefined ? item.previousRank - item.rank : 0;

    return (
      <div
        key={key}
        className={`askturret-topmovers-item ${type} ${isFlashed ? 'flash' : ''} ${onItemClick ? 'clickable' : ''}`}
        onClick={() => onItemClick?.(item, type)}
      >
        <span className="askturret-topmovers-rank">
          {item.rank}
          {rankChange !== 0 && (
            <span className={`rank-change ${rankChange > 0 ? 'up' : 'down'}`}>
              {rankChange > 0 ? '↑' : '↓'}
            </span>
          )}
        </span>
        <span className="askturret-topmovers-symbol">{item.symbol}</span>
        {showPrice && (
          <span className="askturret-topmovers-price">{formatPrice(item.price, priceDecimals)}</span>
        )}
        {showChange && (
          <span className={`askturret-topmovers-change ${type}`}>
            {item.change >= 0 ? '+' : ''}
            {formatPrice(item.change, priceDecimals)}
          </span>
        )}
        <span className={`askturret-topmovers-percent ${type}`}>
          {item.changePercent >= 0 ? '+' : ''}
          {item.changePercent.toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div className={`askturret-topmovers ${compact ? 'compact' : ''} ${className}`}>
      {/* Gainers */}
      <div className="askturret-topmovers-section gainers">
        {showHeaders && <div className="askturret-topmovers-header gainers">Top Gainers</div>}
        <div className="askturret-topmovers-list">
          {gainers.length > 0 ? (
            gainers.map((item) => renderItem(item, 'gainer'))
          ) : (
            <div className="askturret-topmovers-empty">No gainers</div>
          )}
        </div>
      </div>

      {/* Losers */}
      <div className="askturret-topmovers-section losers">
        {showHeaders && <div className="askturret-topmovers-header losers">Top Losers</div>}
        <div className="askturret-topmovers-list">
          {losers.length > 0 ? (
            losers.map((item) => renderItem(item, 'loser'))
          ) : (
            <div className="askturret-topmovers-empty">No losers</div>
          )}
        </div>
      </div>
    </div>
  );
}
