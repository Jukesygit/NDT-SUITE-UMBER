import { FileText } from 'lucide-react';
import type { VesselState } from '../types';
import { Section } from './SliderRow';

export interface ProjectInfoSectionProps {
    vesselState: VesselState;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
}

export function ProjectInfoSection({ vesselState, onUpdateDimensions }: ProjectInfoSectionProps) {
    return (
        <Section title="Project Info" icon={<FileText size={14} style={{ marginRight: 6 }} />}>
            <div className="vm-control-group">
                <div className="vm-label"><span>Vessel Name</span></div>
                <input
                    type="text"
                    className="vm-input"
                    placeholder="e.g. V-2401"
                    value={vesselState.vesselName}
                    onChange={e => onUpdateDimensions({ vesselName: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
            <div className="vm-control-group">
                <div className="vm-label"><span>Location</span></div>
                <input
                    type="text"
                    className="vm-input"
                    placeholder="e.g. Karstoe Terminal"
                    value={vesselState.location}
                    onChange={e => onUpdateDimensions({ location: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
            <div className="vm-control-group">
                <div className="vm-label"><span>Inspection Date</span></div>
                <input
                    type="date"
                    className="vm-input"
                    value={vesselState.inspectionDate}
                    onChange={e => onUpdateDimensions({ inspectionDate: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
        </Section>
    );
}
