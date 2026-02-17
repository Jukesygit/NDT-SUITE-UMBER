import { useDocumentStats } from '../../../hooks/queries/useDocuments';

export default function DocumentStats() {
    const { data: stats } = useDocumentStats();

    if (!stats) return null;

    const cards = [
        { label: 'Total Documents', value: stats.total, color: 'var(--accent-primary)' },
        { label: 'Approved', value: stats.approved, color: '#22c55e' },
        { label: 'Draft', value: stats.draft, color: '#94a3b8' },
        { label: 'Under Review', value: stats.underReview, color: '#f59e0b' },
        { label: 'Due for Review', value: stats.dueForReview, color: '#3b82f6' },
        { label: 'Overdue', value: stats.overdue, color: '#ef4444' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className="glass-panel p-4 rounded-lg text-center"
                    style={{ borderLeft: `3px solid ${card.color}` }}
                >
                    <div className="text-2xl font-bold" style={{ color: card.color }}>
                        {card.value}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{card.label}</div>
                </div>
            ))}
        </div>
    );
}
