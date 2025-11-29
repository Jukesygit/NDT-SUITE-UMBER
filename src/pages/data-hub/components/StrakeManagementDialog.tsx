/**
 * StrakeManagementDialog - Manage strakes for a vessel
 * Supports add, edit, and delete operations with coverage tracking
 */

import { useState } from 'react';
import { Modal, FormField } from '../../../components/ui';
import type { Strake, Scan } from '../../../hooks/queries/useDataHub';

interface StrakeManagementDialogProps {
    isOpen: boolean;
    onClose: () => void;
    vesselName: string;
    strakes: Strake[];
    scans: Scan[];
    onCreateStrake: (data: { name: string; totalArea: number; requiredCoverage: number }) => Promise<void>;
    onUpdateStrake: (strakeId: string, data: { name?: string; total_area?: number; required_coverage?: number }) => Promise<void>;
    onDeleteStrake: (strakeId: string) => Promise<void>;
}

interface StrakeFormData {
    name: string;
    totalArea: string;
    requiredCoverage: string;
}

const initialFormData: StrakeFormData = {
    name: '',
    totalArea: '',
    requiredCoverage: '100',
};

/**
 * Calculate coverage statistics for a strake
 */
function calculateCoverage(strake: Strake, scans: Scan[]) {
    const strakeScans = scans.filter(s => s.strake_id === strake.id);
    const scanCount = strakeScans.length;

    // For now, assume each scan covers a fixed area (this would be calculated from actual scan data)
    // In production, this would come from scan metadata or a calculation
    const estimatedAreaPerScan = strake.total_area / 10; // Rough estimate
    const totalScannedArea = scanCount * estimatedAreaPerScan;
    const targetArea = (strake.total_area * strake.required_coverage) / 100;
    const coveragePercentage = targetArea > 0 ? Math.min((totalScannedArea / targetArea) * 100, 100) : 0;
    const isComplete = coveragePercentage >= 100;

    return {
        scanCount,
        totalScannedArea,
        targetArea,
        coveragePercentage,
        isComplete,
    };
}

function StrakeItem({
    strake,
    scans,
    onEdit,
    onDelete,
}: {
    strake: Strake;
    scans: Scan[];
    onEdit: () => void;
    onDelete: () => void;
}) {
    const coverage = calculateCoverage(strake, scans);

    return (
        <div
            className="rounded-lg p-4"
            style={{
                background: 'var(--glass-bg-secondary)',
                border: '1px solid var(--glass-border)',
            }}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {strake.name}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Total Area: {strake.total_area.toFixed(1)} m² |{' '}
                        Required: {strake.required_coverage}% |{' '}
                        {coverage.scanCount} scan{coverage.scanCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onEdit}
                        className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--accent-primary)' }}
                        title="Edit strake"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
                        title="Delete strake"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 mt-2">
                <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{ background: 'var(--glass-bg-tertiary)' }}
                >
                    <div
                        className="h-full transition-all duration-500"
                        style={{
                            width: `${coverage.coveragePercentage}%`,
                            background: coverage.isComplete ? 'var(--success)' : 'var(--info)',
                        }}
                    />
                </div>
                <span
                    className="text-xs font-semibold"
                    style={{ color: coverage.isComplete ? 'var(--success-light)' : 'var(--info-light)' }}
                >
                    {coverage.coveragePercentage.toFixed(0)}%
                </span>
            </div>
        </div>
    );
}

function StrakeForm({
    formData,
    setFormData,
    onSubmit,
    onCancel,
    isEditing,
    isSubmitting,
}: {
    formData: StrakeFormData;
    setFormData: (data: StrakeFormData) => void;
    onSubmit: () => void;
    onCancel: () => void;
    isEditing: boolean;
    isSubmitting: boolean;
}) {
    const [errors, setErrors] = useState<Partial<StrakeFormData>>({});

    const validate = () => {
        const newErrors: Partial<StrakeFormData> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        const area = parseFloat(formData.totalArea);
        if (isNaN(area) || area <= 0) {
            newErrors.totalArea = 'Enter a valid area greater than 0';
        }

        const coverage = parseFloat(formData.requiredCoverage);
        if (isNaN(coverage) || coverage < 1 || coverage > 100) {
            newErrors.requiredCoverage = 'Enter a percentage between 1 and 100';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSubmit();
        }
    };

    return (
        <div
            className="rounded-lg p-4 mb-4"
            style={{
                background: 'var(--glass-bg-secondary)',
                border: '1px solid var(--accent-primary)',
            }}
        >
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {isEditing ? 'Edit Strake' : 'New Strake'}
            </h4>

            <FormField
                label="Strake Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Strake A"
                error={errors.name}
                required
            />

            <div className="grid grid-cols-2 gap-3">
                <FormField
                    label="Total Area (m²)"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.totalArea}
                    onChange={(e) => setFormData({ ...formData, totalArea: e.target.value })}
                    placeholder="e.g., 25.5"
                    error={errors.totalArea}
                    required
                />

                <FormField
                    label="Required Coverage (%)"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.requiredCoverage}
                    onChange={(e) => setFormData({ ...formData, requiredCoverage: e.target.value })}
                    placeholder="e.g., 100"
                    error={errors.requiredCoverage}
                    required
                />
            </div>

            <div className="flex gap-2 mt-2">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="btn btn-success text-xs"
                    style={{ padding: '6px 12px' }}
                >
                    {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                </button>
                <button
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="btn btn-secondary text-xs"
                    style={{ padding: '6px 12px' }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

export default function StrakeManagementDialog({
    isOpen,
    onClose,
    vesselName,
    strakes,
    scans,
    onCreateStrake,
    onUpdateStrake,
    onDeleteStrake,
}: StrakeManagementDialogProps) {
    const [showForm, setShowForm] = useState(false);
    const [editingStrakeId, setEditingStrakeId] = useState<string | null>(null);
    const [formData, setFormData] = useState<StrakeFormData>(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setFormData(initialFormData);
        setShowForm(false);
        setEditingStrakeId(null);
    };

    const handleAddClick = () => {
        resetForm();
        setShowForm(true);
    };

    const handleEditClick = (strake: Strake) => {
        setFormData({
            name: strake.name,
            totalArea: strake.total_area.toString(),
            requiredCoverage: strake.required_coverage.toString(),
        });
        setEditingStrakeId(strake.id);
        setShowForm(true);
    };

    const handleDeleteClick = async (strake: Strake) => {
        if (!confirm(`Delete strake "${strake.name}"? Any scans assigned to this strake will become unassigned.`)) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onDeleteStrake(strake.id);
        } catch (error) {
            console.error('Failed to delete strake:', error);
            alert('Failed to delete strake. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        try {
            setIsSubmitting(true);

            const data = {
                name: formData.name.trim(),
                totalArea: parseFloat(formData.totalArea),
                requiredCoverage: parseFloat(formData.requiredCoverage),
            };

            if (editingStrakeId) {
                await onUpdateStrake(editingStrakeId, {
                    name: data.name,
                    total_area: data.totalArea,
                    required_coverage: data.requiredCoverage,
                });
            } else {
                await onCreateStrake(data);
            }

            resetForm();
        } catch (error) {
            console.error('Failed to save strake:', error);
            alert('Failed to save strake. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Manage Strakes - ${vesselName}`}
            size="large"
        >
            <div className="space-y-4">
                {/* Add button */}
                {!showForm && (
                    <button
                        onClick={handleAddClick}
                        className="btn btn-primary text-sm flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Strake
                    </button>
                )}

                {/* Form (add/edit) */}
                {showForm && (
                    <StrakeForm
                        formData={formData}
                        setFormData={setFormData}
                        onSubmit={handleSubmit}
                        onCancel={resetForm}
                        isEditing={!!editingStrakeId}
                        isSubmitting={isSubmitting}
                    />
                )}

                {/* Strakes list */}
                <div className="space-y-3">
                    {strakes.length > 0 ? (
                        strakes.map((strake) => (
                            <StrakeItem
                                key={strake.id}
                                strake={strake}
                                scans={scans}
                                onEdit={() => handleEditClick(strake)}
                                onDelete={() => handleDeleteClick(strake)}
                            />
                        ))
                    ) : (
                        <p className="text-sm italic py-4" style={{ color: 'var(--text-dim)' }}>
                            No strakes yet. Add a strake to organize your scans and track coverage.
                        </p>
                    )}
                </div>

                {/* Info box */}
                <div
                    className="rounded-lg p-4 text-sm"
                    style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p>
                            Strakes help you organize scans by location and track inspection coverage.
                            Define the total area and required coverage percentage for each strake.
                        </p>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
