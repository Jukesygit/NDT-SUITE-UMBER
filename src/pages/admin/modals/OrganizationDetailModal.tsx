/**
 * OrganizationDetailModal - View organization details and manage assets
 *
 * Features:
 * - Organization info display
 * - List of organization assets
 * - Transfer assets to other organizations
 * - Asset statistics
 */

import { useState, useMemo, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import { SectionSpinner, EmptyState } from '../../../components/ui';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import { useAdminAssets } from '../../../hooks/queries/useAdminAssets';
import { useAdminCreateAsset } from '../../../hooks/mutations';
import TransferAssetModal from './TransferAssetModal';
import type { OrganizationStats } from '../../../services/admin-service';
import type { AdminAsset } from '../../../types/admin';

export interface OrganizationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    organization: OrganizationStats | null;
}

/**
 * Asset row component
 */
interface AssetRowProps {
    asset: AdminAsset;
    isSelected: boolean;
    onSelect: (selected: boolean) => void;
    onTransfer: () => void;
}

function AssetRow({ asset, isSelected, onSelect, onTransfer }: AssetRowProps) {
    const vesselCount = asset.vessels?.length || 0;
    const createdDate = new Date(asset.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <tr
            className="border-b hover:bg-white/5 transition-colors"
            style={{ borderColor: 'var(--border-subtle)' }}
        >
            {/* Checkbox */}
            <td className="px-4 py-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500 focus:ring-2 cursor-pointer"
                />
            </td>

            {/* Asset Name */}
            <td className="px-4 py-3">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{asset.name}</p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{asset.id.slice(0, 8)}...</p>
            </td>

            {/* Vessels */}
            <td className="px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{vesselCount}</span>
            </td>

            {/* Created */}
            <td className="px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{createdDate}</span>
            </td>

            {/* Actions */}
            <td className="px-4 py-3">
                <button
                    onClick={onTransfer}
                    className="px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 rounded-md transition-colors"
                >
                    Transfer
                </button>
            </td>
        </tr>
    );
}

/**
 * OrganizationDetailModal component
 */
export function OrganizationDetailModal({ isOpen, onClose, organization }: OrganizationDetailModalProps) {
    const { data: allAssets = [], isLoading } = useAdminAssets();
    const createAsset = useAdminCreateAsset();

    // State
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [transferringAsset, setTransferringAsset] = useState<AdminAsset | null>(null);
    const [showBulkTransfer, setShowBulkTransfer] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newAssetName, setNewAssetName] = useState('');
    const [createError, setCreateError] = useState('');

    // Filter assets for this organization
    const orgAssets = useMemo(() => {
        if (!organization) return [];
        return allAssets.filter((asset: AdminAsset) => asset.organization_id === organization.organization.id);
    }, [allAssets, organization]);

    // Check if all assets are selected
    const allSelected = orgAssets.length > 0 && selectedAssetIds.length === orgAssets.length;

    // Handle select all
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedAssetIds(orgAssets.map((asset: AdminAsset) => asset.id));
        } else {
            setSelectedAssetIds([]);
        }
    };

    // Handle individual select
    const handleSelectAsset = (assetId: string, selected: boolean) => {
        if (selected) {
            setSelectedAssetIds([...selectedAssetIds, assetId]);
        } else {
            setSelectedAssetIds(selectedAssetIds.filter((id) => id !== assetId));
        }
    };

    // Handle modal close
    const handleClose = () => {
        setSelectedAssetIds([]);
        setTransferringAsset(null);
        setShowBulkTransfer(false);
        setShowCreateForm(false);
        setNewAssetName('');
        setCreateError('');
        onClose();
    };

    // Handle transfer success
    const handleTransferSuccess = () => {
        setSelectedAssetIds([]);
        setTransferringAsset(null);
        setShowBulkTransfer(false);
    };

    // Handle asset creation
    const handleCreateAsset = async (e: FormEvent) => {
        e.preventDefault();
        setCreateError('');

        if (!newAssetName.trim()) {
            setCreateError('Asset name is required');
            return;
        }

        if (!organization) return;

        try {
            const result = await createAsset.mutateAsync({
                orgId: organization.organization.id,
                name: newAssetName.trim(),
            });

            if (result.success) {
                setNewAssetName('');
                setShowCreateForm(false);
            } else {
                setCreateError(result.error || 'Failed to create asset');
            }
        } catch (error: any) {
            setCreateError(error.message || 'An error occurred');
        }
    };

    if (!organization) return null;

    const createdDate = new Date(organization.organization.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={handleClose}
                title={organization.organization.name}
                size="large"
            >
                <div className="space-y-6">
                    {/* Organization Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Users</p>
                            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{organization.userCount || 0}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Assets</p>
                            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{organization.assetCount || 0}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Vessels</p>
                            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{organization.vesselCount || 0}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Scans</p>
                            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{organization.scanCount || 0}</p>
                        </div>
                    </div>

                    {/* Created Date */}
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Created on {createdDate}
                    </div>

                    {/* Assets Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Assets</h3>
                            <div className="flex items-center gap-2">
                                {selectedAssetIds.length > 0 && (
                                    <button
                                        onClick={() => setShowBulkTransfer(true)}
                                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                    >
                                        Transfer Selected ({selectedAssetIds.length})
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowCreateForm(!showCreateForm)}
                                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    New Asset
                                </button>
                            </div>
                        </div>

                        {/* Create Asset Form */}
                        {showCreateForm && (
                            <form onSubmit={handleCreateAsset} className="glass-card p-4 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                        Asset Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newAssetName}
                                        onChange={(e) => setNewAssetName(e.target.value)}
                                        placeholder="Enter asset name..."
                                        className="form-input w-full"
                                        autoFocus
                                    />
                                    {createError && (
                                        <p className="mt-1 text-sm text-red-400">{createError}</p>
                                    )}
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCreateForm(false);
                                            setNewAssetName('');
                                            setCreateError('');
                                        }}
                                        className="btn btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={createAsset.isPending}
                                        className="btn btn-primary flex items-center gap-2"
                                    >
                                        {createAsset.isPending && <RandomMatrixSpinner size={14} />}
                                        {createAsset.isPending ? 'Creating...' : 'Create Asset'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {isLoading ? (
                            <SectionSpinner message="Loading assets..." />
                        ) : orgAssets.length === 0 ? (
                            <EmptyState
                                icon="default"
                                title="No Assets"
                                message="This organization has no assets yet"
                            />
                        ) : (
                            <div className="glass-card overflow-hidden" style={{ padding: 0 }}>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <tr>
                                                <th className="px-4 py-3 text-left">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                                        className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500 focus:ring-2 cursor-pointer"
                                                    />
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                                                    Asset
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                                                    Vessels
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                                                    Created
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orgAssets.map((asset: AdminAsset) => (
                                                <AssetRow
                                                    key={asset.id}
                                                    asset={asset}
                                                    isSelected={selectedAssetIds.includes(asset.id)}
                                                    onSelect={(selected) => handleSelectAsset(asset.id, selected)}
                                                    onTransfer={() => setTransferringAsset(asset)}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Single Asset Transfer Modal */}
            <TransferAssetModal
                isOpen={!!transferringAsset}
                onClose={() => setTransferringAsset(null)}
                asset={transferringAsset}
                onSuccess={handleTransferSuccess}
            />

            {/* Bulk Transfer Modal */}
            <TransferAssetModal
                isOpen={showBulkTransfer}
                onClose={() => setShowBulkTransfer(false)}
                assetIds={selectedAssetIds}
                onSuccess={handleTransferSuccess}
            />
        </>
    );
}

export default OrganizationDetailModal;
