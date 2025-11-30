/**
 * CreateVesselDialog - Modal dialog for creating a new vessel
 */

import { useState } from 'react';
import { useCreateVessel } from '../../../hooks/mutations/useDataHubMutations';

interface CreateVesselDialogProps {
    isOpen: boolean;
    onClose: () => void;
    assetId: string;
    assetName: string;
}

export default function CreateVesselDialog({ isOpen, onClose, assetId, assetName }: CreateVesselDialogProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const createVessel = useCreateVessel();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setError(null);
        try {
            await createVessel.mutateAsync({ assetId, name: name.trim() });
            setName('');
            onClose();
        } catch (err) {
            console.error('Failed to create vessel:', err);
            setError(err instanceof Error ? err.message : 'Failed to create vessel');
        }
    };

    const handleClose = () => {
        setName('');
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
        >
            <div
                className="glass-card"
                style={{
                    padding: '24px',
                    maxWidth: '400px',
                    width: '90%',
                    animation: 'fadeIn 0.2s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                }}>
                    Create New Vessel
                </h3>
                <p style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                }}>
                    Adding vessel to <strong style={{ color: 'var(--text-primary)' }}>{assetName}</strong>
                </p>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label
                            htmlFor="vessel-name"
                            style={{
                                display: 'block',
                                fontSize: '14px',
                                color: 'var(--text-secondary)',
                                marginBottom: '8px',
                            }}
                        >
                            Vessel Name
                        </label>
                        <input
                            id="vessel-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Storage Tank V-101, Separator S-200"
                            className="glass-input w-full"
                            style={{
                                padding: '10px 14px',
                                fontSize: '14px',
                                borderRadius: '8px',
                                background: 'var(--glass-bg-tertiary)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: 'var(--text-primary)',
                            }}
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div
                            style={{
                                marginBottom: '16px',
                                padding: '10px 14px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                color: 'var(--color-error)',
                                fontSize: '13px',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleClose}
                            style={{ padding: '10px 16px', fontSize: '14px' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!name.trim() || createVessel.isPending}
                            style={{ padding: '10px 16px', fontSize: '14px' }}
                        >
                            {createVessel.isPending ? 'Creating...' : 'Create Vessel'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
