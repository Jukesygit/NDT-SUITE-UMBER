import { useState, useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import {
    useCreateCalibrationLogEntry,
    useUpdateCalibrationLogEntry,
    useDeleteCalibrationLogEntry,
} from '../../../hooks/mutations/useInspectionProjectMutations';
import { useCompanionApp } from '../../../hooks/queries/useCompanionApp';
import {
    useCompanionCalibrationFiles,
    type CompanionCalibrationFile,
} from '../../../hooks/queries/useCompanionCalibrationFiles';
import type {
    CalibrationLogEntry,
    UpdateCalibrationLogEntryParams,
} from '../../../types/inspection-project';

interface CalibrationLogSectionProps {
    vesselId: string;
    entries: CalibrationLogEntry[];
}

const COLUMNS: { key: keyof CalibrationLogEntry; label: string; width?: number; numeric?: boolean }[] = [
    { key: 'filename', label: 'File Name', width: 140 },
    { key: 'setup_file', label: 'Setup File', width: 120 },
    { key: 'cal_date', label: 'Date', width: 100 },
    { key: 'scan_start', label: 'Scan Start', width: 90 },
    { key: 'scan_end', label: 'Scan End', width: 90 },
    { key: 'ref_a_wt', label: 'Ref A WT', width: 80, numeric: true },
    { key: 'meas_a_wt', label: 'Meas A WT', width: 80, numeric: true },
    { key: 'velocity', label: 'Velocity', width: 80, numeric: true },
    { key: 'comments', label: 'Comments', width: 140 },
];

const PARAM_MAP: Record<string, keyof UpdateCalibrationLogEntryParams> = {
    filename: 'filename',
    setup_file: 'setupFile',
    cal_date: 'calDate',
    scan_start: 'scanStart',
    scan_end: 'scanEnd',
    ref_a_wt: 'refAWt',
    meas_a_wt: 'measAWt',
    velocity: 'velocity',
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

function formatStepComment(cal: CompanionCalibrationFile): string {
    if (!cal.steps.length) return '';
    const parts = cal.steps.map(
        (s) => `${s.measuredMm.toFixed(2)}mm (ref ${s.nominalMm})${s.isReference ? '*' : ''}`,
    );
    return `Step wedge: ${parts.join(' | ')}`;
}

function formatCalDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toISOString().split('T')[0];
}

export default function CalibrationLogSection({ vesselId, entries }: CalibrationLogSectionProps) {
    const createEntry = useCreateCalibrationLogEntry();
    const updateEntry = useUpdateCalibrationLogEntry();
    const deleteEntry = useDeleteCalibrationLogEntry();

    const companion = useCompanionApp();
    const { data: calFiles } = useCompanionCalibrationFiles(companion.port);

    const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [importing, setImporting] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    const handleAddRow = () => {
        createEntry.mutate({
            projectVesselId: vesselId,
            filename: '',
            sortOrder: entries.length,
        });
    };

    const startEdit = useCallback((entry: CalibrationLogEntry, key: string) => {
        const raw = entry[key as keyof CalibrationLogEntry];
        setEditingCell({ id: entry.id, key });
        setEditValue(raw != null ? String(raw) : '');
    }, []);

    const commitEdit = useCallback(() => {
        if (!editingCell) return;
        const { id, key } = editingCell;
        const entry = entries.find((e) => e.id === id);
        if (!entry) { setEditingCell(null); return; }

        const col = COLUMNS.find((c) => c.key === key);
        const oldVal = entry[key as keyof CalibrationLogEntry];
        const newVal = col?.numeric ? (editValue ? Number(editValue) : null) : (editValue || null);
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
            const paramKey = PARAM_MAP[key];
            if (paramKey) {
                updateEntry.mutate({
                    id,
                    vesselId,
                    params: { [paramKey]: newVal } as UpdateCalibrationLogEntryParams,
                });
            }
        }
        setEditingCell(null);
    }, [editingCell, editValue, entries, updateEntry, vesselId]);

    const existingFilenames = new Set(entries.map((e) => e.filename));

    const importCalFiles = async (files: CompanionCalibrationFile[]) => {
        setImporting(true);
        const newFiles = files.filter((f) => !existingFilenames.has(f.filename));
        for (let i = 0; i < newFiles.length; i++) {
            const cal = newFiles[i];
            createEntry.mutate({
                projectVesselId: vesselId,
                filename: cal.filename,
                setupFile: cal.setupFile || undefined,
                calDate: formatCalDate(cal.calDate) || undefined,
                scanStart: cal.scanStartMm != null ? String(cal.scanStartMm) : undefined,
                scanEnd: cal.scanEndMm != null ? String(cal.scanEndMm) : undefined,
                refAWt: cal.refAWt ?? undefined,
                measAWt: cal.measAWt ?? undefined,
                velocity: cal.velocity ?? undefined,
                comments: formatStepComment(cal) || undefined,
                sortOrder: entries.length + i,
            });
        }
        setImporting(false);
    };

    const handleAutoPopulate = () => {
        if (!calFiles?.length) return;
        importCalFiles(calFiles);
    };

    const handleImportSelected = () => {
        if (!calFiles?.length) return;
        const selected = calFiles.filter((f) => selectedFiles.has(f.filename));
        importCalFiles(selected);
        setShowImportModal(false);
        setSelectedFiles(new Set());
    };

    const openImportModal = () => {
        if (!calFiles) return;
        setSelectedFiles(new Set(
            calFiles.filter((f) => !existingFilenames.has(f.filename)).map((f) => f.filename),
        ));
        setShowImportModal(true);
    };

    const toggleFile = (filename: string) => {
        setSelectedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(filename)) next.delete(filename);
            else next.add(filename);
            return next;
        });
    };

    const newCalFiles = calFiles?.filter((f) => !existingFilenames.has(f.filename)) ?? [];

    const sorted = [...entries].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <CollapsibleSection title="Calibration Scan Log">
            {/* Companion import bar */}
            {companion.connected && calFiles && calFiles.length > 0 && (
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 12,
                        padding: '8px 12px',
                        background: 'var(--surface-elevated)',
                        borderRadius: 6,
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <span
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#10b981',
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>
                        {calFiles.length} cal file{calFiles.length !== 1 ? 's' : ''} found
                        {newCalFiles.length > 0 && (
                            <> &middot; {newCalFiles.length} new</>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={handleAutoPopulate}
                        disabled={importing || newCalFiles.length === 0}
                        className="btn btn--primary btn--sm"
                        title="Create entries for all calibration files not already in the log"
                    >
                        Auto-populate
                    </button>
                    <button
                        type="button"
                        onClick={openImportModal}
                        disabled={importing || calFiles.length === 0}
                        className="btn btn--secondary btn--sm"
                    >
                        Import from Companion
                    </button>
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
                                    const raw = entry[col.key as keyof CalibrationLogEntry];
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
                                                            ? '#fff'
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
                                        x
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
                }}
            >
                <button
                    type="button"
                    onClick={handleAddRow}
                    disabled={createEntry.isPending}
                    className="btn btn--secondary btn--sm"
                >
                    + Add Row
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-quaternary)' }}>
                    All dimensions & measurements in mm.
                </span>
            </div>

            {/* Import modal */}
            {showImportModal && calFiles && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                    onClick={() => setShowImportModal(false)}
                >
                    <div
                        style={{
                            background: 'var(--surface-primary)',
                            borderRadius: 8,
                            border: '1px solid var(--border-default)',
                            padding: 24,
                            maxWidth: 700,
                            width: '90vw',
                            maxHeight: '80vh',
                            overflow: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>
                            Import Calibration Files
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {calFiles.map((cal) => {
                                const alreadyImported = existingFilenames.has(cal.filename);
                                const checked = selectedFiles.has(cal.filename);

                                return (
                                    <div
                                        key={cal.filename}
                                        style={{
                                            padding: 12,
                                            background: 'var(--surface-elevated)',
                                            borderRadius: 6,
                                            border: `1px solid ${checked ? 'var(--accent-blue-glow)' : 'var(--border-subtle)'}`,
                                            opacity: alreadyImported ? 0.5 : 1,
                                        }}
                                    >
                                        <label
                                            style={{
                                                display: 'flex',
                                                gap: 10,
                                                alignItems: 'flex-start',
                                                cursor: alreadyImported ? 'default' : 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={alreadyImported}
                                                onChange={() => toggleFile(cal.filename)}
                                                style={{ marginTop: 2 }}
                                            />
                                            <div style={{ flex: 1, fontSize: '0.82rem' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {cal.filename}
                                                    {alreadyImported && (
                                                        <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                                            (already imported)
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                                                    {cal.calDate && <span>Date: {formatCalDate(cal.calDate)} &middot; </span>}
                                                    Velocity: {cal.velocity} m/s
                                                    {cal.probe && <span> &middot; Probe: {cal.probe.model}</span>}
                                                </div>
                                                {cal.steps.length > 0 && (
                                                    <div style={{ marginTop: 6 }}>
                                                        <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                                            <thead>
                                                                <tr>
                                                                    <th style={stepHeader}>Nominal</th>
                                                                    <th style={stepHeader}>Measured</th>
                                                                    <th style={stepHeader}>Std Dev</th>
                                                                    <th style={stepHeader}>Readings</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {cal.steps.map((s) => (
                                                                    <tr key={s.nominalMm}>
                                                                        <td style={stepCell}>{s.nominalMm} mm</td>
                                                                        <td style={{
                                                                            ...stepCell,
                                                                            fontWeight: s.isReference ? 700 : 400,
                                                                            color: s.isReference ? 'var(--accent-teal)' : 'var(--text-primary)',
                                                                        }}>
                                                                            {s.measuredMm.toFixed(3)} mm
                                                                            {s.isReference && ' *'}
                                                                        </td>
                                                                        <td style={stepCell}>{s.stdMm.toFixed(3)}</td>
                                                                        <td style={stepCell}>{s.readingCount}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button
                                type="button"
                                onClick={() => setShowImportModal(false)}
                                className="btn btn--secondary btn--sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleImportSelected}
                                disabled={selectedFiles.size === 0 || importing}
                                className="btn btn--primary btn--sm"
                            >
                                Import {selectedFiles.size} File{selectedFiles.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CollapsibleSection>
    );
}

const stepHeader: React.CSSProperties = {
    padding: '3px 8px',
    textAlign: 'left',
    color: 'var(--text-tertiary)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border-subtle)',
};

const stepCell: React.CSSProperties = {
    padding: '3px 8px',
    color: 'var(--text-primary)',
};
