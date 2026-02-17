import { useState, useMemo, useCallback } from 'react';
import { DataTable, useTableSort, ErrorDisplay } from '../../../components/ui';
import type { Column } from '../../../components/ui/DataTable/DataTable';
import { useDocuments } from '../../../hooks/queries/useDocuments';
import type { Document, DocumentFilters as Filters } from '../../../types/document-control';
import DocumentStatusBadge from '../components/DocumentStatusBadge';
import DocumentFilters from '../components/DocumentFilters';
import CreateDocumentModal from '../modals/CreateDocumentModal';
import DocumentDetailModal from '../modals/DocumentDetailModal';

interface Props {
    canManage: boolean;
}

export default function DocumentRegisterTab({ canManage }: Props) {
    const [filters, setFilters] = useState<Filters>({});
    const [showCreate, setShowCreate] = useState(false);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

    const { data: documents = [], isLoading, error } = useDocuments(filters);
    const { sortColumn, sortDirection, handleSort } = useTableSort('doc_number', 'asc');

    const sortedData = useMemo(() => {
        if (!sortColumn) return documents;
        return [...documents].sort((a, b) => {
            const aVal = getNestedValue(a, sortColumn);
            const bVal = getNestedValue(b, sortColumn);
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [documents, sortColumn, sortDirection]);

    const handleRowClick = useCallback((doc: Document) => {
        setSelectedDocId(doc.id);
    }, []);

    if (error) return <ErrorDisplay error={error} />;

    const columns: Column<Document>[] = [
        {
            key: 'doc_number',
            header: 'Doc #',
            sortable: true,
            width: '120px',
            render: (row) => (
                <button
                    onClick={() => handleRowClick(row)}
                    className="text-[var(--accent-primary)] hover:underline font-mono text-sm"
                >
                    {row.doc_number}
                </button>
            ),
        },
        {
            key: 'title',
            header: 'Title',
            sortable: true,
            render: (row) => (
                <button
                    onClick={() => handleRowClick(row)}
                    className="text-left hover:text-[var(--accent-primary)] transition-colors"
                >
                    <div className="font-medium">{row.title}</div>
                    {row.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[400px]">{row.description}</div>
                    )}
                </button>
            ),
        },
        {
            key: 'category',
            header: 'Category',
            sortable: true,
            width: '160px',
            render: (row) => (
                <span className="text-sm text-gray-300">
                    {(row.category as { name: string } | undefined)?.name || '-'}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            sortable: true,
            width: '140px',
            render: (row) => <DocumentStatusBadge status={row.status} />,
        },
        {
            key: 'owner',
            header: 'Owner',
            sortable: true,
            width: '150px',
            render: (row) => (
                <span className="text-sm text-gray-300">
                    {(row.owner as { username: string } | undefined)?.username || '-'}
                </span>
            ),
        },
        {
            key: 'next_review_date',
            header: 'Next Review',
            sortable: true,
            width: '130px',
            render: (row) => {
                if (!row.next_review_date) return <span className="text-gray-500">-</span>;
                const date = new Date(row.next_review_date);
                const isOverdue = date < new Date();
                return (
                    <span className={`text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-300'}`}>
                        {date.toLocaleDateString()}
                    </span>
                );
            },
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <DocumentFilters
                    filters={filters}
                    onFilterChange={setFilters}
                    showStatusFilter={canManage}
                />
                {canManage && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="glass-btn glass-btn-primary whitespace-nowrap"
                    >
                        + New Document
                    </button>
                )}
            </div>

            <DataTable
                data={sortedData}
                columns={columns}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                isLoading={isLoading}
                rowKey={(row) => row.id}
                emptyState={{
                    title: 'No documents found',
                    message: canManage
                        ? 'Create your first controlled document to get started.'
                        : 'No approved documents are available yet.',
                    icon: 'document',
                    ...(canManage && {
                        action: { label: 'New Document', onClick: () => setShowCreate(true) },
                    }),
                }}
            />

            {showCreate && (
                <CreateDocumentModal
                    isOpen={showCreate}
                    onClose={() => setShowCreate(false)}
                />
            )}

            {selectedDocId && (
                <DocumentDetailModal
                    isOpen={!!selectedDocId}
                    onClose={() => setSelectedDocId(null)}
                    documentId={selectedDocId}
                    canManage={canManage}
                />
            )}
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNestedValue(obj: any, key: string): unknown {
    if (key === 'category') return obj.category?.name;
    if (key === 'owner') return obj.owner?.username;
    return obj[key];
}
