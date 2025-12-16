/**
 * CreateInspectionDialog - Create a new named inspection
 * Allows users to name their inspection and optionally set date/notes
 */

import { useState } from 'react';
import { Modal } from '../../../components/ui';

interface CreateInspectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    vesselName: string;
    onCreateInspection: (data: {
        name: string;
        status: 'planned' | 'in_progress' | 'completed' | 'on_hold';
        inspection_date?: string;
        notes?: string;
    }) => Promise<void>;
}

export default function CreateInspectionDialog({
    isOpen,
    onClose,
    vesselName,
    onCreateInspection,
}: CreateInspectionDialogProps) {
    const [name, setName] = useState('');
    const [status, setStatus] = useState<'planned' | 'in_progress' | 'completed' | 'on_hold'>('in_progress');
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!name.trim()) {
            setError('Please enter an inspection name');
            return;
        }

        try {
            setIsCreating(true);
            setError(null);

            await onCreateInspection({
                name: name.trim(),
                status,
                inspection_date: inspectionDate || undefined,
                notes: notes.trim() || undefined,
            });

            // Reset form and close
            resetForm();
            onClose();
        } catch (err) {
            console.error('Failed to create inspection:', err);
            setError('Failed to create inspection. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const resetForm = () => {
        setName('');
        setStatus('in_progress');
        setInspectionDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setError(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const statusOptions = [
        { value: 'planned', label: 'Planned', color: '#60a5fa' },
        { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
        { value: 'completed', label: 'Completed', color: '#22c55e' },
        { value: 'on_hold', label: 'On Hold', color: '#9ca3af' },
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create New Inspection"
            size="medium"
            footer={
                <>
                    <button
                        onClick={handleClose}
                        disabled={isCreating}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || isCreating}
                        className="btn-primary"
                    >
                        {isCreating ? 'Creating...' : 'Create Inspection'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Vessel info */}
                <div
                    className="p-3 rounded-lg"
                    style={{ background: 'var(--glass-bg-secondary)', border: '1px solid var(--glass-border)' }}
                >
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Creating inspection for vessel:
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {vesselName}
                    </p>
                </div>

                {/* Error message */}
                {error && (
                    <div
                        className="p-3 rounded-lg text-sm"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
                    >
                        {error}
                    </div>
                )}

                {/* Name field */}
                <div>
                    <label
                        htmlFor="inspection-name"
                        className="block text-sm font-medium mb-1.5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Inspection Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        id="inspection-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Annual Inspection 2024, Pre-service Check"
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{
                            background: 'var(--glass-bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)',
                        }}
                        autoFocus
                    />
                </div>

                {/* Status field */}
                <div>
                    <label
                        htmlFor="inspection-status"
                        className="block text-sm font-medium mb-1.5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {statusOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setStatus(option.value as typeof status)}
                                className="px-3 py-2 rounded-lg text-sm transition-all"
                                style={{
                                    background: status === option.value
                                        ? `${option.color}20`
                                        : 'var(--glass-bg-tertiary)',
                                    border: `1px solid ${status === option.value ? option.color : 'var(--glass-border)'}`,
                                    color: status === option.value ? option.color : 'var(--text-secondary)',
                                }}
                            >
                                <span
                                    className="inline-block w-2 h-2 rounded-full mr-2"
                                    style={{ background: option.color }}
                                />
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date field */}
                <div>
                    <label
                        htmlFor="inspection-date"
                        className="block text-sm font-medium mb-1.5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Inspection Date
                    </label>
                    <input
                        id="inspection-date"
                        type="date"
                        value={inspectionDate}
                        onChange={(e) => setInspectionDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{
                            background: 'var(--glass-bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>

                {/* Notes field */}
                <div>
                    <label
                        htmlFor="inspection-notes"
                        className="block text-sm font-medium mb-1.5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Notes <span className="font-normal" style={{ color: 'var(--text-dim)' }}>(optional)</span>
                    </label>
                    <textarea
                        id="inspection-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this inspection..."
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                        style={{
                            background: 'var(--glass-bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>
            </div>
        </Modal>
    );
}
