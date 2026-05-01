/**
 * RequestCard - Reusable card for account and permission requests
 *
 * Features:
 * - Displays request details with metadata
 * - Approve/Reject actions
 * - Loading states during mutations
 * - Responsive layout
 */

import type { AccountRequest, PermissionRequest } from '../../../services/admin-service';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';

export interface RequestCardProps {
    type: 'account' | 'permission';
    request: AccountRequest | PermissionRequest;
    onApprove: () => void;
    onReject: () => void;
    isApprovePending: boolean;
    isRejectPending: boolean;
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
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Get badge inline style for role (green-on-dark LCD theme)
 */
function getRoleBadgeStyle(role: string): React.CSSProperties {
    switch (role.toLowerCase()) {
        case 'admin':
            return { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' };
        case 'org_admin':
            return { background: 'rgba(245, 158, 11, 0.10)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' };
        case 'editor':
            return { background: 'rgba(53, 160, 88, 0.10)', color: 'var(--green)', border: '1px solid rgba(53, 160, 88, 0.25)' };
        case 'viewer':
            return { background: 'rgba(53, 160, 88, 0.05)', color: 'rgba(53, 160, 88, 0.45)', border: '1px solid rgba(53, 160, 88, 0.15)' };
        default:
            return { background: 'rgba(53, 160, 88, 0.05)', color: 'rgba(53, 160, 88, 0.45)', border: '1px solid rgba(53, 160, 88, 0.15)' };
    }
}

/**
 * Spinner for loading state - uses Matrix logo spinner
 */
function Spinner() {
    return <RandomMatrixSpinner size={16} />;
}

/**
 * RequestCard component - displays account or permission request with actions
 */
export function RequestCard(props: RequestCardProps) {
    const { type, request, onApprove, onReject, isApprovePending, isRejectPending } = props;
    const isPending = isApprovePending || isRejectPending;

    if (type === 'account') {
        const accountRequest = request as AccountRequest;
        return (
            <div style={{ padding: '24px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)', transition: 'border-color 0.2s' }}>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--green-bright)' }}>
                            {accountRequest.username}
                        </h3>
                        <p className="text-sm" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>{accountRequest.email}</p>
                    </div>
                    <span style={{ ...getRoleBadgeStyle(accountRequest.requested_role), display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' as const }}>
                        {accountRequest.requested_role}
                    </span>
                </div>

                {accountRequest.organizations && (
                    <div className="mb-4">
                        <p className="text-sm" style={{ color: 'rgba(53, 160, 88, 0.35)' }}>Organization</p>
                        <p className="text-sm font-medium" style={{ color: 'rgba(53, 160, 88, 0.70)' }}>{accountRequest.organizations.name}</p>
                    </div>
                )}

                {accountRequest.message && (
                    <div className="mb-4" style={{ padding: '12px', borderRadius: '6px', background: 'rgba(53, 160, 88, 0.03)', border: '1px solid rgba(53, 160, 88, 0.15)' }}>
                        <p className="text-sm" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>{accountRequest.message}</p>
                    </div>
                )}

                <div className="flex items-center justify-between" style={{ paddingTop: '16px', borderTop: '1px solid rgba(53, 160, 88, 0.15)' }}>
                    <p className="text-xs" style={{ color: 'rgba(53, 160, 88, 0.35)' }}>
                        {formatDate(accountRequest.created_at)}
                    </p>

                    <div className="flex gap-2">
                        <button
                            onClick={onReject}
                            disabled={isPending}
                            className="ad-btn flex items-center gap-1.5"
                        >
                            {isRejectPending && <Spinner />}
                            Reject
                        </button>
                        <button
                            onClick={onApprove}
                            disabled={isPending}
                            className="ad-btn primary flex items-center gap-1.5"
                        >
                            {isApprovePending && <Spinner />}
                            Approve
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Permission request
    const permissionRequest = request as PermissionRequest;
    return (
        <div style={{ padding: '24px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)', transition: 'border-color 0.2s' }}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--green-bright)' }}>
                        {permissionRequest.profiles?.username || 'Unknown User'}
                    </h3>
                    <p className="text-sm" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>{permissionRequest.profiles?.email}</p>
                </div>
                <div className="flex gap-2 items-center">
                    <span style={{ ...getRoleBadgeStyle(permissionRequest.user_current_role), display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' as const }}>
                        {permissionRequest.user_current_role}
                    </span>
                    <svg className="w-4 h-4" style={{ color: 'rgba(53, 160, 88, 0.35)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span style={{ ...getRoleBadgeStyle(permissionRequest.requested_role), display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' as const }}>
                        {permissionRequest.requested_role}
                    </span>
                </div>
            </div>

            {permissionRequest.message && (
                <div className="mb-4" style={{ padding: '12px', borderRadius: '6px', background: 'rgba(53, 160, 88, 0.03)', border: '1px solid rgba(53, 160, 88, 0.15)' }}>
                    <p className="text-xs mb-1" style={{ color: 'rgba(53, 160, 88, 0.35)' }}>Reason</p>
                    <p className="text-sm" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>{permissionRequest.message}</p>
                </div>
            )}

            <div className="flex items-center justify-between" style={{ paddingTop: '16px', borderTop: '1px solid rgba(53, 160, 88, 0.15)' }}>
                <p className="text-xs" style={{ color: 'rgba(53, 160, 88, 0.35)' }}>
                    {formatDate(permissionRequest.created_at)}
                </p>

                <div className="flex gap-2">
                    <button
                        onClick={onReject}
                        disabled={isPending}
                        className="ad-btn flex items-center gap-1.5"
                    >
                        {isRejectPending && <Spinner />}
                        Reject
                    </button>
                    <button
                        onClick={onApprove}
                        disabled={isPending}
                        className="ad-btn primary flex items-center gap-1.5"
                    >
                        {isApprovePending && <Spinner />}
                        Approve
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RequestCard;
