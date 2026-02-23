/**
 * CompetenciesSection - Certifications grid with filtering and search
 */

import { useState, useMemo } from 'react';
import { CompetencyCard, Competency, CompetencyDefinition } from './CompetencyCard';
import { FormSelect, EmptyState } from '../../components/ui';

interface Category {
    id: string;
    name: string;
}

interface CompetenciesSectionProps {
    /** List of user competencies */
    competencies: Competency[];
    /** List of competency definitions */
    definitions: CompetencyDefinition[];
    /** Available categories for filtering */
    categories: Category[];
    /** Whether data is loading */
    isLoading?: boolean;
    /** Callback when add is clicked */
    onAdd?: () => void;
    /** Callback when edit is clicked */
    onEdit?: (competency: Competency) => void;
    /** Callback when delete is clicked */
    onDelete?: (competency: Competency) => void;
}

/**
 * Search icon
 */
function SearchIcon() {
    return (
        <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
        </svg>
    );
}

/**
 * Plus icon
 */
function PlusIcon() {
    return (
        <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
    );
}

/**
 * Skeleton card for loading state
 */
function SkeletonCard() {
    return (
        <div className="pf-skeleton-card">
            <div className="pf-skeleton-row">
                <div className="pf-skeleton-icon" />
                <div className="pf-skeleton-lines">
                    <div className="pf-skeleton-line" />
                    <div className="pf-skeleton-line" />
                </div>
            </div>
            <div className="pf-skeleton-detail-grid">
                <div className="pf-skeleton-detail" />
                <div className="pf-skeleton-detail" />
            </div>
        </div>
    );
}

/**
 * CompetenciesSection component
 *
 * @example
 * <CompetenciesSection
 *     competencies={competencies}
 *     definitions={competencyDefinitions}
 *     categories={categories}
 *     isLoading={isLoading}
 *     onAdd={() => setShowAddModal(true)}
 *     onEdit={(c) => setEditingCompetency(c)}
 * />
 */
export function CompetenciesSection({
    competencies,
    definitions,
    categories,
    isLoading = false,
    onAdd,
    onEdit,
    onDelete,
}: CompetenciesSectionProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    // Get definition for a competency
    const getDefinition = (competencyId: string) => {
        return definitions.find((d) => d.id === competencyId);
    };

    // Get category name from definition (handles both object and string)
    const getCategoryName = (def?: CompetencyDefinition): string | undefined => {
        if (!def?.category) return undefined;
        return typeof def.category === 'object' ? def.category.name : def.category;
    };

    // Filter competencies based on search and category
    const filteredCompetencies = useMemo(() => {
        return competencies.filter((c) => {
            const def = getDefinition(c.competency_id);

            // Category filter
            const categoryName = getCategoryName(def);
            if (selectedCategory !== 'all' && categoryName !== selectedCategory) {
                return false;
            }

            // Search filter
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const name = def?.name?.toLowerCase() || '';
                const certId = c.certification_id?.toLowerCase() || '';
                const issuer = c.issuing_body?.toLowerCase() || '';

                if (!name.includes(search) && !certId.includes(search) && !issuer.includes(search)) {
                    return false;
                }
            }

            return true;
        });
    }, [competencies, definitions, selectedCategory, searchTerm]);

    // Category options for select
    const categoryOptions = [
        { value: 'all', label: 'All Categories' },
        ...categories.map((c) => ({ value: c.name, label: c.name })),
    ];

    // Count by category
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { all: competencies.length };
        competencies.forEach((c) => {
            const def = getDefinition(c.competency_id);
            const categoryName = getCategoryName(def);
            if (categoryName) {
                counts[categoryName] = (counts[categoryName] || 0) + 1;
            }
        });
        return counts;
    }, [competencies, definitions]);

    return (
        <div className="pf-content-card">
            {/* Header */}
            <div className="pf-section-header">
                <div>
                    <h2 className="pf-section-title">Certifications & Qualifications</h2>
                    <p className="pf-section-subtitle">{competencies.length} total certifications</p>
                </div>
                {onAdd && (
                    <button onClick={onAdd} className="pf-btn primary sm">
                        <PlusIcon />
                        Add Certification
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="pf-filter-row">
                {/* Search */}
                <div style={{ flex: '1 1 250px', minWidth: '200px' }}>
                    <div className="pf-search">
                        <SearchIcon />
                        <input
                            placeholder="Search certifications..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Category Filter */}
                <div style={{ flex: '0 0 200px' }}>
                    <FormSelect
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        options={categoryOptions.map((opt) => ({
                            ...opt,
                            label: `${opt.label}${categoryCounts[opt.value] ? ` (${categoryCounts[opt.value]})` : ''}`,
                        }))}
                        containerClassName="mb-0"
                    />
                </div>
            </div>

            {/* Grid */}
            {isLoading ? (
                <div className="pf-competency-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : filteredCompetencies.length === 0 ? (
                <EmptyState
                    title={searchTerm || selectedCategory !== 'all' ? 'No matches found' : 'No certifications yet'}
                    message={
                        searchTerm || selectedCategory !== 'all'
                            ? 'Try adjusting your search or filter'
                            : 'Add your first certification to get started'
                    }
                    icon={searchTerm || selectedCategory !== 'all' ? 'search' : 'document'}
                    action={
                        !searchTerm && selectedCategory === 'all' && onAdd
                            ? { label: 'Add Certification', onClick: onAdd }
                            : undefined
                    }
                />
            ) : (
                <div className="pf-competency-grid">
                    {filteredCompetencies.map((competency) => (
                        <CompetencyCard
                            key={competency.id}
                            competency={competency}
                            definition={getDefinition(competency.competency_id)}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default CompetenciesSection;
