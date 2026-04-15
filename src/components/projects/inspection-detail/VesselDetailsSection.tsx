import { useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import { InlineEditField } from '../../ui/InlineEditField';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel, ProjectFile } from '../../../types/inspection-project';

interface VesselDetailsSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    files?: ProjectFile[];
}

const TEXT_FIELDS: { label: string; key: keyof ProjectVessel; paramKey: string }[] = [
    { label: 'Description', key: 'description', paramKey: 'description' },
    { label: 'Drawing Number', key: 'drawing_number', paramKey: 'drawingNumber' },
    { label: 'Line / Tag Number', key: 'line_tag_number', paramKey: 'lineTagNumber' },
    { label: 'Nominal Thickness', key: 'nominal_thickness', paramKey: 'nominalThickness' },
    { label: 'Material', key: 'material', paramKey: 'material' },
    { label: 'Temperature', key: 'operating_temperature', paramKey: 'operatingTemperature' },
    { label: 'Stress Relief', key: 'stress_relief', paramKey: 'stressRelief' },
    { label: 'Corrosion Allowance', key: 'corrosion_allowance', paramKey: 'corrosionAllowance' },
];

const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    fontWeight: 500,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
};

export default function VesselDetailsSection({ vessel, projectId, files }: VesselDetailsSectionProps) {
    const updateVessel = useUpdateProjectVessel();

    const saveField = useCallback(
        (paramKey: string, value: string) => {
            updateVessel.mutate({
                id: vessel.id,
                params: { [paramKey]: value || null },
                projectId,
            });
        },
        [updateVessel, vessel.id, projectId],
    );

    // Auto-populate drawing number from GA file name if not already set
    const gaFile = files?.find(f => f.file_type === 'ga_drawing');
    const suggestedDrawingNumber = gaFile
        ? gaFile.filename.replace(/\.[^.]+$/, '') // strip extension
        : null;

    return (
        <CollapsibleSection title="Component Details">
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px 24px',
                }}
            >
                {TEXT_FIELDS.map((f) => {
                    let fieldValue = (vessel[f.key] as string) ?? '';

                    // For drawing number, show suggestion from GA file if empty
                    const showSuggestion = f.key === 'drawing_number' && !fieldValue && suggestedDrawingNumber;

                    return (
                        <div key={f.key}>
                            {showSuggestion ? (
                                <>
                                    <div style={labelStyle}>
                                        Drawing Number
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-quaternary)', fontStyle: 'italic' }}>
                                            {suggestedDrawingNumber}
                                        </span>
                                        <button
                                            onClick={() => saveField('drawingNumber', suggestedDrawingNumber!)}
                                            className="btn btn--primary btn--sm"
                                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                        >
                                            Use from GA
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <InlineEditField
                                    label={f.label}
                                    value={fieldValue}
                                    onSave={(v) => saveField(f.paramKey, v)}
                                />
                            )}
                        </div>
                    );
                })}

                {/* Coated toggle */}
                <div>
                    <div style={labelStyle}>Coated</div>
                    <label
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: '0.875rem', color: 'var(--text-primary)',
                            cursor: 'pointer', padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={vessel.coating_type === 'true' || vessel.coating_type === 'Coated'}
                            onChange={(e) => {
                                updateVessel.mutate({
                                    id: vessel.id,
                                    params: { coatingType: e.target.checked ? 'Coated' : null },
                                    projectId,
                                });
                            }}
                            style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        {(vessel.coating_type === 'true' || vessel.coating_type === 'Coated') ? 'Yes' : 'No'}
                    </label>
                </div>

                {/* Insulated toggle */}
                <div>
                    <div style={labelStyle}>Insulated</div>
                    <label
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: '0.875rem', color: 'var(--text-primary)',
                            cursor: 'pointer', padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={vessel.is_insulated}
                            onChange={(e) => {
                                updateVessel.mutate({
                                    id: vessel.id,
                                    params: { isInsulated: e.target.checked },
                                    projectId,
                                });
                            }}
                            style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        {vessel.is_insulated ? 'Yes' : 'No'}
                    </label>
                </div>
            </div>
        </CollapsibleSection>
    );
}
