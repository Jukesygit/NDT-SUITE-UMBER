import type { DocumentStatus, RevisionStatus } from '../../../types/document-control';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
    under_review: { label: 'Under Review', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
    superseded: { label: 'Superseded', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
    withdrawn: { label: 'Withdrawn', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
};

interface Props {
    status: DocumentStatus | RevisionStatus;
}

export default function DocumentStatusBadge({ status }: Props) {
    const config = statusConfig[status] || statusConfig.draft;

    return (
        <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ color: config.color, backgroundColor: config.bg }}
        >
            {config.label}
        </span>
    );
}
