import { useState, useMemo } from 'react';
import { Modal, ConfirmDialog } from '../../../components/ui';
import { DataTable } from '../../../components/ui';
import type { Column } from '../../../components/ui';
import { StatusBadge } from '../../admin/components/StatusBadge';
import { useAllDocumentCategories } from '../../../hooks/queries/useDocuments';
import {
    useDeleteDocumentCategory,
    useReorderDocumentCategories,
} from '../../../hooks/mutations';
import type { DocumentCategory } from '../../../types/document-control';
import CreateDocumentCategoryModal from './CreateDocumentCategoryModal';
import EditDocumentCategoryModal from './EditDocumentCategoryModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ManageCategoriesModal({ isOpen, onClose }: Props) {
    const { data: categories = [], isLoading } = useAllDocumentCategories();
    const deleteCategory = useDeleteDocumentCategory();
    const reorderCategories = useReorderDocumentCategories();

    const [showCreate, setShowCreate] = useState(false);
    const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null);
    const [deletingCategory, setDeletingCategory] = useState<DocumentCategory | null>(null);
    const [deleteError, setDeleteError] = useState('');

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= categories.length) return;

        const reordered = [...categories];
        [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
        await reorderCategories.mutateAsync(reordered.map((c) => c.id));
    };

    const handleDelete = async () => {
        if (!deletingCategory) return;
        try {
            await deleteCategory.mutateAsync(deletingCategory.id);
            setDeletingCategory(null);
            setDeleteError('');
        } catch (err: unknown) {
            // FK constraint error when documents reference this category
            const message = err instanceof Error ? err.message : 'Failed to delete';
            if (message.includes('violates foreign key') || message.includes('referenced')) {
                setDeleteError('Cannot delete this category because documents are assigned to it. Deactivate it instead.');
            } else {
                setDeleteError(message);
            }
        }
    };

    const columns: Column<DocumentCategory>[] = useMemo(
        () => [
            {
                key: 'order',
                header: '#',
                width: '70px',
                render: (_cat: DocumentCategory, index: number) => (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleMove(index, 'up'); }}
                            disabled={index === 0 || reorderCategories.isPending}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleMove(index, 'down'); }}
                            disabled={index === categories.length - 1 || reorderCategories.isPending}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                ),
            },
            {
                key: 'name',
                header: 'Category',
                render: (cat: DocumentCategory) => (
                    <div>
                        <div className="text-sm font-medium text-white">{cat.name}</div>
                        {cat.description && (
                            <div className="text-xs text-white/50 mt-0.5">{cat.description}</div>
                        )}
                    </div>
                ),
            },
            {
                key: 'status',
                header: 'Status',
                width: '100px',
                align: 'center' as const,
                render: (cat: DocumentCategory) => (
                    <StatusBadge variant={cat.is_active ? 'active' : 'inactive'} />
                ),
            },
            {
                key: 'actions',
                header: 'Actions',
                width: '120px',
                align: 'right' as const,
                render: (cat: DocumentCategory) => (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }}
                            className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Edit category"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setDeleteError(''); setDeletingCategory(cat); }}
                            className="p-1.5 rounded hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors"
                            title="Delete category"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [categories.length, reorderCategories.isPending]
    );

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Manage Document Categories" size="large">
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowCreate(true)}
                            className="btn btn-primary text-sm flex items-center gap-1.5"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Category
                        </button>
                    </div>

                    <DataTable<DocumentCategory>
                        columns={columns}
                        data={categories}
                        isLoading={isLoading}
                        rowKey={(cat) => cat.id}
                        emptyState={{
                            title: 'No categories',
                            message: 'Create a category to organize your controlled documents.',
                            icon: 'folder',
                        }}
                    />
                </div>
            </Modal>

            {showCreate && (
                <CreateDocumentCategoryModal
                    isOpen={showCreate}
                    onClose={() => setShowCreate(false)}
                />
            )}

            {editingCategory && (
                <EditDocumentCategoryModal
                    isOpen={!!editingCategory}
                    onClose={() => setEditingCategory(null)}
                    category={editingCategory}
                />
            )}

            <ConfirmDialog
                isOpen={!!deletingCategory}
                onClose={() => { setDeletingCategory(null); setDeleteError(''); }}
                onConfirm={handleDelete}
                title="Delete Category"
                message={
                    deleteError ? (
                        <div>
                            <p className="text-red-400 mb-2">{deleteError}</p>
                            <p className="text-white/50 text-xs">You can close this dialog and use the Edit button to deactivate the category instead.</p>
                        </div>
                    ) : (
                        `Are you sure you want to delete "${deletingCategory?.name}"? This cannot be undone.`
                    )
                }
                confirmText={deleteError ? 'Close' : 'Delete'}
                variant="danger"
                isLoading={deleteCategory.isPending}
            />
        </>
    );
}
