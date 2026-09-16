import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { getNestedValue } from '../utils/nested';
import type { ColumnDef } from '../DataGrid';

const FLASH_DURATION = 800;
const FLASH_CLEANUP_INTERVAL = 1000;

interface FlashEntry {
  direction: 'up' | 'down';
  expiry: number;
}

interface UseFlashDetectionProps<T> {
  enableFlash: boolean;
  columns: ColumnDef<T>[];
}

interface UseFlashDetectionReturn<T> {
  updateFlashForRow: (row: T, rowId: string) => boolean;
  getCellFlashClass: (rowId: string, field: string) => string;
}

/**
 * Hook for tracking and displaying flash animations on cell value changes.
 * Flash detection happens lazily during render (only for visible rows).
 */
export function useFlashDetection<T extends object>({
  enableFlash,
  columns,
}: UseFlashDetectionProps<T>): UseFlashDetectionReturn<T> {
  const flashMapRef = useRef<Map<string, FlashEntry>>(new Map());
  const prevValuesRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  const flashColumns = useMemo(
    () => columns.filter((col) => col.flashOnChange).map((col) => String(col.field)),
    [columns]
  );

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

  // Periodic cleanup of expired flashes
  useEffect(() => {
    if (!enableFlash) return;

    const cleanup = setInterval(() => {
      const now = Date.now();
      let cleaned = false;

      flashMapRef.current.forEach((entry, key) => {
        if (entry.expiry <= now) {
          flashMapRef.current.delete(key);
          cleaned = true;
        }
      });

      if (cleaned) {
        forceUpdate((n) => n + 1);
      }
    }, FLASH_CLEANUP_INTERVAL);

    return () => clearInterval(cleanup);
  }, [enableFlash]);

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
  });

  return {
    updateFlashForRow,
    getCellFlashClass,
  };
}
