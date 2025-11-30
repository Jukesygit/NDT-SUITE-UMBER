/**
 * PendingApprovalsView - Display competencies pending document approval
 *
 * Can be used in two ways:
 * 1. With props: Pass pendingApprovals and onRefresh externally
 * 2. Without props: Component fetches data using React Query hook
 */

import { useState } from 'react';
import { usePendingApprovals, type PendingApproval } from '../../hooks/queries/useCompetencies';
import { DocumentReviewModal } from './DocumentReviewModal';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';

interface PendingApprovalsViewProps {
    /** List of pending approvals (optional - will fetch if not provided) */
    pendingApprovals?: PendingApproval[];
    /** Callback when approval status changes (optional) */
    onRefresh?: () => void;
}

/**
 * Document icon
 */
function DocumentIcon() {
    return (
        <svg
            style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.3 }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Calculate days since submission
 */
function getDaysSinceSubmission(createdAt: string): number {
    return Math.ceil((new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Group pending approvals by user
 */
interface GroupedByUser {
    user: PendingApproval['user'];
    approvals: PendingApproval[];
}

function groupByUser(pendingApprovals: PendingApproval[]): Record<string, GroupedByUser> {
    const grouped: Record<string, GroupedByUser> = {};

    pendingApprovals.forEach((approval) => {
        if (!grouped[approval.user_id]) {
            grouped[approval.user_id] = {
                user: approval.user,
                approvals: [],
            };
        }
        grouped[approval.user_id].approvals.push(approval);
    });

    return grouped;
}

/**
 * PendingApprovalsView component
 */
export function PendingApprovalsView({ pendingApprovals: propApprovals, onRefresh }: PendingApprovalsViewProps) {
    const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);

    // Use React Query hook if no props provided
    const { data: queryData, isLoading, refetch } = usePendingApprovals();

    // Use props if provided, otherwise use query data
    const pendingApprovals = propApprovals ?? queryData ?? [];
    const handleRefresh = onRefresh ?? (() => refetch());

    // Show loading state when using internal query
    if (!propApprovals && isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <MatrixLogoRacer size={120} duration={3} />
                <div className="text-gray-400 animate-pulse">Loading pending approvals...</div>
            </div>
        );
    }

    const groupedByUser = groupByUser(pendingApprovals);
    const hasPending = Object.keys(groupedByUser).length > 0;

    const handleReviewClick = (approval: PendingApproval) => {
        setSelectedApproval(approval);
    };

    const handleModalClose = () => {
        setSelectedApproval(null);
    };

    const handleActionComplete = () => {
        setSelectedApproval(null);
        handleRefresh();
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                    Pending Document Approvals
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                    Review and approve competency documents submitted by personnel
                </p>
            </div>

            {/* Content */}
            {!hasPending ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                    <DocumentIcon />
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
                        No documents pending approval
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.values(groupedByUser).map(({ user, approvals }) => (
                        <div key={user?.id || 'unknown'} className="glass-card" style={{ padding: '20px' }}>
                            {/* User Header */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'start',
                                    marginBottom: '16px',
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            color: '#ffffff',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        {user?.username || 'Unknown User'}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        {user?.email} {user?.organizations?.name && `• ${user.organizations.name}`}
                                    </div>
                                </div>
                                <span className="glass-badge badge-yellow">{approvals.length} pending</span>
                            </div>

                            {/* Pending Approvals List */}
                            <div className="space-y-2">
                                {approvals.map((approval) => {
                                    const daysSinceSubmission = getDaysSinceSubmission(approval.created_at);
                                    const isOld = daysSinceSubmission > 7;

                                    return (
                                        <div
                                            key={approval.id}
                                            className="glass-item"
                                            style={{
                                                padding: '12px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.15s',
                                            }}
                                            onClick={() => handleReviewClick(approval)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleReviewClick(approval)}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div
                                                    style={{
                                                        fontWeight: '500',
                                                        color: '#ffffff',
                                                        marginBottom: '4px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                    }}
                                                >
                                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.6 }}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    {approval.competency?.name || 'Unknown Competency'}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: '13px',
                                                        color: 'rgba(255, 255, 255, 0.5)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                    }}
                                                >
                                                    <span>{approval.competency?.category?.name || 'Uncategorized'}</span>
                                                    <span>•</span>
                                                    <span style={{ color: isOld ? '#f59e0b' : 'rgba(255, 255, 255, 0.5)' }}>
                                                        Submitted {formatDate(approval.created_at)}
                                                        {isOld && ` (${daysSinceSubmission} days ago)`}
                                                    </span>
                                                </div>
                                                {approval.document_name && (
                                                    <div
                                                        style={{
                                                            fontSize: '12px',
                                                            color: 'rgba(96, 165, 250, 0.8)',
                                                            marginTop: '4px',
                                                        }}
                                                    >
                                                        {approval.document_name}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {isOld && (
                                                    <span className="glass-badge badge-yellow" style={{ fontSize: '11px' }}>
                                                        OVERDUE
                                                    </span>
                                                )}
                                                <button
                                                    className="btn-glass"
                                                    style={{
                                                        padding: '8px 16px',
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleReviewClick(approval);
                                                    }}
                                                >
                                                    Review
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Document Review Modal */}
            {selectedApproval && (
                <DocumentReviewModal
                    approval={selectedApproval}
                    onClose={handleModalClose}
                    onActionComplete={handleActionComplete}
                />
            )}
        </div>
    );
}

export default PendingApprovalsView;
