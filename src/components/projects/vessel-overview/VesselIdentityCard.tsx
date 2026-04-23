/**
 * VesselIdentityCard - Compact editable grid of vessel identity fields.
 */

import { useCallback } from 'react';
import { InlineEditField } from '../../ui/InlineEditField';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel, ProjectFile } from '../../../types/inspection-project';

interface VesselIdentityCardProps {
    vessel: ProjectVessel;
    projectId: string;
    files?: ProjectFile[];
    procedures?: { id: string; procedure_number?: string | null }[];
}

export function VesselIdentityCard({ vessel, projectId, procedures }: VesselIdentityCardProps) {
    const updateVessel = useUpdateProjectVessel();

    const save = useCallback(
        (field: string, value: string) => {
            updateVessel.mutate({
                id: vessel.id,
                projectId,
                params: { [field]: value || null },
            });
        },
        [vessel.id, projectId, updateVessel],
    );

    const linkedProcedure = vessel.procedure_id
        ? procedures?.find((p) => p.id === vessel.procedure_id)
        : null;

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
                Vessel Identity
            </h4>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                }}
            >
                <InlineEditField
                    label="Material"
                    value={vessel.material ?? ''}
                    onSave={(v) => save('material', v)}
                />
                <InlineEditField
                    label="Nominal Thickness"
                    value={vessel.nominal_thickness ?? ''}
                    onSave={(v) => save('nominalThickness', v)}
                />
                <InlineEditField
                    label="Drawing Number"
                    value={vessel.drawing_number ?? ''}
                    onSave={(v) => save('drawingNumber', v)}
                />
                <InlineEditField
                    label="Description"
                    value={vessel.description ?? ''}
                    onSave={(v) => save('description', v)}
                    fullWidth
                />
            </div>

            {linkedProcedure && (
                <div
                    style={{
                        marginTop: 14,
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <span style={{ fontWeight: 500 }}>Procedure:</span>{' '}
                    <span style={{ color: 'var(--text-primary)' }}>
                        {linkedProcedure.procedure_number ?? 'Untitled'}
                    </span>
                </div>
            )}
        </div>
    );
}
