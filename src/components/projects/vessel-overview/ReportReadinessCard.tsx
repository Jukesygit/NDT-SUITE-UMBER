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
    ready: boolean | null;
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
        { label: 'Component Details', ready: !!(vessel.description || vessel.material) },
        { label: 'Procedure', ready: !!vessel.procedure_id },
        { label: 'Equipment', ready: !!vessel.equipment_config?.model },
        { label: 'Calibration Log', ready: null, hint: 'Check in builder' },
        { label: 'Scan Log', ready: null, hint: 'Check in builder' },
        { label: 'Annotations', ready: compositeCount > 0 },
        { label: 'Documents', ready: files.length > 0 },
        { label: 'Results Summary', ready: !!vessel.results_summary },
        { label: 'Sign-off', ready: !!vessel.signoff_details?.technician?.name },
    ];

    const determinateItems = items.filter((i) => i.ready !== null);
    const readyCount = determinateItems.filter((i) => i.ready === true).length;
    const totalCount = determinateItems.length;
    const progressPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

    return (
        <div className="pj-info-card">
            <div className="pj-info-card-inner">
                <h4 className="pj-info-card-title">Report Readiness</h4>

                <div style={{ marginBottom: 8 }}>
                    <span className="pj-info-field-value">
                        <strong>{readyCount}</strong> of <strong>{totalCount}</strong> sections ready
                    </span>
                </div>

                <div className="pj-progress-wrap" style={{ marginBottom: 12 }}>
                    <div className="pj-progress-track" style={{ flex: 1 }}>
                        <div
                            className={`pj-progress-fill ${progressPct >= 100 ? 'complete' : ''}`}
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                <button onClick={() => setExpanded(!expanded)} className="pj-expand-toggle" style={{ marginBottom: expanded ? 8 : 0 }}>
                    <ChevronDown
                        size={12}
                        style={{
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                            transition: 'transform 0.2s ease',
                        }}
                    />
                    {expanded ? 'Hide details' : 'Show details'}
                </button>

                {expanded && (
                    <ul className="pj-checklist">
                        {items.map((item) => (
                            <li key={item.label} className="pj-checklist-item">
                                <span
                                    className={`pj-led ${
                                        item.ready === null ? 'neutral' : item.ready ? 'active' : 'danger'
                                    }`}
                                    style={{ width: 6, height: 6 }}
                                />
                                <span>{item.label}</span>
                                {item.hint && <span className="pj-checklist-hint">{item.hint}</span>}
                            </li>
                        ))}
                    </ul>
                )}

                <button
                    className="pj-quick-action-btn primary"
                    style={{ marginTop: 12 }}
                    onClick={() => navigate(`/projects/${projectId}/vessels/${vessel.id}/report-builder`)}
                >
                    Open Report Builder
                </button>
            </div>
        </div>
    );
}
