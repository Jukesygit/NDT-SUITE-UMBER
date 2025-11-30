/**
 * DataTable - Reusable table component with sorting, loading, and empty states
 *
 * Features:
 * - Sortable columns with indicators
 * - Loading state with skeleton
 * - Empty state customization
 * - Row expansion support
 * - Glass-morphic styling
 */

import { ReactNode, useState, useCallback } from 'react';
import { EmptyState } from '../EmptyState';

// Column definition type
export interface Column<T> {
    /** Unique identifier for the column */
    key: string;
    /** Header text to display */
    header: string;
    /** Whether the column is sortable */
    sortable?: boolean;
    /** Text alignment */
    align?: 'left' | 'center' | 'right';
    /** Width (e.g., '150px', '20%') */
    width?: string;
    /** Cell renderer - receives row data and returns ReactNode */
    render: (row: T, index: number) => ReactNode;
}

export type SortDirection = 'asc' | 'desc';

export interface DataTableProps<T> {
    /** Array of data to display */
    data: T[];
    /** Column definitions */
    columns: Column<T>[];
    /** Currently sorted column key */
    sortColumn?: string;
    /** Current sort direction */
    sortDirection?: SortDirection;
    /** Callback when sort changes */
    onSort?: (column: string) => void;
    /** Loading state */
    isLoading?: boolean;
    /** Number of skeleton rows to show when loading */
    skeletonRows?: number;
    /** Empty state configuration */
    emptyState?: {
        title?: string;
        message?: string;
        icon?: 'default' | 'search' | 'folder' | 'users' | 'document';
        action?: {
            label: string;
            onClick: () => void;
        };
    };
    /** Function to extract unique key from row */
    rowKey: (row: T) => string;
    /** Whether rows are expandable */
    expandable?: boolean;
    /** Render function for expanded content */
    renderExpandedContent?: (row: T) => ReactNode;
    /** Additional class name for the table container */
    className?: string;
    /** Callback when row is clicked */
    onRowClick?: (row: T) => void;
}

/**
 * Sort indicator component
 */
function SortIndicator({ direction }: { direction: SortDirection }) {
    return (
        <span className="text-[10px] ml-1.5">
            {direction === 'asc' ? '▲' : '▼'}
        </span>
    );
}

/**
 * Skeleton row for loading state
 */
function SkeletonRow({ columnCount }: { columnCount: number }) {
    return (
        <tr className="border-b border-white/5">
            {Array.from({ length: columnCount }).map((_, i) => (
                <td key={i} className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse" />
                </td>
            ))}
        </tr>
    );
}

/**
 * DataTable component
 *
 * @example
 * const columns: Column<Person>[] = [
 *     { key: 'name', header: 'Name', sortable: true, render: (row) => row.username },
 *     { key: 'email', header: 'Email', render: (row) => row.email },
 *     { key: 'role', header: 'Role', align: 'center', render: (row) => <Badge>{row.role}</Badge> },
 * ];
 *
 * <DataTable
 *     data={personnel}
 *     columns={columns}
 *     sortColumn={sortColumn}
 *     sortDirection={sortDirection}
 *     onSort={handleSort}
 *     isLoading={isLoading}
 *     rowKey={(row) => row.id}
 *     emptyState={{ title: 'No personnel found', icon: 'users' }}
 * />
 */
export function DataTable<T>({
    data,
    columns,
    sortColumn,
    sortDirection = 'asc',
    onSort,
    isLoading = false,
    skeletonRows = 5,
    emptyState,
    rowKey,
    expandable = false,
    renderExpandedContent,
    className = '',
    onRowClick,
}: DataTableProps<T>) {
    const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

    const handleHeaderClick = useCallback((column: Column<T>) => {
        if (column.sortable && onSort) {
            onSort(column.key);
        }
    }, [onSort]);

    const handleRowClick = useCallback((row: T) => {
        if (expandable) {
            const key = rowKey(row);
            setExpandedRowKey(prev => prev === key ? null : key);
        }
        onRowClick?.(row);
    }, [expandable, rowKey, onRowClick]);

    const getAlignClass = (align?: 'left' | 'center' | 'right') => {
        switch (align) {
            case 'center': return 'text-center';
            case 'right': return 'text-right';
            default: return 'text-left';
        }
    };

    return (
        <div className={`overflow-x-auto ${className}`}>
            <table className="w-full border-collapse">
                {/* Header */}
                <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                        {columns.map((column) => {
                            const isActive = sortColumn === column.key;
                            const isSortable = column.sortable && onSort;

                            return (
                                <th
                                    key={column.key}
                                    className={`
                                        p-4 text-[13px] font-semibold uppercase tracking-wide
                                        ${getAlignClass(column.align)}
                                        ${isActive ? 'text-white' : 'text-white/70'}
                                        ${isSortable ? 'cursor-pointer select-none hover:text-white transition-colors' : ''}
                                    `}
                                    style={{ width: column.width }}
                                    onClick={() => isSortable && handleHeaderClick(column)}
                                >
                                    <div className={`flex items-center gap-1.5 ${column.align === 'center' ? 'justify-center' : column.align === 'right' ? 'justify-end' : ''}`}>
                                        {column.header}
                                        {isActive && <SortIndicator direction={sortDirection} />}
                                    </div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>

                {/* Body */}
                <tbody>
                    {/* Loading State */}
                    {isLoading && (
                        <>
                            {Array.from({ length: skeletonRows }).map((_, i) => (
                                <SkeletonRow key={i} columnCount={columns.length} />
                            ))}
                        </>
                    )}

                    {/* Empty State */}
                    {!isLoading && data.length === 0 && (
                        <tr>
                            <td colSpan={columns.length}>
                                <EmptyState
                                    title={emptyState?.title ?? 'No data found'}
                                    message={emptyState?.message ?? 'There are no items to display.'}
                                    icon={emptyState?.icon ?? 'default'}
                                    action={emptyState?.action}
                                />
                            </td>
                        </tr>
                    )}

                    {/* Data Rows */}
                    {!isLoading && data.map((row, index) => {
                        const key = rowKey(row);
                        const isExpanded = expandedRowKey === key;

                        return (
                            <TableRow
                                key={key}
                                row={row}
                                index={index}
                                columns={columns}
                                isExpanded={isExpanded}
                                expandable={expandable}
                                renderExpandedContent={renderExpandedContent}
                                onClick={() => handleRowClick(row)}
                                getAlignClass={getAlignClass}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Individual table row component
 */
interface TableRowProps<T> {
    row: T;
    index: number;
    columns: Column<T>[];
    isExpanded: boolean;
    expandable: boolean;
    renderExpandedContent?: (row: T) => ReactNode;
    onClick: () => void;
    getAlignClass: (align?: 'left' | 'center' | 'right') => string;
}

function TableRow<T>({
    row,
    index,
    columns,
    isExpanded,
    expandable,
    renderExpandedContent,
    onClick,
    getAlignClass,
}: TableRowProps<T>) {
    return (
        <>
            <tr
                className={`
                    border-b transition-colors
                    ${isExpanded ? 'border-blue-500/30' : 'border-white/5'}
                    ${expandable ? 'cursor-pointer' : ''}
                    hover:bg-white/5
                `}
                onClick={expandable ? onClick : undefined}
            >
                {columns.map((column) => (
                    <td
                        key={column.key}
                        className={`p-4 ${getAlignClass(column.align)}`}
                    >
                        {column.render(row, index)}
                    </td>
                ))}
            </tr>

            {/* Expanded Content */}
            {isExpanded && renderExpandedContent && (
                <tr>
                    <td
                        colSpan={columns.length}
                        className="p-0 border-b border-white/5"
                    >
                        <div
                            className="bg-blue-500/5 border-l-4 border-blue-500 p-6"
                            style={{ animation: 'slideDown 0.2s ease-out' }}
                        >
                            {renderExpandedContent(row)}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export default DataTable;
