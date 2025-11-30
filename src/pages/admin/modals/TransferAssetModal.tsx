/**
 * TransferAssetModal - Transfer assets between organizations
 *
 * Features:
 * - Single asset transfer mode
 * - Bulk transfer mode
 * - Organization selection
 * - Warning about data movement
 */

import { useState, useEffect } from 'react';
import { Modal, FormSelect, ButtonSpinner } from '../../../components/ui';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import {
    useTransferAsset,
    useBulkTransferAssets,
} from '../../../hooks/mutations/useAssetTransferMutations';
import type { AdminAsset } from '../../../types/admin';

interface TransferAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset?: AdminAsset | null;
    assetIds?: string[];
    onSuccess?: () => void;
}

export default function TransferAssetModal({
    isOpen,
    onClose,
    asset = null,
    assetIds = [],
    onSuccess,
}: TransferAssetModalProps) {
    const { data: organizations = [], isLoading: isLoadingOrgs } = useOrganizations();
    const transferAsset = useTransferAsset();
    const bulkTransferAssets = useBulkTransferAssets();

    const [targetOrgId, setTargetOrgId] = useState('');
    const [error, setError] = useState('');

    // Determine mode
    const isBulkMode = !asset && assetIds.length > 0;
    const isSingleMode = !!asset;

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setTargetOrgId('');
            setError('');
        }
    }, [isOpen]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!targetOrgId) {
            setError('Please select a target organization');
            return;
        }

        try {
            if (isSingleMode && asset) {
                // Single transfer
                const result = await transferAsset.mutateAsync({
                    assetId: asset.id,
                    targetOrgId,
                });

                if (result.success) {
                    onSuccess?.();
                    onClose();
                } else {
                    setError(result.error || 'Failed to transfer asset');
                }
            } else if (isBulkMode) {
                // Bulk transfer
                const result = await bulkTransferAssets.mutateAsync({
                    assetIds,
                    targetOrgId,
                });

                if (result.success) {
                    onSuccess?.();
                    onClose();
                } else {
                    setError(result.error || 'Failed to transfer assets');
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    const isPending = transferAsset.isPending || bulkTransferAssets.isPending;

    // Filter out current organization from options (if single mode)
    const availableOrganizations = isSingleMode && asset
        ? organizations.filter(org => org.id !== asset.organization_id)
        : organizations;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isBulkMode ? 'Bulk Transfer Assets' : 'Transfer Asset'}
            size="medium"
            closeOnBackdropClick={!isPending}
            closeOnEscape={!isPending}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Display info */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    {isSingleMode && asset ? (
                        <>
                            <p className="text-sm text-white/70 mb-1">Transferring asset:</p>
                            <p className="text-base font-medium text-white">{asset.name}</p>
                            <p className="text-xs text-white/50 font-mono mt-1">
                                ID: {asset.id.slice(0, 8)}...
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-white/70 mb-1">Transferring:</p>
                            <p className="text-base font-medium text-white">
                                {assetIds.length} asset{assetIds.length !== 1 ? 's' : ''}
                            </p>
                        </>
                    )}
                </div>

                {/* Warning */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <svg
                            className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-amber-300 mb-1">Warning</p>
                            <p className="text-xs text-amber-200/80">
                                This will permanently move {isBulkMode ? 'all selected assets' : 'this asset'} and
                                their associated vessels, scans, and data to the target organization.
                                This action cannot be undone.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Target Organization */}
                <FormSelect
                    label="Target Organization"
                    required
                    value={targetOrgId}
                    onChange={(e) => setTargetOrgId(e.target.value)}
                    disabled={isPending || isLoadingOrgs}
                    placeholder="Select organization..."
                    options={availableOrganizations.map(org => ({
                        value: org.id,
                        label: org.name,
                    }))}
                    error={error && !targetOrgId ? 'Organization is required' : undefined}
                />

                {/* Error message */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isPending || !targetOrgId}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPending && <ButtonSpinner />}
                        {isBulkMode ? 'Transfer Assets' : 'Transfer Asset'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
