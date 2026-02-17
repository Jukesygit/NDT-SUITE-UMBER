import { FormField, FormSelect } from '../../../components/ui';
import { useDocumentCategories } from '../../../hooks/queries/useDocuments';
import type { DocumentFilters as Filters, DocumentStatus } from '../../../types/document-control';

interface Props {
    filters: Filters;
    onFilterChange: (filters: Filters) => void;
    showStatusFilter?: boolean;
}

export default function DocumentFilters({ filters, onFilterChange, showStatusFilter = false }: Props) {
    const { data: categories = [] } = useDocumentCategories();

    const statusOptions = [
        { value: '', label: 'All Statuses' },
        { value: 'draft', label: 'Draft' },
        { value: 'under_review', label: 'Under Review' },
        { value: 'approved', label: 'Approved' },
        { value: 'withdrawn', label: 'Withdrawn' },
    ];

    const categoryOptions = [
        { value: '', label: 'All Categories' },
        ...categories.map(c => ({ value: c.id, label: c.name })),
    ];

    return (
        <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-[300px]">
                <FormField
                    label="Search"
                    value={filters.search || ''}
                    onChange={(e) => onFilterChange({ ...filters, search: e.target.value || undefined })}
                    placeholder="Search documents..."
                />
            </div>

            <div className="w-[200px]">
                <FormSelect
                    label="Category"
                    value={filters.categoryId || ''}
                    onChange={(e) => onFilterChange({ ...filters, categoryId: e.target.value || undefined })}
                    options={categoryOptions}
                />
            </div>

            {showStatusFilter && (
                <div className="w-[180px]">
                    <FormSelect
                        label="Status"
                        value={filters.status || ''}
                        onChange={(e) => onFilterChange({ ...filters, status: (e.target.value || undefined) as DocumentStatus | undefined })}
                        options={statusOptions}
                    />
                </div>
            )}
        </div>
    );
}
