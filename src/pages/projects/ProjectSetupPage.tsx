import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useProject } from '../../hooks/queries/useInspectionProjects';
import { useCreateProject, useUpdateProject } from '../../hooks/mutations/useInspectionProjectMutations';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import type { EquipmentConfig } from '../../types/inspection-project';
import './projects.css';

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
    name: '', clientName: '', siteName: '', locationDescription: '',
    startDate: '', endDate: '', equipmentModel: '', probe: '',
    wedge: '', calibrationBlocks: '', procedureRef: '',
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
                        name: form.name, clientName: form.clientName || undefined,
                        siteName: form.siteName || undefined, locationDescription: form.locationDescription || undefined,
                        startDate: form.startDate || undefined, endDate: form.endDate || undefined, equipment,
                    },
                });
                navigate(`/projects/${id}`);
            } else {
                const newId = await createMutation.mutateAsync({
                    name: form.name, organizationId: user.organizationId ?? '', userId: user.id,
                    clientName: form.clientName || undefined, siteName: form.siteName || undefined,
                    locationDescription: form.locationDescription || undefined,
                    startDate: form.startDate || undefined, endDate: form.endDate || undefined, equipment,
                });
                navigate(`/projects/${newId}`);
            }
        } catch (err) {
            console.error('Failed to save project:', err);
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="pj-page" style={{ maxWidth: 800 }}>
            <button
                onClick={() => navigate(isEditing ? `/projects/${id}` : '/projects')}
                className="pj-back-btn"
            >
                <ArrowLeft size={14} />
                {isEditing ? 'Back to project' : 'Back to projects'}
            </button>

            <h1 className="pj-page-title" style={{ marginBottom: 24 }}>
                {isEditing ? 'Edit Project' : 'New Project'}
            </h1>

            <form onSubmit={handleSubmit}>
                <div className="pj-section-label">Project Details</div>
                <div className="pj-form-card">
                    <div className="pj-form-grid">
                        <div className="pj-form-field full-width">
                            <span className="pj-form-label">Project Name *</span>
                            <input value={form.name} onChange={update('name')} placeholder="e.g., Refinery Alpha Q2 Inspection" required className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Client</span>
                            <input value={form.clientName} onChange={update('clientName')} placeholder="e.g., ACME Corp" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Site Name</span>
                            <input value={form.siteName} onChange={update('siteName')} placeholder="e.g., Townsville Refinery" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field full-width">
                            <span className="pj-form-label">Location Description</span>
                            <textarea value={form.locationDescription} onChange={update('locationDescription')} placeholder="Address or directions..." rows={2} className="pj-form-input" style={{ resize: 'vertical' }} />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Start Date</span>
                            <input type="date" value={form.startDate} onChange={update('startDate')} className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">End Date</span>
                            <input type="date" value={form.endDate} onChange={update('endDate')} className="pj-form-input" />
                        </div>
                    </div>
                </div>

                <div className="pj-section-label">Equipment & Procedure</div>
                <div className="pj-form-card">
                    <div className="pj-form-grid">
                        <div className="pj-form-field">
                            <span className="pj-form-label">Equipment Model</span>
                            <input value={form.equipmentModel} onChange={update('equipmentModel')} placeholder="e.g., Zetec TOPAZ 64" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Probe</span>
                            <input value={form.probe} onChange={update('probe')} placeholder="e.g., 5L64-A12" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Wedge</span>
                            <input value={form.wedge} onChange={update('wedge')} placeholder="e.g., SA12-N55S" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Calibration Blocks</span>
                            <input value={form.calibrationBlocks} onChange={update('calibrationBlocks')} placeholder="e.g., V1, V2, Step block" className="pj-form-input" />
                        </div>
                        <div className="pj-form-field full-width">
                            <span className="pj-form-label">Procedure Reference</span>
                            <input value={form.procedureRef} onChange={update('procedureRef')} placeholder="e.g., PROC-NDT-2024-001" className="pj-form-input" />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => navigate(isEditing ? `/projects/${id}` : '/projects')}
                        className="pj-btn secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!form.name.trim() || isSaving}
                        className="pj-btn primary"
                    >
                        <Save size={14} />
                        {isSaving ? 'Saving...' : isEditing ? 'Update Project' : 'Create Project'}
                    </button>
                </div>
            </form>
        </div>
    );
}
