import { ArrowLeftRight, ArrowUpDown, Ruler } from 'lucide-react';
import type { VesselState, Orientation } from '../types';
import { SliderRow, Section } from './SliderRow';

export interface DimensionsSectionProps {
    vesselState: VesselState;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
}

export function DimensionsSection({ vesselState, onUpdateDimensions }: DimensionsSectionProps) {
    return (
        <Section title="Dimensions" icon={<Ruler size={14} style={{ marginRight: 6 }} />}>
            <SliderRow
                label="Inner Diameter"
                value={vesselState.id}
                min={100}
                max={10000}
                step={50}
                onChange={v => onUpdateDimensions({ id: v })}
            />
            <SliderRow
                label="Tan-Tan Length"
                value={vesselState.length}
                min={100}
                max={50000}
                step={100}
                onChange={v => onUpdateDimensions({ length: v })}
            />
            <div className="vm-control-group">
                <div className="vm-label"><span>Head Ratio</span></div>
                <select
                    className="vm-select"
                    value={vesselState.headRatio}
                    onChange={e => onUpdateDimensions({ headRatio: Number(e.target.value) })}
                >
                    <option value={2}>2:1 Ellipsoidal</option>
                    <option value={3}>3:1 Ellipsoidal</option>
                    <option value={4}>4:1 Ellipsoidal</option>
                </select>
            </div>
            <div className="vm-control-group-spaced">
                <div className="vm-label"><span>Orientation</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${vesselState.orientation === 'horizontal' ? 'active' : ''}`}
                        onClick={() => onUpdateDimensions({ orientation: 'horizontal' as Orientation })}
                    >
                        <ArrowLeftRight size={14} /> Horizontal
                    </button>
                    <button
                        className={`vm-toggle-btn ${vesselState.orientation === 'vertical' ? 'active' : ''}`}
                        onClick={() => onUpdateDimensions({ orientation: 'vertical' as Orientation })}
                    >
                        <ArrowUpDown size={14} /> Vertical
                    </button>
                </div>
            </div>
        </Section>
    );
}
