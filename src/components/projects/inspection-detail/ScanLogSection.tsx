import { useState, useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import {
    useCreateScanLogEntry,
    useUpdateScanLogEntry,
    useDeleteScanLogEntry,
} from '../../../hooks/mutations/useInspectionProjectMutations';
import type {
    ScanLogEntry,
    UpdateScanLogEntryParams,
} from '../../../types/inspection-project';

interface CompositeInfo {
    id: string;
    name: string;
    stats: { min: number; mean: number };
    project_vessel_id: string | null;
}

interface ScanLogSectionProps {
    vesselId: string;
    entries: ScanLogEntry[];
    composites: CompositeInfo[];
}

const COLUMNS: { key: keyof ScanLogEntry; label: string; width?: number; numeric?: boolean }[] = [
    { key: 'filename', label: 'File Name', width: 140 },
    { key: 'date_inspected', label: 'Date Inspected', width: 110 },
    { key: 'setup_file_name', label: 'Setup File', width: 120 },
    { key: 'scan_start_x', label: 'Scan Start(x)', width: 95, numeric: true },
    { key: 'scan_end_x', label: 'Scan End(x)', width: 95, numeric: true },
    { key: 'index_start_y', label: 'Index Start(y)', width: 95, numeric: true },
    { key: 'index_end_y', label: 'Index End(y)', width: 95, numeric: true },
    { key: 'scan_index_datum', label: 'Datum', width: 80 },
    { key: 'coating_correction', label: 'Coating Correction', width: 110 },
    { key: 'min_wt', label: 'Min WT', width: 70, numeric: true },
    { key: 'comments', label: 'Comments', width: 140 },
];

const PARAM_MAP: Record<string, keyof UpdateScanLogEntryParams> = {
    filename: 'filename',
    date_inspected: 'dateInspected',
    setup_file_name: 'setupFileName',
    scan_start_x: 'scanStartX',
    scan_end_x: 'scanEndX',
    index_start_y: 'indexStartY',
    index_end_y: 'indexEndY',
    scan_index_datum: 'scanIndexDatum',
    coating_correction: 'coatingCorrection',
    min_wt: 'minWt',
    comments: 'comments',
};

const cellStyle: React.CSSProperties = {
    padding: '6px 8px',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    width: '100%',
};

export default function ScanLogSection({ vesselId, entries, composites }: ScanLogSectionProps) {
    const createEntry = useCreateScanLogEntry();
    const updateEntry = useUpdateScanLogEntry();
    const deleteEntry = useDeleteScanLogEntry();

    const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    const handleAddRow = () => {
        createEntry.mutate({
            projectVesselId: vesselId,
            filename: '',
            sortOrder: entries.length,
        });
    };

    const handleAutoPopulate = async () => {
        const linkedIds = new Set(
            entries.filter((e) => e.scan_composite_id).map((e) => e.scan_composite_id)
        );
        const unlinked = composites.filter((c) => !linkedIds.has(c.id));
        const alreadyExisted = composites.length - unlinked.length;

        let added = 0;
        for (const comp of unlinked) {
            await createEntry.mutateAsync({
                projectVesselId: vesselId,
                filename: comp.name,
                minWt: comp.stats?.min ?? undefined,
                scanCompositeId: comp.id,
                sortOrder: entries.length + added,
            });
            added++;
        }

        setToastMsg(`${added} new entries added, ${alreadyExisted} already existed`);
        setTimeout(() => setToastMsg(null), 4000);
    };

    const startEdit = useCallback((entry: ScanLogEntry, key: string) => {
        const raw = entry[key as keyof ScanLogEntry];
        setEditingCell({ id: entry.id, key });
        setEditValue(raw != null ? String(raw) : '');
    }, []);

    const commitEdit = useCallback(() => {
        if (!editingCell) return;
        const { id, key } = editingCell;
        const entry = entries.find((e) => e.id === id);
        if (!entry) { setEditingCell(null); return; }

        const col = COLUMNS.find((c) => c.key === key);
        const oldVal = entry[key as keyof ScanLogEntry];
        const newVal = col?.numeric ? (editValue ? Number(editValue) : null) : (editValue || null);
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
            const paramKey = PARAM_MAP[key];
            if (paramKey) {
                updateEntry.mutate({
                    id,
                    vesselId,
                    params: { [paramKey]: newVal } as UpdateScanLogEntryParams,
                });
            }
        }
        setEditingCell(null);
    }, [editingCell, editValue, entries, updateEntry, vesselId]);

    const sorted = [...entries].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <CollapsibleSection title="C-Scan Mapping Log">
            {toastMsg && (
                <div
                    style={{
                        padding: '8px 14px',
                        marginBottom: 10,
                        background: 'rgba(34,197,94,0.15)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: 6,
                        color: '#4ade80',
                        fontSize: '0.84rem',
                    }}
                >
                    {toastMsg}
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.82rem',
                    }}
                >
                    <thead>
                        <tr>
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    style={{
                                        padding: '8px',
                                        textAlign: 'left',
                                        color: 'var(--text-tertiary)',
                                        fontWeight: 500,
                                        fontSize: '0.78rem',
                                        borderBottom: '1px solid var(--border-default)',
                                        whiteSpace: 'nowrap',
                                        minWidth: col.width,
                                    }}
                                >
                                    {col.label}
                                </th>
                            ))}
                            <th
                                style={{
                                    width: 40,
                                    borderBottom: '1px solid var(--border-default)',
                                }}
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((entry) => (
                            <tr key={entry.id}>
                                {COLUMNS.map((col) => {
                                    const isEditing =
                                        editingCell?.id === entry.id && editingCell?.key === col.key;
                                    const raw = entry[col.key as keyof ScanLogEntry];
                                    const display = raw != null ? String(raw) : '';

                                    return (
                                        <td key={col.key} style={{ padding: 2 }}>
                                            {isEditing ? (
                                                <input
                                                    type={col.numeric ? 'number' : 'text'}
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onBlur={commitEdit}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') commitEdit();
                                                        if (e.key === 'Escape') setEditingCell(null);
                                                    }}
                                                    autoFocus
                                                    style={{
                                                        ...cellStyle,
                                                        background: 'var(--surface-overlay)',
                                                        border: '1px solid var(--accent-blue-glow)',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    onClick={() => startEdit(entry, col.key)}
                                                    style={{
                                                        ...cellStyle,
                                                        cursor: 'pointer',
                                                        minHeight: 28,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        color: display
                                                            ? 'var(--text-primary)'
                                                            : 'var(--text-disabled)',
                                                    }}
                                                >
                                                    {display || '--'}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                                <td style={{ padding: 2 }}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            deleteEntry.mutate({ id: entry.id, vesselId })
                                        }
                                        style={{
                                            padding: '4px 6px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'rgba(239,68,68,0.7)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                        }}
                                        title="Delete row"
                                    >
                                        ×
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 10,
                    flexWrap: 'wrap',
                    gap: 8,
                }}
            >
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={handleAddRow}
                        disabled={createEntry.isPending}
                        className="btn btn--secondary btn--sm"
                    >
                        + Add Row
                    </button>
                    <button
                        type="button"
                        onClick={handleAutoPopulate}
                        disabled={createEntry.isPending || composites.length === 0}
                        className="btn btn--primary btn--sm"
                        style={{
                            opacity: composites.length === 0 ? 0.5 : 1,
                            cursor: composites.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Auto-populate from Composites
                    </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-quaternary)' }}>
                    All dimensions in mm. WT results include coating correction.
                </span>
            </div>
        </CollapsibleSection>
    );
}
