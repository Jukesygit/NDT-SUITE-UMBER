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
 * Get badge color for role
 */
function getRoleBadgeColor(role: string): string {
    switch (role.toLowerCase()) {
        case 'admin':
            return 'bg-red-100 text-red-800 border-red-200';
        case 'org_admin':
            return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'editor':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'viewer':
            return 'bg-gray-100 text-gray-800 border-gray-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
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
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-purple-500/50 transition-colors">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                            {accountRequest.username}
                        </h3>
                        <p className="text-sm text-white/70">{accountRequest.email}</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(accountRequest.requested_role)}`}>
                        {accountRequest.requested_role}
                    </span>
                </div>

                {accountRequest.organizations && (
                    <div className="mb-4">
                        <p className="text-sm text-white/50">Organization</p>
                        <p className="text-sm text-white font-medium">{accountRequest.organizations.name}</p>
                    </div>
                )}

                {accountRequest.message && (
                    <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-700">
                        <p className="text-sm text-white/70">{accountRequest.message}</p>
                    </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                    <p className="text-xs text-white/50">
                        {formatDate(accountRequest.created_at)}
                    </p>

                    <div className="flex gap-2">
                        <button
                            onClick={onReject}
                            disabled={isPending}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            {isRejectPending && <Spinner />}
                            Reject
                        </button>
                        <button
                            onClick={onApprove}
                            disabled={isPending}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-purple-500/50 transition-colors">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                        {permissionRequest.profiles?.username || 'Unknown User'}
                    </h3>
                    <p className="text-sm text-white/70">{permissionRequest.profiles?.email}</p>
                </div>
                <div className="flex gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(permissionRequest.current_role)}`}>
                        {permissionRequest.current_role}
                    </span>
                    <svg className="w-4 h-4 text-white/50 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(permissionRequest.requested_role)}`}>
                        {permissionRequest.requested_role}
                    </span>
                </div>
            </div>

            {permissionRequest.reason && (
                <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-700">
                    <p className="text-xs text-white/50 mb-1">Reason</p>
                    <p className="text-sm text-white/70">{permissionRequest.reason}</p>
                </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <p className="text-xs text-white/50">
                    {formatDate(permissionRequest.created_at)}
                </p>

                <div className="flex gap-2">
                    <button
                        onClick={onReject}
                        disabled={isPending}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                        {isRejectPending && <Spinner />}
                        Reject
                    </button>
                    <button
                        onClick={onApprove}
                        disabled={isPending}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
