/**
 * ProjectVesselsTab - Manage vessels within a project
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { VesselCard } from './VesselCard';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import {
    useCreateProjectVessel,
    useUpdateProjectVessel,
    useDeleteProjectVessel,
} from '../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../types/inspection-project';

interface ProjectVesselsTabProps {
    projectId: string;
    vessels: ProjectVessel[];
    compositeCountByVessel: Map<string, number>;
}

interface VesselFormState {
    vesselName: string;
    vesselTag: string;
    vesselType: string;
    coverageTargetPct: string;
    notes: string;
}

const EMPTY_FORM: VesselFormState = {
    vesselName: '',
    vesselTag: '',
    vesselType: '',
    coverageTargetPct: '',
    notes: '',
};

const INPUT_STYLE: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
};

export function ProjectVesselsTab({ projectId, vessels, compositeCountByVessel }: ProjectVesselsTabProps) {
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingVessel, setEditingVessel] = useState<ProjectVessel | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProjectVessel | null>(null);
    const [form, setForm] = useState<VesselFormState>(EMPTY_FORM);

    const createMutation = useCreateProjectVessel();
    const updateMutation = useUpdateProjectVessel();
    const deleteMutation = useDeleteProjectVessel();

    const openAddModal = () => {
        setForm(EMPTY_FORM);
        setEditingVessel(null);
        setShowAddModal(true);
    };

    const openEditModal = (v: ProjectVessel) => {
        setForm({
            vesselName: v.vessel_name,
            vesselTag: v.vessel_tag ?? '',
            vesselType: v.vessel_type ?? '',
            coverageTargetPct: v.coverage_target_pct?.toString() ?? '',
            notes: v.notes ?? '',
        });
        setEditingVessel(v);
        setShowAddModal(true);
    };

    const handleSave = async () => {
        if (!form.vesselName.trim()) return;

        const coverage = form.coverageTargetPct ? parseFloat(form.coverageTargetPct) : undefined;

        if (editingVessel) {
            await updateMutation.mutateAsync({
                id: editingVessel.id,
                projectId,
                params: {
                    vesselName: form.vesselName,
                    vesselTag: form.vesselTag || undefined,
                    vesselType: form.vesselType || undefined,
                    coverageTargetPct: coverage ?? null,
                    notes: form.notes || undefined,
                },
            });
        } else {
            await createMutation.mutateAsync({
                projectId,
                vesselName: form.vesselName,
                vesselTag: form.vesselTag || undefined,
                vesselType: form.vesselType || undefined,
                coverageTargetPct: coverage,
            });
        }

        setShowAddModal(false);
        setEditingVessel(null);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await deleteMutation.mutateAsync({ id: deleteTarget.id, projectId });
        setDeleteTarget(null);
    };

    return (
        <div>
            {/* Add vessel button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                    onClick={openAddModal}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    <Plus size={16} />
                    Add Vessel
                </button>
            </div>

            {/* Vessel list */}
            {vessels.length === 0 ? (
                <EmptyState
                    title="No vessels yet"
                    message="Add vessels to this project to begin inspection setup."
                    icon="default"
                    action={{ label: 'Add Vessel', onClick: openAddModal }}
                />
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
                    {vessels.map(v => (
                        <VesselCard
                            key={v.id}
                            vessel={v}
                            projectId={projectId}
                            compositeCount={compositeCountByVessel.get(v.id) ?? 0}
                            onEdit={() => openEditModal(v)}
                            onDelete={() => setDeleteTarget(v)}
                        />
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <Modal
                    title={editingVessel ? 'Edit Vessel' : 'Add Vessel'}
                    onClose={() => { setShowAddModal(false); setEditingVessel(null); }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 400 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Vessel Name *</span>
                            <input
                                value={form.vesselName}
                                onChange={e => setForm(f => ({ ...f, vesselName: e.target.value }))}
                                placeholder="e.g., Feed Drum"
                                autoFocus
                                style={INPUT_STYLE}
                            />
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Tag Number</span>
                                <input
                                    value={form.vesselTag}
                                    onChange={e => setForm(f => ({ ...f, vesselTag: e.target.value }))}
                                    placeholder="e.g., V-101"
                                    style={INPUT_STYLE}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Type</span>
                                <select
                                    value={form.vesselType}
                                    onChange={e => setForm(f => ({ ...f, vesselType: e.target.value }))}
                                    style={INPUT_STYLE}
                                >
                                    <option value="">Select type...</option>
                                    <option value="pressure_vessel">Pressure Vessel</option>
                                    <option value="heat_exchanger">Heat Exchanger</option>
                                    <option value="tank">Tank</option>
                                    <option value="column">Column</option>
                                    <option value="piping">Piping</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>
                        </div>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Coverage Target (%)</span>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={form.coverageTargetPct}
                                onChange={e => setForm(f => ({ ...f, coverageTargetPct: e.target.value }))}
                                placeholder="e.g., 40"
                                style={INPUT_STYLE}
                            />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Notes</span>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Any notes for this vessel..."
                                rows={2}
                                style={{ ...INPUT_STYLE, resize: 'vertical' }}
                            />
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                            <button
                                onClick={() => { setShowAddModal(false); setEditingVessel(null); }}
                                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!form.vesselName.trim() || createMutation.isPending || updateMutation.isPending}
                                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', opacity: form.vesselName.trim() ? 1 : 0.5 }}
                            >
                                {editingVessel ? 'Update' : 'Add Vessel'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <Modal title="Delete Vessel" onClose={() => setDeleteTarget(null)}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Delete <strong>{deleteTarget.vessel_tag ? `${deleteTarget.vessel_tag} ` : ''}{deleteTarget.vessel_name}</strong>?
                        This will unlink any associated composites and models.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDeleteTarget(null)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}
                        >
                            Delete
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
