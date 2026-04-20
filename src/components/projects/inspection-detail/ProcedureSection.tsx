import { useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import { InlineEditField } from '../../ui/InlineEditField';
import {
    useUpdateProjectVessel,
    useUpdateProcedure,
    useCreateProcedure,
} from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel, InspectionProcedure } from '../../../types/inspection-project';

interface ProcedureSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    procedures: InspectionProcedure[];
}

const PROCEDURE_FIELDS: { label: string; key: keyof InspectionProcedure; paramKey: string }[] = [
    { label: 'Procedure Number', key: 'procedure_number', paramKey: 'procedureNumber' },
    { label: 'Technique Numbers', key: 'technique_numbers', paramKey: 'techniqueNumbers' },
    { label: 'Acceptance Criteria', key: 'acceptance_criteria', paramKey: 'acceptanceCriteria' },
    { label: 'Applicable Standard', key: 'applicable_standard', paramKey: 'applicableStandard' },
];

const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    fontWeight: 500,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
};

export default function ProcedureSection({ vessel, projectId, procedures }: ProcedureSectionProps) {
    const updateVessel = useUpdateProjectVessel();
    const updateProcedure = useUpdateProcedure();
    const createProcedure = useCreateProcedure();

    const linkedProcedure = procedures.find((p) => p.id === vessel.procedure_id) ?? null;

    const handleCreate = useCallback(() => {
        createProcedure.mutate(
            { projectId },
            {
                onSuccess: (newProcId) => {
                    updateVessel.mutate({
                        id: vessel.id,
                        params: { procedureId: newProcId },
                        projectId,
                    });
                },
            },
        );
    }, [createProcedure, updateVessel, vessel.id, projectId]);

    const handleSelectProcedure = useCallback(
        (procedureId: string) => {
            updateVessel.mutate({
                id: vessel.id,
                params: { procedureId: procedureId || null },
                projectId,
            });
        },
        [updateVessel, vessel.id, projectId],
    );

    const saveProcedureField = useCallback(
        (paramKey: string, value: string) => {
            if (!linkedProcedure) return;
            updateProcedure.mutate({
                id: linkedProcedure.id,
                params: { [paramKey]: value || null },
                projectId,
            });
        },
        [updateProcedure, linkedProcedure, projectId],
    );

    return (
        <CollapsibleSection title="Procedure">
            {/* Procedure selector when multiple exist */}
            {procedures.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={labelStyle}>Select Procedure</div>
                    <select
                        value={vessel.procedure_id ?? ''}
                        onChange={(e) => handleSelectProcedure(e.target.value)}
                        className="glass-input"
                        style={{ maxWidth: 320 }}
                    >
                        <option value="">-- None --</option>
                        {procedures.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.procedure_number || `Procedure ${p.id.slice(0, 8)}`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {linkedProcedure ? (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px 24px',
                    }}
                >
                    {PROCEDURE_FIELDS.map((f) => (
                        <InlineEditField
                            key={f.key}
                            label={f.label}
                            value={(linkedProcedure[f.key] as string) ?? ''}
                            onSave={(v) => saveProcedureField(f.paramKey, v)}
                        />
                    ))}
                </div>
            ) : (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '12px 0',
                    }}
                >
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
                        No procedure assigned
                    </span>
                    <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={handleCreate}
                        disabled={createProcedure.isPending}
                    >
                        {createProcedure.isPending ? 'Creating...' : 'Create Procedure'}
                    </button>
                </div>
            )}
        </CollapsibleSection>
    );
}
