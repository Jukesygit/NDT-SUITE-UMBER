/**
 * CompetencyTypesTab - Admin management for competency categories & definitions
 * Features: CRUD for categories and certification types, reordering
 */

import { useState, useMemo } from 'react';
import { useAllCompetencyCategories, useAllCompetencyDefinitions } from '../../../hooks/queries/useCompetencies';
import type { CompetencyCategory, CompetencyDefinition } from '../../../hooks/queries/useCompetencies';
import {
    useDeleteCategory,
    useDeleteDefinition,
    useReorderCategories,
    useReorderDefinitions,
} from '../../../hooks/mutations';
import { DataTable, Column } from '../../../components/ui/DataTable/DataTable';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay';
import { ConfirmDialog } from '../../../components/ui/Modal/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import {
    CreateCategoryModal,
    EditCategoryModal,
    CreateDefinitionModal,
    EditDefinitionModal,
} from '../modals';

// Field type labels for display
const FIELD_TYPE_LABELS: Record<string, string> = {
    text: 'Text',
    date: 'Date',
    expiry_date: 'Expiry Date',
    boolean: 'Yes/No',
    file: 'File Upload',
    number: 'Number',
};

export default function CompetencyTypesTab() {
    // Data queries
    const { data: categories = [], isLoading: loadingCategories, error: categoriesError } = useAllCompetencyCategories();
    const { data: definitions = [], isLoading: loadingDefinitions, error: definitionsError } = useAllCompetencyDefinitions();

    // Mutations
    const deleteCategory = useDeleteCategory();
    const deleteDefinition = useDeleteDefinition();
    const reorderCategories = useReorderCategories();
    const reorderDefinitions = useReorderDefinitions();

    // Modal states
    const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CompetencyCategory | null>(null);
    const [deletingCategory, setDeletingCategory] = useState<CompetencyCategory | null>(null);

    const [createDefinitionOpen, setCreateDefinitionOpen] = useState(false);
    const [editingDefinition, setEditingDefinition] = useState<CompetencyDefinition | null>(null);
    const [deletingDefinition, setDeletingDefinition] = useState<CompetencyDefinition | null>(null);

    // Filter state for definitions
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Filtered definitions
    const filteredDefinitions = useMemo(() => {
        if (categoryFilter === 'all') return definitions;
        return definitions.filter((d) => d.category_id === categoryFilter);
    }, [definitions, categoryFilter]);

    // Move category up/down
    const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= categories.length) return;

        const newOrder = [...categories];
        [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
        await reorderCategories.mutateAsync(newOrder.map((c) => c.id));
    };

    // Move definition up/down within its category
    const handleMoveDefinition = async (def: CompetencyDefinition, direction: 'up' | 'down') => {
        const categoryDefs = definitions.filter((d) => d.category_id === def.category_id);
        const index = categoryDefs.findIndex((d) => d.id === def.id);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= categoryDefs.length) return;

        const newOrder = [...categoryDefs];
        [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
        await reorderDefinitions.mutateAsync({
            categoryId: def.category_id,
            orderedIds: newOrder.map((d) => d.id),
        });
    };

    // Category columns
    const categoryColumns = useMemo<Column<CompetencyCategory>[]>(
        () => [
            {
                key: 'order',
                header: '#',
                width: '60px',
                render: (_cat, index) => (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleMoveCategory(index!, 'up')}
                            disabled={index === 0}
                            className="btn-icon-sm"
                            title="Move up"
                        >
                            ↑
                        </button>
                        <button
                            onClick={() => handleMoveCategory(index!, 'down')}
                            disabled={index === categories.length - 1}
                            className="btn-icon-sm"
                            title="Move down"
                        >
                            ↓
                        </button>
                    </div>
                ),
            },
            {
                key: 'name',
                header: 'Category Name',
                render: (cat) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cat.name}</p>
                        {cat.description && (
                            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                {cat.description}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                key: 'count',
                header: 'Cert Types',
                align: 'center',
                render: (cat) => {
                    const count = definitions.filter((d) => d.category_id === cat.id).length;
                    return <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{count}</span>;
                },
            },
            {
                key: 'status',
                header: 'Status',
                align: 'center',
                render: (cat) => <StatusBadge variant={cat.is_active ? 'active' : 'inactive'} />,
            },
            {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (cat) => (
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditingCategory(cat)} className="btn-action btn-action--edit">
                            Edit
                        </button>
                        <button onClick={() => setDeletingCategory(cat)} className="btn-action btn-action--delete">
                            Delete
                        </button>
                    </div>
                ),
            },
        ],
        [categories.length, definitions]
    );

    // Definition columns
    const definitionColumns = useMemo<Column<CompetencyDefinition>[]>(
        () => [
            {
                key: 'order',
                header: '#',
                width: '60px',
                render: (def) => {
                    const categoryDefs = definitions.filter((d) => d.category_id === def.category_id);
                    const index = categoryDefs.findIndex((d) => d.id === def.id);
                    return (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => handleMoveDefinition(def, 'up')}
                                disabled={index === 0}
                                className="btn-icon-sm"
                                title="Move up"
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => handleMoveDefinition(def, 'down')}
                                disabled={index === categoryDefs.length - 1}
                                className="btn-icon-sm"
                                title="Move down"
                            >
                                ↓
                            </button>
                        </div>
                    );
                },
            },
            {
                key: 'name',
                header: 'Name',
                render: (def) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{def.name}</p>
                        {def.description && (
                            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                {def.description}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                key: 'category',
                header: 'Category',
                render: (def) => (
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                        {def.category?.name || 'Unknown'}
                    </span>
                ),
            },
            {
                key: 'fieldType',
                header: 'Type',
                align: 'center',
                render: (def) => (
                    <span className="glass-badge" style={{ fontSize: '12px' }}>
                        {FIELD_TYPE_LABELS[def.field_type] || def.field_type}
                    </span>
                ),
            },
            {
                key: 'requiresDoc',
                header: 'Doc Required',
                align: 'center',
                render: (def) => (
                    <span style={{ color: def.requires_document ? '#10b981' : 'rgba(255,255,255,0.4)' }}>
                        {def.requires_document ? 'Yes' : 'No'}
                    </span>
                ),
            },
            {
                key: 'status',
                header: 'Status',
                align: 'center',
                render: (def) => <StatusBadge variant={def.is_active ? 'active' : 'inactive'} />,
            },
            {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (def) => (
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditingDefinition(def)} className="btn-action btn-action--edit">
                            Edit
                        </button>
                        <button onClick={() => setDeletingDefinition(def)} className="btn-action btn-action--delete">
                            Delete
                        </button>
                    </div>
                ),
            },
        ],
        [definitions]
    );

    // Loading state
    if (loadingCategories || loadingDefinitions) {
        return <SectionSpinner />;
    }

    // Error state
    if (categoriesError || definitionsError) {
        return <ErrorDisplay error={categoriesError || definitionsError} />;
    }

    return (
        <div className="space-y-8">
            {/* Categories Section */}
            <section className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Categories</h2>
                        <p className="text-sm text-white/50">Organize certification types into categories</p>
                    </div>
                    <button onClick={() => setCreateCategoryOpen(true)} className="btn btn--primary">
                        + New Category
                    </button>
                </div>
                <DataTable<CompetencyCategory>
                    columns={categoryColumns}
                    data={categories}
                    rowKey={(cat) => cat.id}
                    emptyState={{ title: 'No categories', message: 'Create a category to organize certification types' }}
                />
            </section>

            {/* Definitions Section */}
            <section className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Certification Types</h2>
                        <p className="text-sm text-white/50">Define the certifications users can add to their profiles</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="glass-input"
                            style={{ minWidth: '180px' }}
                        >
                            <option value="all">All Categories</option>
                            {categories.filter((c) => c.is_active).map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                        <button onClick={() => setCreateDefinitionOpen(true)} className="btn btn--primary">
                            + New Cert Type
                        </button>
                    </div>
                </div>
                <DataTable<CompetencyDefinition>
                    columns={definitionColumns}
                    data={filteredDefinitions}
                    rowKey={(def) => def.id}
                    emptyState={{ title: 'No certification types', message: 'Create a certification type to get started' }}
                />
            </section>

            {/* Category Modals */}
            <CreateCategoryModal isOpen={createCategoryOpen} onClose={() => setCreateCategoryOpen(false)} />
            {editingCategory && (
                <EditCategoryModal
                    isOpen={!!editingCategory}
                    onClose={() => setEditingCategory(null)}
                    category={editingCategory}
                />
            )}
            <ConfirmDialog
                isOpen={!!deletingCategory}
                onClose={() => setDeletingCategory(null)}
                onConfirm={async () => {
                    if (deletingCategory) {
                        await deleteCategory.mutateAsync({ id: deletingCategory.id });
                        setDeletingCategory(null);
                    }
                }}
                title="Delete Category"
                message={`Are you sure you want to deactivate "${deletingCategory?.name}"? This will hide it from users but preserve existing data.`}
                confirmText="Deactivate"
                variant="danger"
                isLoading={deleteCategory.isPending}
            />

            {/* Definition Modals */}
            <CreateDefinitionModal
                isOpen={createDefinitionOpen}
                onClose={() => setCreateDefinitionOpen(false)}
                categories={categories.filter((c) => c.is_active)}
            />
            {editingDefinition && (
                <EditDefinitionModal
                    isOpen={!!editingDefinition}
                    onClose={() => setEditingDefinition(null)}
                    definition={editingDefinition}
                    categories={categories.filter((c) => c.is_active)}
                />
            )}
            <ConfirmDialog
                isOpen={!!deletingDefinition}
                onClose={() => setDeletingDefinition(null)}
                onConfirm={async () => {
                    if (deletingDefinition) {
                        await deleteDefinition.mutateAsync({ id: deletingDefinition.id });
                        setDeletingDefinition(null);
                    }
                }}
                title="Delete Certification Type"
                message={`Are you sure you want to deactivate "${deletingDefinition?.name}"? This will hide it from users but preserve existing records.`}
                confirmText="Deactivate"
                variant="danger"
                isLoading={deleteDefinition.isPending}
            />
        </div>
    );
}
