import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { ProjectVessel } from '../../types/inspection-project';

interface AttentionItem {
    vessel: ProjectVessel;
    reason: string;
}

interface ProjectAttentionQueueProps {
    projectId: string;
    vessels: ProjectVessel[];
    compositeCountByVessel: Map<string, number>;
    projectStatus: string;
}

function getAttentionItems(
    vessels: ProjectVessel[],
    compositeCountByVessel: Map<string, number>,
    projectStatus: string,
): AttentionItem[] {
    const items: AttentionItem[] = [];

    for (const v of vessels) {
        if (v.status === 'completed' || v.status === 'report_ready') continue;

        const scanCount = compositeCountByVessel.get(v.id) ?? 0;
        const pastSetup = ['scanning', 'annotating'].includes(v.status);

        if (pastSetup && scanCount === 0) {
            items.push({ vessel: v, reason: 'No scans uploaded' });
        } else if (v.status === 'not_started' && projectStatus === 'in_progress') {
            items.push({ vessel: v, reason: 'Not started' });
        } else if (v.status !== 'not_started' && !v.ga_drawing) {
            items.push({ vessel: v, reason: 'Missing GA drawing' });
        }
    }

    return items;
}

export function ProjectAttentionQueue({
    projectId,
    vessels,
    compositeCountByVessel,
    projectStatus,
}: ProjectAttentionQueueProps) {
    const navigate = useNavigate();
    const items = getAttentionItems(vessels, compositeCountByVessel, projectStatus);

    if (items.length === 0) return null;

    return (
        <div className="pj-attention">
            <div className="pj-attention-label">Needs Attention</div>
            <div className="pj-attention-list">
                {items.map(item => (
                    <button
                        key={item.vessel.id}
                        className="pj-attention-item"
                        onClick={() => navigate(`/projects/${projectId}/vessels/${item.vessel.id}`)}
                    >
                        <AlertTriangle size={14} className="pj-attention-item-icon" />
                        <span className="pj-attention-item-vessel">
                            {item.vessel.vessel_tag ? `${item.vessel.vessel_tag} — ` : ''}
                            {item.vessel.vessel_name}
                        </span>
                        <span className="pj-attention-item-sep">·</span>
                        <span className="pj-attention-item-reason">{item.reason}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
