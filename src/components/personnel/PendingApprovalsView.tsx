// @ts-nocheck - Component extracted from large page, uses JS imports that lack TypeScript definitions
import React, { useState } from 'react';
import competencyService from '../../services/competency-service.ts';
import confirmDialog from '../ConfirmDialog.jsx';
import toast from '../Toast.jsx';

/**
 * Pending approval item structure
 */
interface PendingApproval {
    id: string;
    user_id: string;
    user: {
        id: string;
        username: string;
        email: string;
    };
    competency?: {
        name: string;
        category?: {
            name: string;
        };
    };
    issuing_body?: string;
    certification_id?: string;
    expiry_date?: string;
    created_at?: string;
    document_url?: string;
    document_name?: string;
}

/**
 * PendingApprovalsView component props
 */
interface PendingApprovalsViewProps {
    pendingApprovals: PendingApproval[];
    onRefresh: () => Promise<void>;
}

/**
 * Pending Approvals View Component
 *
 * Displays competency documents awaiting admin approval:
 * - Grouped by user for easy review
 * - Shows document details and metadata
 * - Inline document viewer
 * - Approve/reject with confirmation
 * - Reason input for rejections
 *
 * Features:
 * - Optimistic UI updates
 * - Destructive action confirmations
 * - Document preview integration
 */
export function PendingApprovalsView({
    pendingApprovals,
    onRefresh
}: PendingApprovalsViewProps) {
    const [approving, setApproving] = useState<string | null>(null);

    const handleApprove = async (competencyId: string, approved: boolean, reason: string | null = null) => {
        // Confirm destructive reject action
        if (!approved) {
            const confirmed = await confirmDialog({
                title: 'Reject Competency?',
                message: 'Are you sure you want to reject this competency? This action will notify the user.',
                confirmText: 'Reject',
                cancelText: 'Cancel',
                destructive: true
            });
            if (!confirmed) return;
        }

        setApproving(competencyId);
        try {
            await competencyService.verifyCompetency(competencyId, approved, reason);
            if (approved) {
                toast.success('Competency approved successfully!');
            } else {
                toast.warning('Competency rejected.');
            }
            await onRefresh();
        } catch (error: any) {
            console.error('Error verifying competency:', error);
            toast.error(`Failed to process approval: ${error.message}`);
        } finally {
            setApproving(null);
        }
    };

    const groupedByPerson: { [key: string]: { user: any; competencies: PendingApproval[] } } = {};
    pendingApprovals.forEach(comp => {
        // Skip if user data is missing
        if (!comp.user) {
            console.warn('Competency approval has no user data:', comp);
            return;
        }

        if (!groupedByPerson[comp.user_id]) {
            groupedByPerson[comp.user_id] = {
                user: comp.user,
                competencies: []
            };
        }
        groupedByPerson[comp.user_id].competencies.push(comp);
    });

    return (
        <div>
            <div className="mb-6">
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                    Pending Document Approvals
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                    Review and approve competency documents submitted by users
                </p>
            </div>

            {Object.keys(groupedByPerson).length === 0 ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                    <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
                        No pending approvals
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.values(groupedByPerson).map(({ user, competencies }) => (
                        <div key={user.id} className="glass-card" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
                                        {user.username}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                        {user.email}
                                    </div>
                                </div>
                                <span className="glass-badge" style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '11px' }}>
                                    {competencies.length} pending
                                </span>
                            </div>

                            <div className="space-y-3">
                                {competencies.map(comp => (
                                    <div key={comp.id} style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', borderLeft: '4px solid #f59e0b' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
                                                    {comp.competency?.name}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                                    {comp.competency?.category?.name}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' }}>
                                            {comp.issuing_body && (
                                                <div style={{ marginBottom: '6px' }}>
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Issuer:</span>{' '}
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.issuing_body}</span>
                                                </div>
                                            )}
                                            {comp.certification_id && (
                                                <div style={{ marginBottom: '6px' }}>
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>ID:</span>{' '}
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.certification_id}</span>
                                                </div>
                                            )}
                                            {comp.expiry_date && (
                                                <div style={{ marginBottom: '6px' }}>
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Expires:</span>{' '}
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{new Date(comp.expiry_date).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {comp.created_at && (
                                                <div style={{ marginBottom: '6px' }}>
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Submitted:</span>{' '}
                                                    <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{new Date(comp.created_at).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                        </div>

                                        {comp.document_url && comp.document_name && (
                                            <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <svg style={{ width: '18px', height: '18px', color: '#10b981', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <div style={{ flex: 1, fontSize: '13px', color: 'rgba(255, 255, 255, 0.9)' }}>
                                                        {comp.document_name}
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const url = await competencyService.getDocumentUrl(comp.document_url!);
                                                                window.open(url, '_blank');
                                                            } catch (error: any) {
                                                                console.error('Error opening document:', error);
                                                                toast.error(`Failed to open document: ${error.message}`);
                                                            }
                                                        }}
                                                        className="btn btn--secondary btn--sm"
                                                        style={{ fontSize: '11px', padding: '4px 12px' }}
                                                    >
                                                        View
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => {
                                                    const reason = prompt('Optional: Enter a reason for rejection');
                                                    if (reason !== null) { // null means cancelled
                                                        handleApprove(comp.id, false, reason);
                                                    }
                                                }}
                                                className="btn btn--secondary btn--sm"
                                                style={{ flex: 1 }}
                                                disabled={approving === comp.id}
                                            >
                                                <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Reject
                                            </button>
                                            <button
                                                onClick={() => handleApprove(comp.id, true)}
                                                className="btn btn--primary btn--sm"
                                                style={{ flex: 1 }}
                                                disabled={approving === comp.id}
                                            >
                                                <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                                {approving === comp.id ? 'Processing...' : 'Approve'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PendingApprovalsView;
