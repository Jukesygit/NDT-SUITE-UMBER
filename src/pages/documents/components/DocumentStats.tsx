import { useDocumentStats } from '../../../hooks/queries/useDocuments';

export default function DocumentStats() {
    const { data: stats } = useDocumentStats();

    if (!stats) return null;

    const cards = [
        {
            label: 'Total Documents',
            value: stats.total,
            variant: 'total',
            icon: (
                <svg viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
            ),
        },
        {
            label: 'Approved',
            value: stats.approved,
            variant: 'approved',
            icon: (
                <svg viewBox="0 0 24 24">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            ),
        },
        {
            label: 'Under Review',
            value: stats.underReview,
            variant: 'review',
            icon: (
                <svg viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            ),
        },
        {
            label: 'Draft',
            value: stats.draft,
            variant: 'draft',
            icon: (
                <svg viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
            ),
        },
        {
            label: 'Due for Review',
            value: stats.dueForReview,
            variant: 'due',
            icon: (
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            ),
        },
        {
            label: 'Overdue',
            value: stats.overdue,
            variant: 'overdue',
            icon: (
                <svg viewBox="0 0 24 24">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
        },
    ];

    return (
        <div className="dc-stats-grid">
            {cards.map((card, i) => (
                <div
                    key={card.label}
                    className={`dc-stat-card ${card.variant}`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                >
                    <div className="dc-stat-icon">{card.icon}</div>
                    <div className="dc-stat-value">{card.value}</div>
                    <div className="dc-stat-label">{card.label}</div>
                </div>
            ))}
        </div>
    );
}
