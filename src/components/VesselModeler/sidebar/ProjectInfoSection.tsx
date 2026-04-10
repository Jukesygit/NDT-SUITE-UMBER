import { useRef } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import type { VesselState, ReferenceDrawing } from '../types';
import { Section } from './SliderRow';

export interface ProjectInfoSectionProps {
    vesselState: VesselState;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
}

export function ProjectInfoSection({ vesselState, onUpdateDimensions }: ProjectInfoSectionProps) {
    const drawingInputRef = useRef<HTMLInputElement>(null);

    const handleDrawingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const newDrawing: ReferenceDrawing = {
                id: Date.now(),
                title: file.name.replace(/\.[^.]+$/, ''),
                imageData: reader.result as string,
                fileName: file.name,
            };
            onUpdateDimensions({
                referenceDrawings: [...(vesselState.referenceDrawings ?? []), newDrawing],
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const removeDrawing = (id: number) => {
        onUpdateDimensions({
            referenceDrawings: (vesselState.referenceDrawings ?? []).filter(d => d.id !== id),
        });
    };

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

            {/* Reference Drawings */}
            <div className="vm-control-group" style={{ marginTop: 12 }}>
                <div className="vm-label"><span>Reference Drawings</span></div>
                {(vesselState.referenceDrawings ?? []).map(d => (
                    <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', marginBottom: 4,
                        background: 'rgba(255,255,255,0.05)', borderRadius: 4,
                        fontSize: '0.8rem', color: '#ccc',
                    }}>
                        <input
                            type="text"
                            className="vm-input"
                            value={d.title}
                            onChange={e => {
                                const updated = (vesselState.referenceDrawings ?? []).map(
                                    dr => dr.id === d.id ? { ...dr, title: e.target.value } : dr
                                );
                                onUpdateDimensions({ referenceDrawings: updated });
                            }}
                            style={{ flex: 1 }}
                        />
                        <button
                            className="vm-btn-icon"
                            onClick={() => removeDrawing(d.id)}
                            title="Remove drawing"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                <button
                    className="vm-btn vm-btn-primary"
                    onClick={() => drawingInputRef.current?.click()}
                    style={{ width: '100%' }}
                >
                    <Upload size={14} /> Add Drawing
                </button>
                <input
                    ref={drawingInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={handleDrawingUpload}
                />
            </div>
        </Section>
    );
}
