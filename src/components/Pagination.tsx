import React from 'react';

/**
 * Pagination component props
 */
interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onNext: () => void;
    onPrev: () => void;
    canGoNext: boolean;
    canGoPrev: boolean;
    startIndex: number;
    endIndex: number;
    totalItems: number;
    className?: string;
}

/**
 * Reusable pagination component
 *
 * Features:
 * - Previous/Next navigation
 * - Page number display
 * - Item range display (e.g., "Showing 1-25 of 150")
 * - Disabled state handling
 * - Keyboard accessible
 * - Consistent with design system
 *
 * @example
 * ```tsx
 * const { currentPage, totalPages, ... } = usePagination(data, 25);
 *
 * <Pagination
 *   currentPage={currentPage}
 *   totalPages={totalPages}
 *   onPageChange={goToPage}
 *   onNext={nextPage}
 *   onPrev={prevPage}
 *   canGoNext={canGoNext}
 *   canGoPrev={canGoPrev}
 *   startIndex={startIndex}
 *   endIndex={endIndex}
 *   totalItems={totalItems}
 * />
 * ```
 */
export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    onNext,
    onPrev,
    canGoNext,
    canGoPrev,
    startIndex,
    endIndex,
    totalItems,
    className = ''
}) => {
    // Don't render if there's only one page or no items
    if (totalPages <= 1 || totalItems === 0) {
        return null;
    }

    /**
     * Generate page numbers to display
     * Shows: First, Previous, ...current range..., Next, Last
     * Example: 1 ... 5 6 [7] 8 9 ... 20
     */
    const getPageNumbers = (): (number | string)[] => {
        const pages: (number | string)[] = [];
        const maxPagesToShow = 5;
        const halfRange = Math.floor(maxPagesToShow / 2);

        let startPage = Math.max(1, currentPage - halfRange);
        let endPage = Math.min(totalPages, currentPage + halfRange);

        // Adjust range if at boundaries
        if (currentPage <= halfRange) {
            endPage = Math.min(totalPages, maxPagesToShow);
        }
        if (currentPage >= totalPages - halfRange) {
            startPage = Math.max(1, totalPages - maxPagesToShow + 1);
        }

        // Add first page and ellipsis if needed
        if (startPage > 1) {
            pages.push(1);
            if (startPage > 2) {
                pages.push('...');
            }
        }

        // Add page range
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        // Add ellipsis and last page if needed
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pages.push('...');
            }
            pages.push(totalPages);
        }

        return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className={`flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 ${className}`}>
            {/* Mobile: Simple prev/next */}
            <div className="flex flex-1 justify-between sm:hidden">
                <button
                    onClick={onPrev}
                    disabled={!canGoPrev}
                    className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                        canGoPrev
                            ? 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }`}
                >
                    Previous
                </button>
                <button
                    onClick={onNext}
                    disabled={!canGoNext}
                    className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                        canGoNext
                            ? 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }`}
                >
                    Next
                </button>
            </div>

            {/* Desktop: Full pagination */}
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{startIndex}</span> to{' '}
                        <span className="font-medium">{endIndex}</span> of{' '}
                        <span className="font-medium">{totalItems}</span> results
                    </p>
                </div>
                <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        {/* Previous button */}
                        <button
                            onClick={onPrev}
                            disabled={!canGoPrev}
                            className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0 ${
                                canGoPrev
                                    ? 'hover:bg-gray-50 cursor-pointer'
                                    : 'cursor-not-allowed opacity-50'
                            }`}
                            aria-label="Previous page"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                            </svg>
                        </button>

                        {/* Page numbers */}
                        {pageNumbers.map((page, index) => {
                            if (page === '...') {
                                return (
                                    <span
                                        key={`ellipsis-${index}`}
                                        className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                                    >
                                        ...
                                    </span>
                                );
                            }

                            const pageNum = page as number;
                            const isCurrent = pageNum === currentPage;

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => onPageChange(pageNum)}
                                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                        isCurrent
                                            ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                    }`}
                                    aria-current={isCurrent ? 'page' : undefined}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}

                        {/* Next button */}
                        <button
                            onClick={onNext}
                            disabled={!canGoNext}
                            className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0 ${
                                canGoNext
                                    ? 'hover:bg-gray-50 cursor-pointer'
                                    : 'cursor-not-allowed opacity-50'
                            }`}
                            aria-label="Next page"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    );
};

export default Pagination;
