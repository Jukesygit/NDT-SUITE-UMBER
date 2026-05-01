/**
 * PendingApprovalsView - Display competencies pending document approval
 */

import { useState } from 'react';
import { usePendingApprovals, type PendingApproval } from '../../hooks/queries/useCompetencies';
import { DocumentReviewModal } from './DocumentReviewModal';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';

interface PendingApprovalsViewProps {
    pendingApprovals?: PendingApproval[];
    onRefresh?: () => void;
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function getDaysSinceSubmission(createdAt: string): number {
    return Math.ceil((new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

interface GroupedByUser {
    user: PendingApproval['user'];
    approvals: PendingApproval[];
}

function groupByUser(pendingApprovals: PendingApproval[]): Record<string, GroupedByUser> {
    const grouped: Record<string, GroupedByUser> = {};
    pendingApprovals.forEach((approval) => {
        if (!grouped[approval.user_id]) {
            grouped[approval.user_id] = { user: approval.user, approvals: [] };
        }
        grouped[approval.user_id].approvals.push(approval);
    });
    return grouped;
}

export function PendingApprovalsView({ pendingApprovals: propApprovals, onRefresh }: PendingApprovalsViewProps) {
    const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
    const { data: queryData, isLoading, refetch } = usePendingApprovals();

    const pendingApprovals = propApprovals ?? queryData ?? [];
    const handleRefresh = onRefresh ?? (() => refetch());

    if (!propApprovals && isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <MatrixLogoRacer size={120} duration={3} />
                <div className="pm-loading-muted">Loading pending approvals...</div>
            </div>
        );
    }

    const groupedByUser = groupByUser(pendingApprovals);
    const hasPending = Object.keys(groupedByUser).length > 0;

    const handleReviewClick = (approval: PendingApproval) => setSelectedApproval(approval);
    const handleModalClose = () => setSelectedApproval(null);
    const handleActionComplete = () => {
        setSelectedApproval(null);
        handleRefresh();
    };

    return (
        <div>
            <div className="pm-section-header">
                <h2 className="pm-section-title">Pending Document Approvals</h2>
                <p className="pm-section-subtitle">Review and approve competency documents submitted by personnel</p>
            </div>

            {!hasPending ? (
                <div className="pm-display-well">
                    <div className="pm-display">
                        <div className="pm-empty">
                            <div className="pm-empty-icon">
                                <svg viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div className="pm-empty-title">All caught up</div>
                            <div className="pm-empty-text">No documents pending approval</div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pm-card-list">
                    {Object.values(groupedByUser).map(({ user, approvals }, index) => (
                        <div key={user?.id || 'unknown'} className="pm-person-card" style={{ animationDelay: `${index * 0.05}s` }}>
                            <div className="pm-person-card-inner">
                                <div className="pm-person-card-header">
                                    <div>
                                        <div className="pm-person-card-name">{user?.username || 'Unknown User'}</div>
                                        <div className="pm-person-card-meta">
                                            {user?.email} {user?.organizations?.name && `· ${user.organizations.name}`}
                                        </div>
                                    </div>
                                    <span className="pm-badge pending no-dot">{approvals.length} pending</span>
                                </div>

                                <div className="pm-card-items">
                                    {approvals.map((approval) => {
                                        const daysSinceSubmission = getDaysSinceSubmission(approval.created_at);
                                        const isOld = daysSinceSubmission > 7;

                                        return (
                                            <div
                                                key={approval.id}
                                                className="pm-competency-item clickable"
                                                onClick={() => handleReviewClick(approval)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleReviewClick(approval)}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                <div className="pm-comp-item-flex1">
                                                    <div className="pm-comp-name--flex">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pm-doc-icon--muted">
                                                            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        <span className="pm-competency-name" style={{ marginBottom: 0 }}>
                                                            {approval.competency?.name || 'Unknown Competency'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-competency-meta">
                                                        <span>{approval.competency?.category?.name || 'Uncategorized'}</span>
                                                        <span className={isOld ? 'pm-cert-stat expiring' : ''}>
                                                            Submitted {formatDate(approval.created_at)}
                                                            {isOld && ` (${daysSinceSubmission} days ago)`}
                                                        </span>
                                                    </div>
                                                    {approval.document_name && (
                                                        <div className="pm-competency-doc">{approval.document_name}</div>
                                                    )}
                                                </div>
                                                <div className="pm-competency-actions">
                                                    {isOld && <span className="pm-badge overdue no-dot">OVERDUE</span>}
                                                    <button
                                                        className="pm-btn sm"
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
                        </div>
                    ))}
                </div>
            )}

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
