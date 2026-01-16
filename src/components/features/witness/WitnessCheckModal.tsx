/**
 * WitnessCheckModal - Modal for marking/removing witness checks on NDT certifications
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal, FormField, FormTextarea } from '../../ui';

export interface WitnessCheckData {
    witness_checked: boolean;
    witnessed_by: string | null;
    witnessed_at: string | null;
    witness_notes: string | null;
}

interface WitnessCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    competencyName: string;
    personName: string;
    /** Existing witness data (if already witnessed) */
    existingWitnessData?: {
        witness_checked?: boolean;
        witnessed_by?: string;
        witnessed_at?: string;
        witness_notes?: string;
        witnessed_by_name?: string;
    };
    /** Current user info for witnessed_by field */
    currentUser: {
        id: string;
        name: string;
    };
    onSave: (data: WitnessCheckData) => void;
    onRemove: () => void;
    isSaving?: boolean;
}

/**
 * Format datetime-local value to display string
 */
function formatDateTime(isoString: string | undefined): string {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return isoString;
    }
}

/**
 * Get current datetime in datetime-local input format (YYYY-MM-DDTHH:mm)
 */
function getCurrentDateTimeLocal(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
}

export function WitnessCheckModal({
    isOpen,
    onClose,
    competencyName,
    personName,
    existingWitnessData,
    currentUser,
    onSave,
    onRemove,
    isSaving = false,
}: WitnessCheckModalProps) {
    const isWitnessed = existingWitnessData?.witness_checked === true;

    // Form state
    const [witnessDate, setWitnessDate] = useState(getCurrentDateTimeLocal());
    const [witnessNotes, setWitnessNotes] = useState('');

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (isWitnessed) {
                // Editing existing witness check
                setWitnessNotes(existingWitnessData?.witness_notes || '');
                // Convert existing date to datetime-local format
                if (existingWitnessData?.witnessed_at) {
                    try {
                        const date = new Date(existingWitnessData.witnessed_at);
                        const offset = date.getTimezoneOffset();
                        const local = new Date(date.getTime() - offset * 60 * 1000);
                        setWitnessDate(local.toISOString().slice(0, 16));
                    } catch {
                        setWitnessDate(getCurrentDateTimeLocal());
                    }
                } else {
                    setWitnessDate(getCurrentDateTimeLocal());
                }
            } else {
                // New witness check
                setWitnessDate(getCurrentDateTimeLocal());
                setWitnessNotes('');
            }
        }
    }, [isOpen, isWitnessed, existingWitnessData]);

    const handleSave = useCallback(() => {
        onSave({
            witness_checked: true,
            witnessed_by: currentUser.id,
            witnessed_at: new Date(witnessDate).toISOString(),
            witness_notes: witnessNotes.trim() || null,
        });
    }, [currentUser.id, witnessDate, witnessNotes, onSave]);

    const handleRemove = useCallback(() => {
        onRemove();
    }, [onRemove]);

    const title = isWitnessed ? 'Update Witness Check' : 'Mark as Witnessed';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="small"
            closeOnBackdropClick={!isSaving}
            closeOnEscape={!isSaving}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    {/* Remove button - only show if already witnessed */}
                    <div>
                        {isWitnessed && (
                            <button
                                onClick={handleRemove}
                                className="btn btn--danger"
                                disabled={isSaving}
                            >
                                Remove Witness Check
                            </button>
                        )}
                    </div>
                    {/* Cancel and Save buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={onClose}
                            className="btn btn--secondary"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="btn btn--primary"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : isWitnessed ? 'Update' : 'Mark as Witnessed'}
                        </button>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Info Header */}
                <div
                    style={{
                        padding: '12px 16px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                    }}
                >
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
                        <strong style={{ color: '#ffffff' }}>{competencyName}</strong>
                        <span style={{ margin: '0 8px' }}>for</span>
                        <strong style={{ color: '#ffffff' }}>{personName}</strong>
                    </div>
                </div>

                {/* Existing witness info (if witnessed) */}
                {isWitnessed && existingWitnessData && (
                    <div
                        style={{
                            padding: '12px 16px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            fontSize: '13px',
                        }}
                    >
                        <div style={{ color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>
                            Currently Witnessed
                        </div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            <div>
                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>By: </span>
                                {existingWitnessData.witnessed_by_name || 'Unknown'}
                            </div>
                            <div>
                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Date: </span>
                                {formatDateTime(existingWitnessData.witnessed_at)}
                            </div>
                            {existingWitnessData.witness_notes && (
                                <div style={{ marginTop: '4px' }}>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Notes: </span>
                                    {existingWitnessData.witness_notes}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Witnessed By (read-only) */}
                <FormField
                    label="Witnessed By"
                    value={currentUser.name}
                    disabled
                    containerClassName="mb-0"
                />

                {/* Witness Date/Time */}
                <FormField
                    label="Witness Date & Time"
                    type="datetime-local"
                    value={witnessDate}
                    onChange={(e) => setWitnessDate(e.target.value)}
                    containerClassName="mb-0"
                />

                {/* Witness Notes */}
                <FormTextarea
                    label="Notes"
                    placeholder="Optional notes about the witness check..."
                    value={witnessNotes}
                    onChange={(e) => setWitnessNotes(e.target.value)}
                    rows={3}
                    containerClassName="mb-0"
                />
            </div>
        </Modal>
    );
}

export default WitnessCheckModal;
