import { useState, useCallback } from 'react';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../../types/inspection-project';

interface VesselIdentityCardProps {
    vessel: ProjectVessel;
    projectId: string;
    procedures?: { id: string; procedure_number?: string | null }[];
}

function PanelField({
    label,
    value,
    onSave,
    fullWidth,
}: {
    label: string;
    value: string;
    onSave?: (v: string) => void;
    fullWidth?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== value && onSave) onSave(trimmed);
    };

    const startEdit = () => {
        if (!onSave) return;
        setDraft(value);
        setEditing(true);
    };

    if (editing) {
        return (
            <div className={`pj-panel-field${fullWidth ? ' full-width' : ''}`}>
                <span className="pj-panel-field-label">{label}</span>
                <input
                    autoFocus
                    className="pj-panel-field-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div
            className={`pj-panel-field${fullWidth ? ' full-width' : ''}`}
            onClick={startEdit}
            style={onSave ? undefined : { cursor: 'default' }}
        >
            <span className="pj-panel-field-label">{label}</span>
            <span className={`pj-panel-field-value${!value ? ' empty' : ''}`}>
                {value || '—'}
            </span>
        </div>
    );
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
        <div className="pj-panel-fields">
            <PanelField label="Material" value={vessel.material ?? ''} onSave={(v) => save('material', v)} />
            <PanelField label="Nominal Thickness" value={vessel.nominal_thickness ?? ''} onSave={(v) => save('nominalThickness', v)} />
            <PanelField label="Drawing Number" value={vessel.drawing_number ?? ''} onSave={(v) => save('drawingNumber', v)} />
            {linkedProcedure && (
                <PanelField label="Procedure" value={linkedProcedure.procedure_number ?? 'Untitled'} />
            )}
            <PanelField label="Description" value={vessel.description ?? ''} onSave={(v) => save('description', v)} fullWidth />
        </div>
    );
}
