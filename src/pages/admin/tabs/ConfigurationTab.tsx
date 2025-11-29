/**
 * ConfigurationTab - Admin dashboard configuration management
 *
 * Manages report field configuration lists:
 * - 11 different configuration lists (procedure numbers, equipment models, etc.)
 * - Add, edit, delete items
 * - Reset individual lists or all lists
 * - Export/import configuration as JSON
 */

import { useState, useRef, KeyboardEvent } from 'react';
import { useAdminConfig, useConfigMetadata } from '../../../hooks/queries/useAdminConfig';
import {
    useAddConfigItem,
    useUpdateConfigItem,
    useRemoveConfigItem,
    useResetConfigList,
    useResetAllConfig,
    useImportConfig,
} from '../../../hooks/mutations/useConfigMutations';
import { adminService } from '../../../services/admin-service';
import { SectionSpinner, ErrorDisplay, EmptyState, ConfirmDialog } from '../../../components/ui';

// Type for configuration list names
type ConfigListName =
    | 'procedureNumbers'
    | 'equipmentModels'
    | 'probes'
    | 'calibrationBlocks'
    | 'couplants'
    | 'scannerFrames'
    | 'coatingTypes'
    | 'materials'
    | 'acceptanceCriteria'
    | 'clients'
    | 'locations';

// State type for editing/deleting items
interface ItemAction {
    list: ConfigListName;
    item: string;
    index?: number;
}

/**
 * Helper function to download JSON content
 */
function downloadJson(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export default function ConfigurationTab() {
    // Data hooks
    const { data: config, isLoading, error } = useAdminConfig();
    const metadata = useConfigMetadata();

    // Mutation hooks
    const addItemMutation = useAddConfigItem();
    const updateItemMutation = useUpdateConfigItem();
    const removeItemMutation = useRemoveConfigItem();
    const resetListMutation = useResetConfigList();
    const resetAllMutation = useResetAllConfig();
    const importMutation = useImportConfig();

    // Local state
    const [addingToList, setAddingToList] = useState<ConfigListName | null>(null);
    const [addItemValue, setAddItemValue] = useState('');
    const [editingItem, setEditingItem] = useState<ItemAction & { index: number } | null>(null);
    const [editItemValue, setEditItemValue] = useState('');
    const [deletingItem, setDeletingItem] = useState<ItemAction | null>(null);
    const [resettingList, setResettingList] = useState<ConfigListName | null>(null);
    const [resetAllOpen, setResetAllOpen] = useState(false);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Loading states
    if (isLoading) {
        return <SectionSpinner message="Loading configuration..." />;
    }

    // Error states
    if (error) {
        return <ErrorDisplay error={error} />;
    }

    // Handler functions
    const handleAddItem = async (listName: ConfigListName) => {
        const trimmedValue = addItemValue.trim();
        if (!trimmedValue) return;

        await addItemMutation.mutateAsync({
            listName,
            item: trimmedValue,
        });

        setAddItemValue('');
        setAddingToList(null);
    };

    const handleUpdateItem = async () => {
        if (!editingItem) return;
        const trimmedValue = editItemValue.trim();
        if (!trimmedValue || trimmedValue === editingItem.item) {
            setEditingItem(null);
            setEditItemValue('');
            return;
        }

        await updateItemMutation.mutateAsync({
            listName: editingItem.list,
            oldItem: editingItem.item,
            newItem: trimmedValue,
        });

        setEditingItem(null);
        setEditItemValue('');
    };

    const handleDeleteItem = async () => {
        if (!deletingItem) return;

        await removeItemMutation.mutateAsync({
            listName: deletingItem.list,
            item: deletingItem.item,
        });

        setDeletingItem(null);
    };

    const handleResetList = async () => {
        if (!resettingList) return;

        await resetListMutation.mutateAsync(resettingList);
        setResettingList(null);
    };

    const handleResetAll = async () => {
        await resetAllMutation.mutateAsync();
        setResetAllOpen(false);
    };

    const handleExport = () => {
        const configJson = adminService.exportConfig();
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadJson(configJson, `ndt-config-${timestamp}.json`);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();
            await importMutation.mutateAsync(content);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Error reading import file:', error);
        }
    };

    // Keyboard handlers for inline forms
    const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>, listName: ConfigListName) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddItem(listName);
        } else if (e.key === 'Escape') {
            setAddingToList(null);
            setAddItemValue('');
        }
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleUpdateItem();
        } else if (e.key === 'Escape') {
            setEditingItem(null);
            setEditItemValue('');
        }
    };

    // Get list of config list names
    const listNames = Object.keys(metadata) as ConfigListName[];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Report Field Configuration
                    </h2>
                    <p style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                        Manage suggested values for report fields across the system
                    </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        className="btn btn-secondary"
                    >
                        Export Config
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="btn btn-secondary"
                    >
                        Import Config
                    </button>
                    <button
                        onClick={() => setResetAllOpen(true)}
                        className="btn btn-danger"
                    >
                        Reset All
                    </button>
                </div>
            </div>

            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelected}
                className="hidden"
            />

            {/* Config lists grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {listNames.map((listName) => {
                    const listData = config?.[listName] || [];
                    const listMeta = metadata[listName];
                    const isAdding = addingToList === listName;
                    const isPending =
                        addItemMutation.isPending ||
                        updateItemMutation.isPending ||
                        removeItemMutation.isPending ||
                        resetListMutation.isPending;

                    return (
                        <div
                            key={listName}
                            className="glass-card"
                            style={{ padding: 0, overflow: 'hidden' }}
                        >
                            {/* Card header */}
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(255, 255, 255, 0.03)'
                            }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span style={{ fontSize: '18px' }}>{listMeta.icon}</span>
                                        <div>
                                            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {listMeta.label}
                                            </h3>
                                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                                {listData.length} {listData.length === 1 ? 'item' : 'items'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setAddingToList(listName);
                                                setAddItemValue('');
                                            }}
                                            disabled={isPending || isAdding}
                                            style={{
                                                padding: '4px 12px',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: '#fff',
                                                background: 'var(--accent-primary)',
                                                borderRadius: '4px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isPending || isAdding ? 0.5 : 1
                                            }}
                                        >
                                            + Add
                                        </button>
                                        <button
                                            onClick={() => setResettingList(listName)}
                                            disabled={isPending}
                                            style={{
                                                padding: '4px 12px',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: '#fff',
                                                background: '#d97706',
                                                borderRadius: '4px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isPending ? 0.5 : 1
                                            }}
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* List items */}
                            <div className="max-h-80 overflow-y-auto glass-scrollbar">
                                {/* Add item form */}
                                {isAdding && (
                                    <div style={{
                                        padding: '8px 16px',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                        background: 'rgba(96, 165, 250, 0.1)'
                                    }}>
                                        <input
                                            type="text"
                                            value={addItemValue}
                                            onChange={(e) => setAddItemValue(e.target.value)}
                                            onKeyDown={(e) => handleAddKeyDown(e, listName)}
                                            onBlur={() => {
                                                if (!addItemValue.trim()) {
                                                    setAddingToList(null);
                                                }
                                            }}
                                            placeholder="Enter value and press Enter"
                                            autoFocus
                                            className="glass-input"
                                            style={{ height: '32px', fontSize: '14px' }}
                                        />
                                    </div>
                                )}

                                {/* Existing items */}
                                {listData.length === 0 && !isAdding ? (
                                    <div style={{ padding: '32px 16px' }}>
                                        <EmptyState
                                            title="No items"
                                            message="Add items to this list using the + Add button"
                                            icon="document"
                                            className="py-4"
                                        />
                                    </div>
                                ) : (
                                    <div style={{ borderTop: 'none' }}>
                                        {listData.map((item, index) => {
                                            const isEditing =
                                                editingItem?.list === listName &&
                                                editingItem?.index === index;

                                            return (
                                                <div
                                                    key={`${item}-${index}`}
                                                    style={{
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    className="group"
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            type="text"
                                                            value={editItemValue}
                                                            onChange={(e) => setEditItemValue(e.target.value)}
                                                            onKeyDown={handleEditKeyDown}
                                                            onBlur={handleUpdateItem}
                                                            autoFocus
                                                            className="glass-input"
                                                            style={{ height: '32px', fontSize: '14px' }}
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-between">
                                                            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                                                {item}
                                                            </span>

                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingItem({ list: listName, item, index });
                                                                        setEditItemValue(item);
                                                                    }}
                                                                    disabled={isPending}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        color: '#60a5fa',
                                                                        background: 'rgba(96, 165, 250, 0.1)',
                                                                        borderRadius: '4px',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        opacity: isPending ? 0.5 : 1
                                                                    }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => setDeletingItem({ list: listName, item })}
                                                                    disabled={isPending}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        color: '#f87171',
                                                                        background: 'rgba(248, 113, 113, 0.1)',
                                                                        borderRadius: '4px',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        opacity: isPending ? 0.5 : 1
                                                                    }}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Delete confirmation dialog */}
            <ConfirmDialog
                isOpen={!!deletingItem}
                onClose={() => setDeletingItem(null)}
                onConfirm={handleDeleteItem}
                title="Delete Item"
                message={
                    <>
                        Are you sure you want to delete <strong>{deletingItem?.item}</strong>?
                        <br />
                        This item will be removed from the configuration list.
                    </>
                }
                confirmText="Delete"
                variant="danger"
                isLoading={removeItemMutation.isPending}
            />

            {/* Reset list confirmation dialog */}
            <ConfirmDialog
                isOpen={!!resettingList}
                onClose={() => setResettingList(null)}
                onConfirm={handleResetList}
                title="Reset List"
                message={
                    <>
                        Are you sure you want to reset <strong>{resettingList ? metadata[resettingList].label : ''}</strong> to default values?
                        <br />
                        All custom items will be removed and defaults will be restored.
                    </>
                }
                confirmText="Reset List"
                variant="warning"
                isLoading={resetListMutation.isPending}
            />

            {/* Reset all confirmation dialog */}
            <ConfirmDialog
                isOpen={resetAllOpen}
                onClose={() => setResetAllOpen(false)}
                onConfirm={handleResetAll}
                title="Reset All Configuration"
                message={
                    <>
                        <strong className="text-red-400">Warning: This is a destructive action!</strong>
                        <br />
                        <br />
                        Are you sure you want to reset ALL configuration lists to default values?
                        <br />
                        All custom items across all lists will be permanently removed.
                    </>
                }
                confirmText="Reset All Lists"
                variant="danger"
                isLoading={resetAllMutation.isPending}
            />
        </div>
    );
}
