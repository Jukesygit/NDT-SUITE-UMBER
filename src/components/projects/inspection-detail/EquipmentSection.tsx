import { useState, useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import { InlineEditField } from '../../ui/InlineEditField';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type {
    ProjectVessel,
    EquipmentConfig,
    VesselEquipmentConfig,
    BeamsetRow,
} from '../../../types/inspection-project';

interface EquipmentSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    projectEquipment: EquipmentConfig;
}

const EQUIP_FIELDS: { label: string; key: keyof VesselEquipmentConfig }[] = [
    { label: 'Equip. Model', key: 'model' },
    { label: 'Serial No', key: 'serial_no' },
    { label: 'Probe', key: 'probe' },
    { label: 'Wedge', key: 'wedge' },
    { label: 'Calibration Blocks', key: 'calibration_blocks' },
    { label: 'Scanner Frame', key: 'scanner_frame' },
    { label: 'Ref Blocks', key: 'ref_blocks' },
    { label: 'Couplant', key: 'couplant' },
];

const BEAMSET_COLUMNS: { label: string; key: keyof BeamsetRow }[] = [
    { label: 'Group', key: 'group' },
    { label: 'Type', key: 'type' },
    { label: 'Active Elements', key: 'active_elements' },
    { label: 'Aperture', key: 'aperture' },
    { label: 'Focal Depth', key: 'focal_depth' },
    { label: 'Angle', key: 'angle' },
    { label: 'Skew', key: 'skew' },
    { label: 'Index Offset', key: 'index_offset' },
];

const cellStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: '0.8125rem',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    minHeight: 32,
    borderBottom: '1px solid var(--border-subtle)',
};

const cellInputStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    color: 'var(--text-primary)',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    padding: '4px 8px',
    width: '100%',
    outline: 'none',
};

// ---------------------------------------------------------------------------
// Inline editable field (reused from other sections, local here to keep each
// Uses shared InlineEditField from ui/InlineEditField
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Editable table cell
// ---------------------------------------------------------------------------

function EditableCell({
    value,
    onSave,
}: {
    value: string;
    onSave: (v: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    const startEdit = useCallback(() => {
        setDraft(value);
        setEditing(true);
    }, [value]);

    const commit = useCallback(() => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== (value ?? '').trim()) {
            onSave(trimmed);
        }
    }, [draft, value, onSave]);

    if (editing) {
        return (
            <td style={cellStyle}>
                <input
                    autoFocus
                    style={cellInputStyle}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                />
            </td>
        );
    }

    return (
        <td style={cellStyle} onClick={startEdit} title="Click to edit">
            {value || '\u2014'}
        </td>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EquipmentSection({
    vessel,
    projectId,
    projectEquipment,
}: EquipmentSectionProps) {
    const updateVessel = useUpdateProjectVessel();
    const equipConfig = vessel.equipment_config ?? {};
    const beamsetRows = vessel.beamset_config ?? [];

    // --- Equipment field save ---
    const saveEquipField = useCallback(
        (key: keyof VesselEquipmentConfig, value: string) => {
            const updated: VesselEquipmentConfig = {
                ...equipConfig,
                [key]: value || undefined,
            };
            updateVessel.mutate({ id: vessel.id, params: { equipmentConfig: updated }, projectId });
        },
        [updateVessel, vessel.id, projectId, equipConfig],
    );

    // --- Copy from project defaults ---
    const handleCopyDefaults = useCallback(() => {
        const copied: VesselEquipmentConfig = {
            ...equipConfig,
            model: projectEquipment.model ?? equipConfig.model,
            probe: projectEquipment.probe ?? equipConfig.probe,
            wedge: projectEquipment.wedge ?? equipConfig.wedge,
            calibration_blocks: projectEquipment.calibration_blocks ?? equipConfig.calibration_blocks,
        };
        updateVessel.mutate({ id: vessel.id, params: { equipmentConfig: copied }, projectId });
    }, [updateVessel, vessel.id, projectId, equipConfig, projectEquipment]);

    // --- Beamset helpers ---
    const saveBeamset = useCallback(
        (rows: BeamsetRow[]) => {
            updateVessel.mutate({ id: vessel.id, params: { beamsetConfig: rows }, projectId });
        },
        [updateVessel, vessel.id, projectId],
    );

    const handleCellSave = useCallback(
        (rowIdx: number, key: keyof BeamsetRow, value: string) => {
            const updated = beamsetRows.map((row, i) =>
                i === rowIdx ? { ...row, [key]: value } : row,
            );
            saveBeamset(updated);
        },
        [beamsetRows, saveBeamset],
    );

    const handleAddRow = useCallback(() => {
        const newRow: BeamsetRow = {
            group: '',
            type: '',
            active_elements: '',
            aperture: '',
            focal_depth: '',
            angle: '',
            skew: '',
            index_offset: '',
        };
        saveBeamset([...beamsetRows, newRow]);
    }, [beamsetRows, saveBeamset]);

    return (
        <CollapsibleSection title="Equipment">
            {/* ---- Equipment Details ---- */}
            <div style={{ marginBottom: 24 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                    }}
                >
                    <h4
                        style={{
                            margin: 0,
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Equipment Details
                    </h4>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleCopyDefaults}>
                        Copy from project defaults
                    </button>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px 24px',
                    }}
                >
                    {EQUIP_FIELDS.map((f) => (
                        <InlineEditField
                            key={f.key}
                            label={f.label}
                            value={equipConfig[f.key] ?? ''}
                            onSave={(v) => saveEquipField(f.key, v)}
                        />
                    ))}
                    <InlineEditField
                        label="Equipment Checks Ref"
                        value={equipConfig.equipment_checks_ref ?? ''}
                        onSave={(v) => saveEquipField('equipment_checks_ref', v)}
                        fullWidth
                    />
                </div>
            </div>

            {/* ---- Beamset Configuration ---- */}
            <div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                    }}
                >
                    <h4
                        style={{
                            margin: 0,
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Beamset Configuration
                    </h4>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleAddRow}>
                        Add Row
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.8125rem',
                        }}
                    >
                        <thead>
                            <tr>
                                {BEAMSET_COLUMNS.map((col) => (
                                    <th
                                        key={col.key}
                                        style={{
                                            textAlign: 'left',
                                            padding: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: 'var(--text-tertiary)',
                                            borderBottom: '1px solid var(--border-default)',
                                            whiteSpace: 'nowrap',
                                            letterSpacing: '0.02em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {beamsetRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={BEAMSET_COLUMNS.length}
                                        style={{
                                            padding: '20px 8px',
                                            color: 'var(--text-quaternary)',
                                            fontSize: '0.8125rem',
                                            textAlign: 'center',
                                        }}
                                    >
                                        No beamset rows. Click "Add Row" to begin.
                                    </td>
                                </tr>
                            )}
                            {beamsetRows.map((row, rowIdx) => (
                                <tr key={`${row.group}-${row.type}-${rowIdx}`}>
                                    {BEAMSET_COLUMNS.map((col) => (
                                        <EditableCell
                                            key={col.key}
                                            value={row[col.key] ?? ''}
                                            onSave={(v) => handleCellSave(rowIdx, col.key, v)}
                                        />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </CollapsibleSection>
    );
}
