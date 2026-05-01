/**
 * ProjectVesselsTab - Manage vessels within a project
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { VesselCard } from './VesselCard';
import { Modal } from '../ui/Modal';
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
        <div className="pj-content">
            {/* Add vessel button */}
            <div className="pj-toolbar" style={{ justifyContent: 'flex-end' }}>
                <button onClick={openAddModal} className="pj-btn primary">
                    <Plus size={14} />
                    Add Vessel
                </button>
            </div>

            {/* Vessel list */}
            {vessels.length === 0 ? (
                <div className="pj-display-well">
                    <div className="pj-display">
                        <div className="pj-empty">
                            <div className="pj-empty-title">No vessels yet</div>
                            <div className="pj-empty-text">Add vessels to this project to begin inspection setup.</div>
                            <button onClick={openAddModal} className="pj-btn primary" style={{ marginTop: 14 }}>
                                <Plus size={14} />
                                Add Vessel
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pj-card-grid">
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
                    isOpen={true}
                    title={editingVessel ? 'Edit Vessel' : 'Add Vessel'}
                    onClose={() => { setShowAddModal(false); setEditingVessel(null); }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 400 }}>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Vessel Name *</span>
                            <input
                                value={form.vesselName}
                                onChange={e => setForm(f => ({ ...f, vesselName: e.target.value }))}
                                placeholder="e.g., Feed Drum"
                                autoFocus
                                className="pj-form-input"
                            />
                        </div>
                        <div className="pj-form-grid">
                            <div className="pj-form-field">
                                <span className="pj-form-label">Tag Number</span>
                                <input
                                    value={form.vesselTag}
                                    onChange={e => setForm(f => ({ ...f, vesselTag: e.target.value }))}
                                    placeholder="e.g., V-101"
                                    className="pj-form-input"
                                />
                            </div>
                            <div className="pj-form-field">
                                <span className="pj-form-label">Type</span>
                                <select
                                    value={form.vesselType}
                                    onChange={e => setForm(f => ({ ...f, vesselType: e.target.value }))}
                                    className="pj-form-input"
                                >
                                    <option value="">Select type...</option>
                                    <option value="pressure_vessel">Pressure Vessel</option>
                                    <option value="heat_exchanger">Heat Exchanger</option>
                                    <option value="tank">Tank</option>
                                    <option value="column">Column</option>
                                    <option value="piping">Piping</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Coverage Target (%)</span>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={form.coverageTargetPct}
                                onChange={e => setForm(f => ({ ...f, coverageTargetPct: e.target.value }))}
                                placeholder="e.g., 40"
                                className="pj-form-input"
                            />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Notes</span>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Any notes for this vessel..."
                                rows={2}
                                className="pj-form-input"
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                            <button onClick={() => { setShowAddModal(false); setEditingVessel(null); }} className="pj-btn secondary">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={!form.vesselName.trim() || createMutation.isPending || updateMutation.isPending}
                                className="pj-btn primary"
                                style={{ opacity: form.vesselName.trim() ? 1 : 0.5 }}
                            >
                                {editingVessel ? 'Update' : 'Add Vessel'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <Modal isOpen={true} title="Delete Vessel" onClose={() => setDeleteTarget(null)}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Delete <strong>{deleteTarget.vessel_tag ? `${deleteTarget.vessel_tag} ` : ''}{deleteTarget.vessel_name}</strong>?
                        This will unlink any associated composites and models.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDeleteTarget(null)} className="pj-btn secondary">Cancel</button>
                        <button onClick={handleDelete} className="pj-btn danger">Delete</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
