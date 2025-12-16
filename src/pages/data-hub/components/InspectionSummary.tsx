/**
 * InspectionSummary - Clean header showing inspection metadata
 */

import { useState } from 'react';
import type { Inspection } from '../../../hooks/queries/useDataHub';

type Status = 'planned' | 'in_progress' | 'completed' | 'on_hold';

interface Props {
    inspection: Inspection | null;
    onUpdate: (updates: Partial<{
        name: string;
        status: Status;
        notes: string;
        inspection_date: string;
    }>) => void;
    isUpdating?: boolean;
}

const STATUSES: { value: Status; label: string; color: string }[] = [
    { value: 'planned', label: 'Planned', color: '#3b82f6' },
    { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
    { value: 'completed', label: 'Completed', color: '#22c55e' },
    { value: 'on_hold', label: 'On Hold', color: '#6b7280' },
];

export default function InspectionSummary({ inspection, onUpdate, isUpdating }: Props) {
    const [notes, setNotes] = useState(inspection?.notes || '');
    const [editingNotes, setEditingNotes] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);

    if (!inspection) {
        return (
            <div className="glass-panel p-6 text-center" style={{ color: 'var(--text-dim)' }}>
                Select an inspection to view details
            </div>
        );
    }

    const status = STATUSES.find(s => s.value === inspection.status) || STATUSES[0];

    const saveNotes = () => {
        if (notes !== inspection.notes) onUpdate({ notes });
        setEditingNotes(false);
    };

    return (
        <div className="glass-panel p-6">
            {/* Row 1: Title + Status */}
            <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {inspection.name}
                    </h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                        Created {new Date(inspection.created_at).toLocaleDateString()}
                        {isUpdating && <span className="ml-2 animate-pulse">• Saving...</span>}
                    </p>
                </div>

                {/* Status Badge/Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setStatusOpen(!statusOpen)}
                        className="btn-sm flex items-center gap-2"
                        style={{
                            background: `${status.color}22`,
                            color: status.color,
                            border: `1px solid ${status.color}44`,
                        }}
                    >
                        <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />
                        {status.label}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {statusOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                            <div
                                className="absolute right-0 top-full mt-1 z-20 py-1 rounded-lg shadow-xl min-w-[140px]"
                                style={{ background: 'var(--glass-bg-primary)', border: '1px solid var(--glass-border)' }}
                            >
                                {STATUSES.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => { onUpdate({ status: s.value }); setStatusOpen(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Row 2: Date */}
            <div className="flex items-center gap-2 mb-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Inspection Date:</span>
                <input
                    type="date"
                    value={inspection.inspection_date || ''}
                    onChange={e => onUpdate({ inspection_date: e.target.value })}
                    className="glass-input"
                    style={{ padding: '4px 8px', width: 'auto' }}
                />
            </div>

            {/* Row 3: Notes */}
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Notes
                    </span>
                    {editingNotes && (
                        <button onClick={saveNotes} className="btn-primary btn-xs">
                            Save
                        </button>
                    )}
                </div>

                {editingNotes ? (
                    <textarea
                        autoFocus
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        onBlur={saveNotes}
                        rows={3}
                        placeholder="Add notes about this inspection..."
                        className="glass-textarea w-full"
                    />
                ) : (
                    <div
                        onClick={() => { setNotes(inspection.notes || ''); setEditingNotes(true); }}
                        className="p-3 rounded-lg text-sm cursor-pointer min-h-[70px] hover:bg-white/5 transition-colors"
                        style={{
                            background: 'var(--glass-bg-secondary)',
                            border: '1px solid var(--glass-border)',
                            color: inspection.notes ? 'var(--text-primary)' : 'var(--text-dim)',
                        }}
                    >
                        {inspection.notes || 'Click to add notes...'}
                    </div>
                )}
            </div>
        </div>
    );
}
