/**
 * CreateAssetDialog - Modal dialog for creating a new asset
 */

import { useState } from 'react';
import { useCreateAsset } from '../../../hooks/mutations/useDataHubMutations';

interface CreateAssetDialogProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId: string;
}

export default function CreateAssetDialog({ isOpen, onClose, organizationId }: CreateAssetDialogProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const createAsset = useCreateAsset();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setError(null);
        try {
            await createAsset.mutateAsync({ name: name.trim(), organizationId });
            setName('');
            onClose();
        } catch (err) {
            console.error('Failed to create asset:', err);
            setError(err instanceof Error ? err.message : 'Failed to create asset');
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
                    marginBottom: '16px',
                }}>
                    Create New Asset
                </h3>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label
                            htmlFor="asset-name"
                            style={{
                                display: 'block',
                                fontSize: '14px',
                                color: 'var(--text-secondary)',
                                marginBottom: '8px',
                            }}
                        >
                            Asset Name
                        </label>
                        <input
                            id="asset-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Platform Alpha, FPSO Mercury"
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
                            className="btn-secondary"
                            onClick={handleClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={!name.trim() || createAsset.isPending}
                        >
                            {createAsset.isPending ? 'Creating...' : 'Create Asset'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
