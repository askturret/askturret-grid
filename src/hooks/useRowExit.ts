import { useRef, useState, useEffect, useMemo } from 'react';

export interface UseRowExitParams<T> {
  sortedData: T[];
  rowExitDuration: number;
  getRowKey: (row: T) => string;
  filter: string;
  columnOrder: string[];
}

export interface UseRowExitReturn<T> {
  mergedData: Array<{ row: T; isLeaving: boolean }>;
  leavingRowsSize: number;
  clearLeaving: () => void;
}

/**
 * Hook for managing row-exit lifecycle.
 *
 * Extracted from DataGrid.tsx per Architect's refactor plan (#33).
 * Manages leaving rows state (rows removed from data but still mounted for
 * rowExitDuration to allow CSS exit animations). Detects removed rows via
 * diff against previous sortedData, clears on context changes (filter/order),
 * and periodically cleans up expired entries.
 *
 * R4 PRESERVED: prevSortedDataRef write on BOTH branches of the diff effect.
 * The early-return path (rowExitDuration === 0) still assigns
 * prevSortedDataRef.current = sortedData. Without this, flipping rowExitDuration
 * from 0 → non-zero mid-session runs a stale diff and floods leavingRowsRef.
 */
export function useRowExit<T>({
  sortedData,
  rowExitDuration,
  getRowKey,
  filter,
  columnOrder,
}: UseRowExitParams<T>): UseRowExitReturn<T> {
  const leavingRowsRef = useRef<Map<string, { row: T; snapshotIndex: number; expiry: number }>>(new Map());
  const [leavingRowsVersion, setLeavingRowsVersion] = useState(0);
  const [, forceUpdate] = useState(0);

  // Track previous sortedData for row-exit diff
  const prevSortedDataRef = useRef<T[]>([]);

  // Build merged view: sortedData + leaving rows at their snapshot positions
  const mergedData = useMemo(() => {
    if (rowExitDuration === 0 || leavingRowsRef.current.size === 0) {
      // Zero-cost passthrough: wrap in {row, isLeaving: false} for consistency
      return sortedData.map((row) => ({ row, isLeaving: false }));
    }

    // Start with sortedData
    const result: Array<{ row: T; isLeaving: boolean }> = sortedData.map((row) => ({
      row,
      isLeaving: false,
    }));

    // Splice leaving rows back in at their snapshot positions
    const leavingEntries = Array.from(leavingRowsRef.current.values()).sort(
      (a, b) => a.snapshotIndex - b.snapshotIndex
    );

    leavingEntries.forEach((entry) => {
      // Clamp index to [0, result.length] to handle edge cases
      const index = Math.max(0, Math.min(entry.snapshotIndex, result.length));
      result.splice(index, 0, { row: entry.row, isLeaving: true });
    });

    return result;
  }, [sortedData, rowExitDuration, leavingRowsVersion]);

  // Periodic cleanup of expired leaving rows
  useEffect(() => {
    if (rowExitDuration === 0) return;

    const cleanup = setInterval(() => {
      const now = Date.now();
      let cleaned = false;

      leavingRowsRef.current.forEach((entry, key) => {
        if (entry.expiry <= now) {
          leavingRowsRef.current.delete(key);
          cleaned = true;
        }
      });

      if (cleaned) {
        forceUpdate((n) => n + 1);
        setLeavingRowsVersion((v) => v + 1);
      }
    }, 1000); // LEAVING_ROWS_CLEANUP_INTERVAL

    return () => clearInterval(cleanup);
  }, [rowExitDuration]);

  // Clear leaving rows on filter or columnOrder change (context change)
  useEffect(() => {
    if (rowExitDuration > 0 && leavingRowsRef.current.size > 0) {
      leavingRowsRef.current.clear();
      setLeavingRowsVersion((v) => v + 1);
    }
  }, [filter, columnOrder, rowExitDuration]);

  // R4: Row-exit diff effect with DUAL-BRANCH prevSortedDataRef write
  useEffect(() => {
    // R4: Skip if rowExitDuration is 0, but STILL write prevSortedDataRef
    // (without this, flipping rowExitDuration 0→non-zero runs stale diff)
    if (rowExitDuration === 0) {
      prevSortedDataRef.current = sortedData;
      return;
    }

    const prevData = prevSortedDataRef.current;
    const currentData = sortedData;
    prevSortedDataRef.current = currentData; // R4: Write on main branch too

    // Build sets of current row keys for fast lookup
    const currentKeys = new Set(currentData.map((row) => getRowKey(row)));
    const now = Date.now();
    let changed = false;

    // Detect removed rows (in prev but not in current)
    prevData.forEach((row, index) => {
      const key = getRowKey(row);
      if (!currentKeys.has(key)) {
        // Row was removed - add to leaving state
        if (!leavingRowsRef.current.has(key)) {
          leavingRowsRef.current.set(key, {
            row,
            snapshotIndex: index,
            expiry: now + rowExitDuration,
          });
          changed = true;
        }
      }
    });

    // Cancel leaving state for rows that reappeared
    leavingRowsRef.current.forEach((entry, key) => {
      if (currentKeys.has(key)) {
        leavingRowsRef.current.delete(key);
        changed = true;
      }
    });

    // Cap leavingRowsRef at 1000 entries (memory safety)
    if (leavingRowsRef.current.size > 1000) {
      const entries = Array.from(leavingRowsRef.current.entries());
      const toDelete = entries.slice(0, entries.length - 1000);
      toDelete.forEach(([key]) => {
        leavingRowsRef.current.delete(key);
      });
      changed = true;
    }

    if (changed) {
      setLeavingRowsVersion((v) => v + 1);
    }
  }, [sortedData, rowExitDuration, getRowKey]);

  // clearLeaving function for parent orchestration (R2 - used by handleSort)
  const clearLeaving = () => {
    if (rowExitDuration > 0 && leavingRowsRef.current.size > 0) {
      leavingRowsRef.current.clear();
      setLeavingRowsVersion((v) => v + 1);
    }
  };

  return {
    mergedData,
    leavingRowsSize: leavingRowsRef.current.size,
    clearLeaving,
  };
}
