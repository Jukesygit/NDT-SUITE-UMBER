/**
 * useTableSort - Custom hook for managing table sort state
 *
 * Usage:
 * const { sortColumn, sortDirection, handleSort } = useTableSort('name', 'asc');
 *
 * <DataTable
 *     sortColumn={sortColumn}
 *     sortDirection={sortDirection}
 *     onSort={handleSort}
 *     ...
 * />
 */

import { useState, useCallback } from 'react';
import type { SortDirection } from './DataTable';

interface UseTableSortReturn {
    /** Currently sorted column key */
    sortColumn: string | undefined;
    /** Current sort direction */
    sortDirection: SortDirection;
    /** Handler to toggle sort - pass to DataTable's onSort prop */
    handleSort: (column: string) => void;
    /** Manually set sort column */
    setSortColumn: (column: string | undefined) => void;
    /** Manually set sort direction */
    setSortDirection: (direction: SortDirection) => void;
    /** Reset sort to initial state */
    resetSort: () => void;
}

/**
 * Hook for managing table sort state
 *
 * @param defaultColumn - Initial column to sort by
 * @param defaultDirection - Initial sort direction ('asc' or 'desc')
 * @returns Sort state and handlers
 *
 * @example
 * function PersonnelTable({ data }) {
 *     const { sortColumn, sortDirection, handleSort } = useTableSort('username', 'asc');
 *
 *     // Sort data based on current sort state
 *     const sortedData = useMemo(() => {
 *         if (!sortColumn) return data;
 *         return [...data].sort((a, b) => {
 *             const aVal = a[sortColumn];
 *             const bVal = b[sortColumn];
 *             const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
 *             return sortDirection === 'asc' ? comparison : -comparison;
 *         });
 *     }, [data, sortColumn, sortDirection]);
 *
 *     return (
 *         <DataTable
 *             data={sortedData}
 *             sortColumn={sortColumn}
 *             sortDirection={sortDirection}
 *             onSort={handleSort}
 *             ...
 *         />
 *     );
 * }
 */
export function useTableSort(
    defaultColumn?: string,
    defaultDirection: SortDirection = 'asc'
): UseTableSortReturn {
    const [sortColumn, setSortColumn] = useState<string | undefined>(defaultColumn);
    const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

    const handleSort = useCallback((column: string) => {
        if (sortColumn === column) {
            // Same column - toggle direction
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            // New column - set to ascending
            setSortColumn(column);
            setSortDirection('asc');
        }
    }, [sortColumn]);

    const resetSort = useCallback(() => {
        setSortColumn(defaultColumn);
        setSortDirection(defaultDirection);
    }, [defaultColumn, defaultDirection]);

    return {
        sortColumn,
        sortDirection,
        handleSort,
        setSortColumn,
        setSortDirection,
        resetSort,
    };
}

export default useTableSort;
