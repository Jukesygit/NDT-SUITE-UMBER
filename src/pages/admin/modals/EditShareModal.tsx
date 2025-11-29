/**
 * EditShareModal - Edit share permissions
 *
 * Features:
 * - Display share information
 * - Update permission level
 * - Simple form with asset/organization context
 */

import { useState, useEffect } from 'react';
import { Modal, ButtonSpinner } from '../../../components/ui';
import { useUpdateShare } from '../../../hooks/mutations/useShareMutations';
import type { AssetShare, SharePermission } from '../../../types/admin';

interface EditShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    share: AssetShare | null;
    onSuccess?: () => void;
}

export default function EditShareModal({
    isOpen,
    onClose,
    share,
    onSuccess,
}: EditShareModalProps) {
    const updateShare = useUpdateShare();

    const [permission, setPermission] = useState<SharePermission>('view');
    const [error, setError] = useState('');

    // Initialize permission from share
    useEffect(() => {
        if (share) {
            setPermission(share.permission);
            setError('');
        }
    }, [share]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!share) return;

        // Check if permission actually changed
        if (permission === share.permission) {
            onClose();
            return;
        }

        try {
            const result = await updateShare.mutateAsync({
                id: share.id,
                permission,
            });

            if (result.success) {
                onSuccess?.();
                onClose();
            } else {
                setError(result.error || 'Failed to update share');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    const isPending = updateShare.isPending;

    if (!share) return null;

    // Get share type display
    const shareTypeDisplay = share.share_type.charAt(0).toUpperCase() + share.share_type.slice(1);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Share Permissions"
            size="medium"
            closeOnBackdropClick={!isPending}
            closeOnEscape={!isPending}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Share Info */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                    <div>
                        <p className="text-xs text-white/50">Asset ID</p>
                        <p className="text-sm text-white font-medium font-mono">
                            {share.asset_id.slice(0, 8)}...
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-white/50">Share Type</p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {shareTypeDisplay}
                            </span>
                        </div>
                    </div>

                    {share.vessel_id && (
                        <div>
                            <p className="text-xs text-white/50">Vessel ID</p>
                            <p className="text-sm text-white font-medium font-mono">
                                {share.vessel_id.slice(0, 8)}...
                            </p>
                        </div>
                    )}

                    {share.scan_id && (
                        <div>
                            <p className="text-xs text-white/50">Scan ID</p>
                            <p className="text-sm text-white font-medium font-mono">
                                {share.scan_id.slice(0, 8)}...
                            </p>
                        </div>
                    )}

                    <div className="pt-2 border-t border-slate-700">
                        <div className="flex items-center justify-between text-xs">
                            <div>
                                <p className="text-white/50">Owner</p>
                                <p className="text-white font-medium mt-1">
                                    {share.owner_org?.name || share.owner_organization_id.slice(0, 8) + '...'}
                                </p>
                            </div>
                            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <div>
                                <p className="text-white/50 text-right">Shared with</p>
                                <p className="text-white font-medium mt-1">
                                    {share.shared_with_org?.name || share.shared_with_organization_id.slice(0, 8) + '...'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Permission Selection */}
                <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">
                        Permission Level
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                            <input
                                type="radio"
                                name="permission"
                                value="view"
                                checked={permission === 'view'}
                                onChange={(e) => setPermission(e.target.value as SharePermission)}
                                disabled={isPending}
                                className="mt-1 text-purple-600 focus:ring-purple-500"
                            />
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-white">View Only</p>
                                <p className="text-xs text-white/50 mt-1">
                                    Can view data but cannot make changes
                                </p>
                            </div>
                        </label>

                        <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                            <input
                                type="radio"
                                name="permission"
                                value="edit"
                                checked={permission === 'edit'}
                                onChange={(e) => setPermission(e.target.value as SharePermission)}
                                disabled={isPending}
                                className="mt-1 text-purple-600 focus:ring-purple-500"
                            />
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-white">Edit Access</p>
                                <p className="text-xs text-white/50 mt-1">
                                    Can view and modify data
                                </p>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Info message if permission changed */}
                {permission !== share.permission && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                        <p className="text-xs text-blue-200/80">
                            {permission === 'view'
                                ? 'The organization will lose edit access and can only view the shared data.'
                                : 'The organization will gain edit access and can modify the shared data.'}
                        </p>
                    </div>
                )}

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
                        disabled={isPending || permission === share.permission}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPending && <ButtonSpinner />}
                        Update Permission
                    </button>
                </div>
            </form>
        </Modal>
    );
}
