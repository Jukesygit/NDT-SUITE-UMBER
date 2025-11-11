import { useState, useMemo } from 'react';

/**
 * Hook return type
 */
interface UsePaginationReturn<T> {
    currentPage: number;
    totalPages: number;
    paginatedData: T[];
    goToPage: (page: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    canGoNext: boolean;
    canGoPrev: boolean;
    startIndex: number;
    endIndex: number;
    totalItems: number;
}

/**
 * Custom hook for pagination logic
 *
 * Provides:
 * - Current page state
 * - Paginated data slice
 * - Navigation functions (next, prev, goto)
 * - Boundary checks
 * - Index calculations for display
 *
 * @param data - Array of items to paginate
 * @param itemsPerPage - Number of items per page (default: 25)
 * @returns Pagination state and controls
 */
export function usePagination<T>(
    data: T[],
    itemsPerPage: number = 25
): UsePaginationReturn<T> {
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Calculate total pages
    const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));

    // Ensure current page is valid when data changes
    const validatedPage = Math.min(currentPage, totalPages);
    if (validatedPage !== currentPage) {
        setCurrentPage(validatedPage);
    }

    /**
     * Get the paginated slice of data for current page
     * Memoized for performance
     */
    const paginatedData = useMemo(() => {
        const startIndex = (validatedPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return data.slice(startIndex, endIndex);
    }, [data, validatedPage, itemsPerPage]);

    /**
     * Calculate display indices (1-based for UI)
     */
    const startIndex = data.length === 0 ? 0 : (validatedPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(validatedPage * itemsPerPage, data.length);

    /**
     * Navigation functions
     */
    const goToPage = (page: number) => {
        const validPage = Math.max(1, Math.min(page, totalPages));
        setCurrentPage(validPage);
    };

    const nextPage = () => {
        if (validatedPage < totalPages) {
            setCurrentPage(validatedPage + 1);
        }
    };

    const prevPage = () => {
        if (validatedPage > 1) {
            setCurrentPage(validatedPage - 1);
        }
    };

    /**
     * Boundary checks for navigation buttons
     */
    const canGoNext = validatedPage < totalPages;
    const canGoPrev = validatedPage > 1;

    return {
        currentPage: validatedPage,
        totalPages,
        paginatedData,
        goToPage,
        nextPage,
        prevPage,
        canGoNext,
        canGoPrev,
        startIndex,
        endIndex,
        totalItems: data.length
    };
}
