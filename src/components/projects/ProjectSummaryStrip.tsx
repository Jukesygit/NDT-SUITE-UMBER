import type { ProjectVessel } from '../../types/inspection-project';

interface ProjectSummaryStripProps {
    vessels: ProjectVessel[];
}

export function ProjectSummaryStrip({ vessels }: ProjectSummaryStripProps) {
    const total = vessels.length;
    const completed = vessels.filter(v => v.status === 'completed').length;
    const inProgress = vessels.filter(v =>
        ['scanning', 'annotating', 'setup'].includes(v.status)
    ).length;
    const notStarted = vessels.filter(v => v.status === 'not_started').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const stats = [
        { label: 'Vessels', value: total, highlight: false },
        { label: 'Completed', value: completed, highlight: completed > 0 },
        { label: 'In Progress', value: inProgress, highlight: inProgress > 0 },
        { label: 'Not Started', value: notStarted, highlight: false },
    ];

    return (
        <>
            <div className="pj-summary-strip">
                {stats.map(s => (
                    <div key={s.label} className={`pj-summary-stat ${s.highlight ? 'has-value' : ''}`}>
                        <div className="pj-summary-stat-value">{s.value}</div>
                        <div className="pj-summary-stat-label">{s.label}</div>
                    </div>
                ))}
            </div>
            {total > 0 && (
                <div className="pj-summary-progress">
                    <span className="pj-summary-progress-label">Campaign progress</span>
                    <div className="pj-progress-track" style={{ flex: 1 }}>
                        <div
                            className={`pj-progress-fill ${pct >= 100 ? 'complete' : ''}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="pj-progress-label">{pct}%</span>
                </div>
            )}
        </>
    );
}
