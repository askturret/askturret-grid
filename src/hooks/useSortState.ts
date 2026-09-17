import { useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  field: string | null;
  direction: SortDirection;
}

export interface UseSortStateReturn {
  sort: SortState;
  handleSort: (field: string) => void;
}

/**
 * Hook for managing sort state.
 *
 * Extracted from DataGrid.tsx per Architect's refactor plan (#33).
 * Manages sort field and direction with cycle: asc → desc → null.
 *
 * Note (R2): Does NOT clear leaving rows — parent orchestrates that by
 * calling useRowExit's clearLeaving() after this hook's handleSort.
 */
export function useSortState(): UseSortStateReturn {
  const [sort, setSort] = useState<SortState>({ field: null, direction: null });

  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev.field !== field) {
        return { field, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      return { field: null, direction: null };
    });
  };

  return {
    sort,
    handleSort,
  };
}
