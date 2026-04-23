/**
 * ReportReadinessCard - Progress summary with collapsible checklist.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { ProjectVessel, ProjectFile } from '../../../types/inspection-project';

interface ReportReadinessCardProps {
    vessel: ProjectVessel;
    projectId: string;
    files: ProjectFile[];
    compositeCount: number;
}

interface ChecklistItem {
    label: string;
    ready: boolean | null; // null = can't determine (gray dot)
    hint?: string;
}

export function ReportReadinessCard({
    vessel,
    projectId,
    files,
    compositeCount,
}: ReportReadinessCardProps) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);

    const items: ChecklistItem[] = [
        {
            label: 'Component Details',
            ready: !!(vessel.description || vessel.material),
        },
        {
            label: 'Procedure',
            ready: !!vessel.procedure_id,
        },
        {
            label: 'Equipment',
            ready: !!vessel.equipment_config?.model,
        },
        {
            label: 'Calibration Log',
            ready: null,
            hint: 'Check in builder',
        },
        {
            label: 'Scan Log',
            ready: null,
            hint: 'Check in builder',
        },
        {
            label: 'Annotations',
            ready: compositeCount > 0,
        },
        {
            label: 'Documents',
            ready: files.length > 0,
        },
        {
            label: 'Results Summary',
            ready: !!vessel.results_summary,
        },
        {
            label: 'Sign-off',
            ready: !!vessel.signoff_details?.technician?.name,
        },
    ];

    const determinateItems = items.filter((i) => i.ready !== null);
    const readyCount = determinateItems.filter((i) => i.ready === true).length;
    const totalCount = determinateItems.length;
    const progressPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <h4
                style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    margin: '0 0 16px 0',
                }}
            >
                Report Readiness
            </h4>

            {/* Summary line */}
            <div
                style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    marginBottom: 10,
                }}
            >
                <strong>{readyCount}</strong> of <strong>{totalCount}</strong> sections ready
            </div>

            {/* Progress bar */}
            <div
                style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)',
                    marginBottom: 14,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        borderRadius: 3,
                        background: progressPct >= 100 ? '#22c55e' : '#3b82f6',
                        transition: 'width 0.3s ease',
                    }}
                />
            </div>

            {/* Expand/collapse toggle */}
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: 0,
                    marginBottom: expanded ? 10 : 0,
                }}
            >
                <ChevronDown
                    size={14}
                    style={{
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s ease',
                    }}
                />
                {expanded ? 'Hide details' : 'Show details'}
            </button>

            {/* Checklist */}
            {expanded && (
                <ul
                    style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}
                >
                    {items.map((item) => (
                        <li
                            key={item.label}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {/* Status dot */}
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    background:
                                        item.ready === null
                                            ? '#6b7280'
                                            : item.ready
                                              ? '#22c55e'
                                              : '#ef4444',
                                }}
                            />
                            <span>{item.label}</span>
                            {item.hint && (
                                <span
                                    style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--text-tertiary)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    {item.hint}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Open Report Builder button */}
            <button
                className="btn btn--primary btn--sm"
                style={{ marginTop: 14 }}
                onClick={() =>
                    navigate(`/projects/${projectId}/vessels/${vessel.id}/report-builder`)
                }
            >
                Open Report Builder
            </button>
        </div>
    );
}
