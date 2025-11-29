/**
 * CompetenciesSection - Certifications grid with filtering and search
 */

import { useState, useMemo } from 'react';
import { CompetencyCard, Competency, CompetencyDefinition } from './CompetencyCard';
import { FormField, FormSelect, EmptyState } from '../../components/ui';

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
        <div
            className="glass-card"
            style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div
                    style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.1)',
                    }}
                    className="animate-pulse"
                />
                <div style={{ flex: 1 }}>
                    <div
                        style={{
                            height: '16px',
                            width: '60%',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            marginBottom: '6px',
                        }}
                        className="animate-pulse"
                    />
                    <div
                        style={{
                            height: '12px',
                            width: '40%',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                        }}
                        className="animate-pulse"
                    />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                    style={{
                        height: '36px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                    }}
                    className="animate-pulse"
                />
                <div
                    style={{
                        height: '36px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                    }}
                    className="animate-pulse"
                />
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
        <div className="glass-card" style={{ padding: '24px' }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                        Certifications & Qualifications
                    </h2>
                    <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', margin: '4px 0 0 0' }}>
                        {competencies.length} total certifications
                    </p>
                </div>
                {onAdd && (
                    <button onClick={onAdd} className="btn btn--primary btn--sm">
                        <PlusIcon />
                        Add Certification
                    </button>
                )}
            </div>

            {/* Filters */}
            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                }}
            >
                {/* Search */}
                <div style={{ flex: '1 1 250px', minWidth: '200px' }}>
                    <FormField
                        placeholder="Search certifications..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        leftIcon={<SearchIcon />}
                        containerClassName="mb-0"
                    />
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
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '16px',
                    }}
                >
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
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '16px',
                    }}
                >
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
