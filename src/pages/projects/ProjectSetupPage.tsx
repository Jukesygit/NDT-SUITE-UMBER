/**
 * ProjectSetupPage - Create or edit an inspection project
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useProject } from '../../hooks/queries/useInspectionProjects';
import { useCreateProject, useUpdateProject } from '../../hooks/mutations/useInspectionProjectMutations';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import type { EquipmentConfig } from '../../types/inspection-project';

interface FormState {
    name: string;
    clientName: string;
    siteName: string;
    locationDescription: string;
    startDate: string;
    endDate: string;
    equipmentModel: string;
    probe: string;
    wedge: string;
    calibrationBlocks: string;
    procedureRef: string;
}

const EMPTY_FORM: FormState = {
    name: '',
    clientName: '',
    siteName: '',
    locationDescription: '',
    startDate: '',
    endDate: '',
    equipmentModel: '',
    probe: '',
    wedge: '',
    calibrationBlocks: '',
    procedureRef: '',
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
            {children}
        </label>
    );
}

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

export default function ProjectSetupPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const isEditing = !!id;

    const { user } = useAuth();
    const { data: existingProject, isLoading } = useProject(id);
    const createMutation = useCreateProject();
    const updateMutation = useUpdateProject();

    const [form, setForm] = useState<FormState>(() => {
        if (!existingProject) return EMPTY_FORM;
        return {
            name: existingProject.name,
            clientName: existingProject.client_name ?? '',
            siteName: existingProject.site_name ?? '',
            locationDescription: existingProject.location_description ?? '',
            startDate: existingProject.start_date ?? '',
            endDate: existingProject.end_date ?? '',
            equipmentModel: (existingProject.equipment as EquipmentConfig)?.model ?? '',
            probe: (existingProject.equipment as EquipmentConfig)?.probe ?? '',
            wedge: (existingProject.equipment as EquipmentConfig)?.wedge ?? '',
            calibrationBlocks: (existingProject.equipment as EquipmentConfig)?.calibration_blocks ?? '',
            procedureRef: (existingProject.equipment as EquipmentConfig)?.procedure_ref ?? '',
        };
    });

    // Sync form when editing data loads
    const [formLoaded, setFormLoaded] = useState(false);
    if (isEditing && existingProject && !formLoaded) {
        setForm({
            name: existingProject.name,
            clientName: existingProject.client_name ?? '',
            siteName: existingProject.site_name ?? '',
            locationDescription: existingProject.location_description ?? '',
            startDate: existingProject.start_date ?? '',
            endDate: existingProject.end_date ?? '',
            equipmentModel: (existingProject.equipment as EquipmentConfig)?.model ?? '',
            probe: (existingProject.equipment as EquipmentConfig)?.probe ?? '',
            wedge: (existingProject.equipment as EquipmentConfig)?.wedge ?? '',
            calibrationBlocks: (existingProject.equipment as EquipmentConfig)?.calibration_blocks ?? '',
            procedureRef: (existingProject.equipment as EquipmentConfig)?.procedure_ref ?? '',
        });
        setFormLoaded(true);
    }

    if (isEditing && isLoading) return <PageSpinner message="Loading project..." />;

    const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !user) return;

        const equipment: EquipmentConfig = {};
        if (form.equipmentModel) equipment.model = form.equipmentModel;
        if (form.probe) equipment.probe = form.probe;
        if (form.wedge) equipment.wedge = form.wedge;
        if (form.calibrationBlocks) equipment.calibration_blocks = form.calibrationBlocks;
        if (form.procedureRef) equipment.procedure_ref = form.procedureRef;

        try {
            if (isEditing && id) {
                await updateMutation.mutateAsync({
                    id,
                    params: {
                        name: form.name,
                        clientName: form.clientName || undefined,
                        siteName: form.siteName || undefined,
                        locationDescription: form.locationDescription || undefined,
                        startDate: form.startDate || undefined,
                        endDate: form.endDate || undefined,
                        equipment,
                    },
                });
                navigate(`/projects/${id}`);
            } else {
                const newId = await createMutation.mutateAsync({
                    name: form.name,
                    organizationId: user.organizationId ?? '',
                    userId: user.id,
                    clientName: form.clientName || undefined,
                    siteName: form.siteName || undefined,
                    locationDescription: form.locationDescription || undefined,
                    startDate: form.startDate || undefined,
                    endDate: form.endDate || undefined,
                    equipment,
                });
                navigate(`/projects/${newId}`);
            }
        } catch (err) {
            console.error('Failed to save project:', err);
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div style={{ padding: '32px 40px', maxWidth: 720 }}>
            {/* Back button */}
            <button
                onClick={() => navigate(isEditing ? `/projects/${id}` : '/projects')}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: 0,
                    marginBottom: 24,
                }}
            >
                <ArrowLeft size={16} />
                {isEditing ? 'Back to project' : 'Back to projects'}
            </button>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', marginBottom: 32 }}>
                {isEditing ? 'Edit Project' : 'New Project'}
            </h1>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Project Details */}
                <section>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Project Details
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <FormField label="Project Name *">
                                <input
                                    value={form.name}
                                    onChange={update('name')}
                                    placeholder="e.g., Refinery Alpha Q2 Inspection"
                                    required
                                    style={INPUT_STYLE}
                                />
                            </FormField>
                        </div>
                        <FormField label="Client">
                            <input value={form.clientName} onChange={update('clientName')} placeholder="e.g., ACME Corp" style={INPUT_STYLE} />
                        </FormField>
                        <FormField label="Site Name">
                            <input value={form.siteName} onChange={update('siteName')} placeholder="e.g., Townsville Refinery" style={INPUT_STYLE} />
                        </FormField>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <FormField label="Location Description">
                                <textarea
                                    value={form.locationDescription}
                                    onChange={update('locationDescription')}
                                    placeholder="Address or directions..."
                                    rows={2}
                                    style={{ ...INPUT_STYLE, resize: 'vertical' }}
                                />
                            </FormField>
                        </div>
                        <FormField label="Start Date">
                            <input type="date" value={form.startDate} onChange={update('startDate')} style={INPUT_STYLE} />
                        </FormField>
                        <FormField label="End Date">
                            <input type="date" value={form.endDate} onChange={update('endDate')} style={INPUT_STYLE} />
                        </FormField>
                    </div>
                </section>

                {/* Equipment */}
                <section>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Equipment & Procedure
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <FormField label="Equipment Model">
                            <input value={form.equipmentModel} onChange={update('equipmentModel')} placeholder="e.g., Zetec TOPAZ 64" style={INPUT_STYLE} />
                        </FormField>
                        <FormField label="Probe">
                            <input value={form.probe} onChange={update('probe')} placeholder="e.g., 5L64-A12" style={INPUT_STYLE} />
                        </FormField>
                        <FormField label="Wedge">
                            <input value={form.wedge} onChange={update('wedge')} placeholder="e.g., SA12-N55S" style={INPUT_STYLE} />
                        </FormField>
                        <FormField label="Calibration Blocks">
                            <input value={form.calibrationBlocks} onChange={update('calibrationBlocks')} placeholder="e.g., V1, V2, Step block" style={INPUT_STYLE} />
                        </FormField>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <FormField label="Procedure Reference">
                                <input value={form.procedureRef} onChange={update('procedureRef')} placeholder="e.g., PROC-NDT-2024-001" style={INPUT_STYLE} />
                            </FormField>
                        </div>
                    </div>
                </section>

                {/* Submit */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
                    <button
                        type="button"
                        onClick={() => navigate(isEditing ? `/projects/${id}` : '/projects')}
                        style={{
                            padding: '8px 20px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!form.name.trim() || isSaving}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 20px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: isSaving ? 'wait' : 'pointer',
                            opacity: (!form.name.trim() || isSaving) ? 0.5 : 1,
                        }}
                    >
                        <Save size={16} />
                        {isSaving ? 'Saving...' : isEditing ? 'Update Project' : 'Create Project'}
                    </button>
                </div>
            </form>
        </div>
    );
}
