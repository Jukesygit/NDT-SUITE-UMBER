import type { DocumentStatus, RevisionStatus } from '../../../types/document-control';

const statusConfig: Record<string, { label: string; cssClass: string }> = {
    draft: { label: 'Draft', cssClass: 'draft' },
    under_review: { label: 'Under Review', cssClass: 'under_review' },
    approved: { label: 'Approved', cssClass: 'approved' },
    superseded: { label: 'Superseded', cssClass: 'superseded' },
    withdrawn: { label: 'Withdrawn', cssClass: 'withdrawn' },
    rejected: { label: 'Rejected', cssClass: 'rejected' },
};

interface Props {
    status: DocumentStatus | RevisionStatus;
}

export default function DocumentStatusBadge({ status }: Props) {
    const config = statusConfig[status] || statusConfig.draft;

    return (
        <span className={`dc-badge ${config.cssClass}`}>
            {config.label}
        </span>
    );
}
