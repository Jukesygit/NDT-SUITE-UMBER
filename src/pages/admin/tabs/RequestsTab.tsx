/**
 * RequestsTab - Manage account and permission requests
 *
 * Features:
 * - Display pending account requests
 * - Display pending permission requests
 * - Approve/reject requests with optional reason
 * - Real-time updates via React Query
 * - Empty states for no pending requests
 */

import { useState } from 'react';
import {
    useAccountRequests,
    usePermissionRequests,
} from '../../../hooks/queries';
import {
    useApproveAccountRequest,
    useRejectAccountRequest,
    useApprovePermissionRequest,
    useRejectPermissionRequest,
} from '../../../hooks/mutations';
import { SectionSpinner, EmptyState, Modal } from '../../../components/ui';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import { RequestCard } from '../components/RequestCard';

/**
 * Reject reason modal
 */
interface RejectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    isLoading: boolean;
    type: 'account' | 'permission';
}

function RejectModal({ isOpen, onClose, onConfirm, isLoading, type }: RejectModalProps) {
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
            title={`Reject ${type === 'account' ? 'Account' : 'Permission'} Request`}
            size="medium"
            closeOnBackdropClick={!isLoading}
            closeOnEscape={!isLoading}
        >
            <div className="space-y-4">
                <p className="text-sm text-white/70">
                    Provide an optional reason for rejecting this request. This will be sent to the requester.
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
                        {isLoading && <RandomMatrixSpinner size={16} />}
                        Reject Request
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default function RequestsTab() {
    const { data: accountRequests = [], isLoading: isLoadingAccounts, error: accountError } = useAccountRequests();
    const { data: permissionRequests = [], isLoading: isLoadingPermissions, error: permissionError } = usePermissionRequests();

    const approveAccount = useApproveAccountRequest();
    const rejectAccount = useRejectAccountRequest();
    const approvePermission = useApprovePermissionRequest();
    const rejectPermission = useRejectPermissionRequest();

    const [rejectingRequest, setRejectingRequest] = useState<{ id: string; type: 'account' | 'permission' } | null>(null);

    // Handle approve actions
    const handleApproveAccount = async (id: string) => {
        const result = await approveAccount.mutateAsync(id);
        if (!result.success) {
            console.error('Failed to approve account request:', result.error);
        }
    };

    const handleApprovePermission = async (id: string) => {
        const result = await approvePermission.mutateAsync(id);
        if (!result.success) {
            console.error('Failed to approve permission request:', result.error);
        }
    };

    // Handle reject confirmation
    const handleRejectConfirm = async (reason: string) => {
        if (!rejectingRequest) return;

        const { id, type } = rejectingRequest;

        if (type === 'account') {
            const result = await rejectAccount.mutateAsync({ id, reason: reason || undefined });
            if (result.success) {
                setRejectingRequest(null);
            } else {
                console.error('Failed to reject account request:', result.error);
            }
        } else {
            const result = await rejectPermission.mutateAsync({ id, reason: reason || undefined });
            if (result.success) {
                setRejectingRequest(null);
            } else {
                console.error('Failed to reject permission request:', result.error);
            }
        }
    };

    const isLoading = isLoadingAccounts || isLoadingPermissions;
    const hasError = accountError || permissionError;

    if (isLoading) {
        return <SectionSpinner message="Loading requests..." />;
    }

    if (hasError) {
        return (
            <div className="text-center py-8">
                <p className="text-red-400">Failed to load requests</p>
                <p className="text-sm text-white/50 mt-2">
                    {accountError?.message || permissionError?.message}
                </p>
            </div>
        );
    }

    const hasPendingPermissions = permissionRequests.length > 0;
    const hasPendingAccounts = accountRequests.length > 0;
    const hasAnyRequests = hasPendingPermissions || hasPendingAccounts;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>Requests</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '4px' }}>
                    Review and manage account and permission requests
                </p>
            </div>

            {/* Permission Requests Section */}
            {hasPendingPermissions && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Pending Permission Requests
                        </h3>
                        <span className="glass-badge badge-purple">
                            {permissionRequests.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {permissionRequests.map((request) => (
                            <RequestCard
                                key={request.id}
                                type="permission"
                                request={request}
                                onApprove={() => handleApprovePermission(request.id)}
                                onReject={() => setRejectingRequest({ id: request.id, type: 'permission' })}
                                isApprovePending={approvePermission.isPending && approvePermission.variables === request.id}
                                isRejectPending={rejectPermission.isPending && rejectPermission.variables?.id === request.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Account Requests Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Pending Account Requests
                    </h3>
                    {hasPendingAccounts && (
                        <span className="glass-badge badge-purple">
                            {accountRequests.length}
                        </span>
                    )}
                </div>

                {hasPendingAccounts ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {accountRequests.map((request) => (
                            <RequestCard
                                key={request.id}
                                type="account"
                                request={request}
                                onApprove={() => handleApproveAccount(request.id)}
                                onReject={() => setRejectingRequest({ id: request.id, type: 'account' })}
                                isApprovePending={approveAccount.isPending && approveAccount.variables === request.id}
                                isRejectPending={rejectAccount.isPending && rejectAccount.variables?.id === request.id}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon="default"
                        title="No Pending Account Requests"
                        message="All account requests have been processed"
                    />
                )}
            </div>

            {/* Empty state if no requests at all */}
            {!hasAnyRequests && (
                <div className="mt-8">
                    <EmptyState
                        icon="default"
                        title="All Caught Up!"
                        message="There are no pending requests to review"
                    />
                </div>
            )}

            {/* Reject reason modal */}
            <RejectModal
                isOpen={!!rejectingRequest}
                onClose={() => setRejectingRequest(null)}
                onConfirm={handleRejectConfirm}
                isLoading={rejectAccount.isPending || rejectPermission.isPending}
                type={rejectingRequest?.type || 'account'}
            />
        </div>
    );
}
