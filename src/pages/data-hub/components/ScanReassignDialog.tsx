/**
 * ScanReassignDialog - Reassign a scan to a different strake
 */

import { useState } from 'react';
import { Modal } from '../../../components/ui';
import type { Scan, Strake } from '../../../hooks/queries/useDataHub';

interface ScanReassignDialogProps {
    isOpen: boolean;
    onClose: () => void;
    scan: Scan;
    strakes: Strake[];
    onReassign: (scanId: string, strakeId: string | null) => Promise<void>;
}

export default function ScanReassignDialog({
    isOpen,
    onClose,
    scan,
    strakes,
    onReassign,
}: ScanReassignDialogProps) {
    const [selectedStrakeId, setSelectedStrakeId] = useState<string | null>(scan.strake_id || null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        try {
            setIsSubmitting(true);
            await onReassign(scan.id, selectedStrakeId);
            onClose();
        } catch (error) {
            console.error('Failed to reassign scan:', error);
            alert('Failed to reassign scan. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentStrake = strakes.find(s => s.id === scan.strake_id);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Reassign Scan to Strake"
            size="medium"
            footer={
                <>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="btn btn-primary"
                    >
                        {isSubmitting ? 'Reassigning...' : 'Reassign Scan'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Scan info */}
                <div
                    className="rounded-lg p-4"
                    style={{
                        background: 'var(--glass-bg-secondary)',
                        border: '1px solid var(--glass-border)',
                    }}
                >
                    <div className="flex items-center gap-4">
                        {scan.thumbnail ? (
                            <img
                                src={scan.thumbnail}
                                alt={scan.name}
                                className="w-20 h-20 rounded object-cover"
                            />
                        ) : (
                            <div
                                className="w-20 h-20 rounded flex items-center justify-center"
                                style={{ background: 'var(--glass-bg-tertiary)' }}
                            >
                                <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                        )}
                        <div>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {scan.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span
                                    className={`
                                        px-2 py-0.5 rounded text-xs font-medium
                                        ${scan.tool_type === 'pec' ? 'bg-yellow-500/20 text-yellow-400' :
                                          scan.tool_type === 'cscan' ? 'bg-blue-500/20 text-blue-400' :
                                          'bg-purple-500/20 text-purple-400'}
                                    `}
                                >
                                    {scan.tool_type.toUpperCase()}
                                </span>
                            </div>
                            {currentStrake && (
                                <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                                    Currently in: <strong>{currentStrake.name}</strong>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Strake selection */}
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Select Strake
                    </label>

                    {strakes.length > 0 ? (
                        <div className="space-y-2">
                            {/* Unassigned option */}
                            <label
                                className={`
                                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                                    ${selectedStrakeId === null ? 'bg-yellow-500/20 border-yellow-500/50' : 'hover:bg-white/5'}
                                `}
                                style={{
                                    border: `1px solid ${selectedStrakeId === null ? 'rgb(234, 179, 8)' : 'var(--glass-border)'}`,
                                }}
                            >
                                <input
                                    type="radio"
                                    name="strake"
                                    checked={selectedStrakeId === null}
                                    onChange={() => setSelectedStrakeId(null)}
                                    className="form-radio"
                                />
                                <div>
                                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                        Unassigned
                                    </span>
                                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                                        Remove from current strake
                                    </p>
                                </div>
                            </label>

                            {/* Strake options */}
                            {strakes.map((strake) => (
                                <label
                                    key={strake.id}
                                    className={`
                                        flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                                        ${selectedStrakeId === strake.id ? 'bg-blue-500/20 border-blue-500/50' : 'hover:bg-white/5'}
                                    `}
                                    style={{
                                        border: `1px solid ${selectedStrakeId === strake.id ? 'rgb(59, 130, 246)' : 'var(--glass-border)'}`,
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="strake"
                                        checked={selectedStrakeId === strake.id}
                                        onChange={() => setSelectedStrakeId(strake.id)}
                                        className="form-radio"
                                    />
                                    <div className="flex-1">
                                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                            {strake.name}
                                        </span>
                                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            Area: {strake.total_area.toFixed(1)} m² • Required: {strake.required_coverage}%
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="rounded-lg p-4 text-center"
                            style={{
                                background: 'var(--glass-bg-secondary)',
                                border: '1px dashed var(--glass-border)',
                            }}
                        >
                            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                                No strakes defined. Create strakes first to organize your scans.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
