/**
 * SharingTab - Asset sharing management
 *
 * Features:
 * - Display pending access requests
 * - Show active shares
 * - Create and manage shares
 * - Approve/reject access requests
 * - Share assets with other organizations
 */

import { useState } from 'react';
import {
    useAssetShares,
    useAccessRequests,
    useAdminAssets,
} from '../../../hooks/queries';
import {
    useDeleteShare,
    useApproveAccessRequest,
    useRejectAccessRequest,
} from '../../../hooks/mutations';
import { SectionSpinner, EmptyState, ConfirmDialog, Modal } from '../../../components/ui';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import { StatusBadge } from '../components/StatusBadge';
import type { Share, AccessRequest } from '../../../services/admin-service';

/**
 * Get badge variant for share type
 */
function getShareTypeBadgeVariant(shareType: string): 'asset' | 'vessel' | 'scan' {
    switch (shareType) {
        case 'asset':
            return 'asset';
        case 'vessel':
            return 'vessel';
        case 'scan':
            return 'scan';
        default:
            return 'asset';
    }
}

/**
 * Get badge variant for permission
 */
function getPermissionBadgeVariant(permission: string): 'view' | 'edit' {
    return permission === 'edit' ? 'edit' : 'view';
}

/**
 * Format date to readable string
 */
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Spinner for loading state - uses Matrix logo spinner
 */
function Spinner() {
    return <RandomMatrixSpinner size={16} />;
}

/**
 * Access Request Card
 */
interface AccessRequestCardProps {
    request: AccessRequest;
    onApprove: () => void;
    onReject: () => void;
    isApprovePending: boolean;
    isRejectPending: boolean;
}

function AccessRequestCard({ request, onApprove, onReject, isApprovePending, isRejectPending }: AccessRequestCardProps) {
    const isPending = isApprovePending || isRejectPending;

    return (
        <div
            className="glass-card"
            style={{ transition: 'border-color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>Asset ID</p>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{request.asset_id}</p>
                </div>
                <StatusBadge variant={getPermissionBadgeVariant(request.requested_permission)} />
            </div>

            {request.message && (
                <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>{request.message}</p>
                </div>
            )}

            <div className="flex items-center justify-between" style={{ paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>{formatDate(request.created_at)}</p>

                <div className="flex gap-2">
                    <button
                        onClick={onReject}
                        disabled={isPending}
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '12px', opacity: isPending ? 0.5 : 1 }}
                    >
                        {isRejectPending && <Spinner />}
                        Reject
                    </button>
                    <button
                        onClick={onApprove}
                        disabled={isPending}
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '12px', opacity: isPending ? 0.5 : 1 }}
                    >
                        {isApprovePending && <Spinner />}
                        Approve
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Share Card
 */
interface ShareCardProps {
    share: Share;
    onEdit: () => void;
    onDelete: () => void;
}

function ShareCard({ share, onEdit, onDelete }: ShareCardProps) {
    return (
        <div
            className="glass-card"
            style={{ transition: 'border-color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Asset {share.asset_id}</p>
                        <StatusBadge variant={getShareTypeBadgeVariant(share.share_type)} />
                        <StatusBadge variant={getPermissionBadgeVariant(share.permission)} />
                    </div>
                    <div className="flex items-center gap-2" style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        <span>{share.owner_organization_id.substring(0, 8)}...</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span>{share.shared_with_organization_id.substring(0, 8)}...</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between" style={{ paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>{formatDate(share.created_at)}</p>

                <div className="flex gap-2">
                    <button
                        onClick={onEdit}
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                        Edit
                    </button>
                    <button
                        onClick={onDelete}
                        className="btn btn-danger"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Reject Access Request Modal
 */
interface RejectAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    isLoading: boolean;
}

function RejectAccessModal({ isOpen, onClose, onConfirm, isLoading }: RejectAccessModalProps) {
    const [reason, setReason] = useState('');

    const handleConfirm = () => {
        onConfirm(reason);
        setReason('');
    };

    const handleClose = () => {
        if (!isLoading) {
            setReason('');
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Reject Access Request"
            size="medium"
            closeOnBackdropClick={!isLoading}
            closeOnEscape={!isLoading}
        >
            <div className="space-y-4">
                <p className="text-sm text-white/70">
                    Provide an optional reason for rejecting this access request.
                </p>

                <div>
                    <label htmlFor="reject-reason" className="block text-sm font-medium text-white mb-2">
                        Reason (Optional)
                    </label>
                    <textarea
                        id="reject-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={isLoading}
                        rows={4}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                        placeholder="Enter reason for rejection..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading && <Spinner />}
                        Reject Request
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default function SharingTab() {
    const { data: shares = [], isLoading: isLoadingShares, error: sharesError } = useAssetShares();
    const { data: accessRequests = [], isLoading: isLoadingRequests, error: requestsError } = useAccessRequests();
    const { data: assets = [], isLoading: isLoadingAssets } = useAdminAssets();

    const deleteShare = useDeleteShare();
    const approveAccessRequest = useApproveAccessRequest();
    const rejectAccessRequest = useRejectAccessRequest();

    const [deletingShare, setDeletingShare] = useState<Share | null>(null);
    const [rejectingAccessRequest, setRejectingAccessRequest] = useState<{ id: string } | null>(null);

    // Handle approve access request
    const handleApproveAccessRequest = async (id: string) => {
        const result = await approveAccessRequest.mutateAsync(id);
        if (!result.success) {
            console.error('Failed to approve access request:', result.error);
        }
    };

    // Handle reject access request
    const handleRejectAccessRequestConfirm = async (reason: string) => {
        if (!rejectingAccessRequest) return;

        const result = await rejectAccessRequest.mutateAsync({
            id: rejectingAccessRequest.id,
            reason: reason || undefined,
        });

        if (result.success) {
            setRejectingAccessRequest(null);
        } else {
            console.error('Failed to reject access request:', result.error);
        }
    };

    // Handle delete share
    const handleDeleteShare = async () => {
        if (!deletingShare) return;

        const result = await deleteShare.mutateAsync(deletingShare.id);

        if (result.success) {
            setDeletingShare(null);
        } else {
            console.error('Failed to delete share:', result.error);
        }
    };

    const isLoading = isLoadingShares || isLoadingRequests || isLoadingAssets;
    const hasError = sharesError || requestsError;

    if (isLoading) {
        return <SectionSpinner message="Loading sharing data..." />;
    }

    if (hasError) {
        return (
            <div className="text-center py-8">
                <p className="text-red-400">Failed to load sharing data</p>
                <p className="text-sm text-white/50 mt-2">
                    {sharesError?.message || requestsError?.message}
                </p>
            </div>
        );
    }

    const hasPendingRequests = accessRequests.length > 0;
    const hasActiveShares = shares.length > 0;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>Asset Sharing</h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '4px' }}>
                        Manage asset sharing and access requests
                        {hasPendingRequests && (
                            <span className="glass-badge badge-purple" style={{ marginLeft: '8px' }}>
                                {accessRequests.length} pending request{accessRequests.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </p>
                </div>
                {/* TODO: Share Asset button - modal not yet implemented */}
                {/* <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                    Share Asset
                </button> */}
            </div>

            {/* Pending Access Requests */}
            {hasPendingRequests && (
                <div className="space-y-4">
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }} className="flex items-center gap-2">
                        Pending Access Requests
                        <span className="glass-badge badge-purple">
                            {accessRequests.length}
                        </span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {accessRequests.map((request) => (
                            <AccessRequestCard
                                key={request.id}
                                request={request}
                                onApprove={() => handleApproveAccessRequest(request.id)}
                                onReject={() => setRejectingAccessRequest({ id: request.id })}
                                isApprovePending={approveAccessRequest.isPending && approveAccessRequest.variables === request.id}
                                isRejectPending={rejectAccessRequest.isPending && rejectAccessRequest.variables?.id === request.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Your Assets */}
            <div className="space-y-4">
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Your Assets</h3>

                {assets.length === 0 ? (
                    <EmptyState
                        icon="folder"
                        title="No Assets"
                        message="No assets available to share"
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {assets.slice(0, 8).map((asset: any) => (
                            <div
                                key={asset.id}
                                className="glass-card"
                                style={{ transition: 'border-color 0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }} className="truncate">
                                            {asset.name || `Asset ${asset.id.substring(0, 8)}`}
                                        </p>
                                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                                            ID: {asset.id.substring(0, 8)}...
                                        </p>
                                    </div>
                                </div>
                                {/* TODO: Share button - modal not yet implemented */}
                                {/* <button className="w-full px-3 py-1.5 text-xs font-medium text-white bg-purple-600/20 hover:bg-purple-600/30 rounded transition-colors disabled:opacity-50" disabled>
                                    Share
                                </button> */}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Active Shares */}
            <div className="space-y-4">
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Active Shares</h3>

                {hasActiveShares ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {shares.map((share) => (
                            <ShareCard
                                key={share.id}
                                share={share}
                                onEdit={() => {/* TODO: Edit share modal not yet implemented */}}
                                onDelete={() => setDeletingShare(share)}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon="default"
                        title="No Active Shares"
                        message="You haven't shared any assets yet"
                    />
                )}
            </div>

            {/* Delete Share Confirmation */}
            <ConfirmDialog
                isOpen={!!deletingShare}
                onClose={() => setDeletingShare(null)}
                onConfirm={handleDeleteShare}
                title="Remove Share"
                message={
                    <>
                        Are you sure you want to remove this share?
                        <br />
                        <br />
                        The recipient organization will lose access to this asset.
                    </>
                }
                confirmText="Remove"
                variant="danger"
                isLoading={deleteShare.isPending}
            />

            {/* Reject Access Request Modal */}
            <RejectAccessModal
                isOpen={!!rejectingAccessRequest}
                onClose={() => setRejectingAccessRequest(null)}
                onConfirm={handleRejectAccessRequestConfirm}
                isLoading={rejectAccessRequest.isPending}
            />

            {/* TODO: Create/Edit share modals will be added later */}
        </div>
    );
}
