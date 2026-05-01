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
                <p style={{ fontSize: '13px', color: 'rgba(53, 160, 88, 0.45)' }}>
                    Provide an optional reason for rejecting this request. This will be sent to the requester.
                </p>

                <div>
                    <label htmlFor="reject-reason" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgba(53, 160, 88, 0.70)', marginBottom: '8px' }}>
                        Reason (Optional)
                    </label>
                    <textarea
                        id="reject-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={isLoading}
                        rows={4}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(53, 160, 88, 0.20)',
                            borderRadius: '4px',
                            color: 'rgba(53, 160, 88, 0.70)',
                            fontFamily: 'inherit',
                            fontSize: '13px',
                            resize: 'none' as const,
                            outline: 'none',
                        }}
                        className="disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="Enter reason for rejection..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="ad-btn sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className="ad-btn danger sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
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
        await approveAccount.mutateAsync(id);
    };

    const handleApprovePermission = async (id: string) => {
        await approvePermission.mutateAsync(id);
    };

    // Handle reject confirmation
    const handleRejectConfirm = async (reason: string) => {
        if (!rejectingRequest) return;

        const { id, type } = rejectingRequest;

        if (type === 'account') {
            const result = await rejectAccount.mutateAsync({ id, reason: reason || undefined });
            if (result.success) {
                setRejectingRequest(null);
            }
        } else {
            const result = await rejectPermission.mutateAsync({ id, reason: reason || undefined });
            if (result.success) {
                setRejectingRequest(null);
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
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ color: 'var(--red)' }}>Failed to load requests</p>
                <p style={{ fontSize: '13px', color: 'rgba(53, 160, 88, 0.30)', marginTop: '8px' }}>
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
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(53, 160, 88, 0.70)' }}>Requests</h2>
                <p style={{ color: 'rgba(53, 160, 88, 0.45)', marginTop: '4px' }}>
                    Review and manage account and permission requests
                </p>
            </div>

            {/* Permission Requests Section */}
            {hasPendingPermissions && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(53, 160, 88, 0.70)' }}>
                            Pending Permission Requests
                        </h3>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--green-bright)',
                            background: 'rgba(53, 160, 88, 0.12)',
                            border: '1px solid rgba(53, 160, 88, 0.25)',
                            borderRadius: '3px',
                        }}>
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
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(53, 160, 88, 0.70)' }}>
                        Pending Account Requests
                    </h3>
                    {hasPendingAccounts && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--green-bright)',
                            background: 'rgba(53, 160, 88, 0.12)',
                            border: '1px solid rgba(53, 160, 88, 0.25)',
                            borderRadius: '3px',
                        }}>
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
