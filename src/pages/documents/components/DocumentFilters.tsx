import { useDocumentCategories } from '../../../hooks/queries/useDocuments';
import type { DocumentFilters as Filters } from '../../../types/document-control';

interface Props {
    filters: Filters;
    onFilterChange: (filters: Filters) => void;
}

export default function DocumentFilters({ filters, onFilterChange }: Props) {
    const { data: categories = [] } = useDocumentCategories();

    const activeCategoryId = filters.categoryId || '';

    const handleCategoryClick = (categoryId: string) => {
        onFilterChange({
            ...filters,
            categoryId: categoryId || undefined,
        });
    };

    return (
        <div className="dc-filter-row">
            <button
                className={`dc-filter-chip ${!activeCategoryId ? 'active' : ''}`}
                onClick={() => handleCategoryClick('')}
            >
                All
            </button>
            {categories.map((cat) => (
                <button
                    key={cat.id}
                    className={`dc-filter-chip ${activeCategoryId === cat.id ? 'active' : ''}`}
                    onClick={() => handleCategoryClick(cat.id)}
                >
                    {cat.name}
                </button>
            ))}
        </div>
    );
}
