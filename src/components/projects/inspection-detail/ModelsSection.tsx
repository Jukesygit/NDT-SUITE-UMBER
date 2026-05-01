import { useState } from 'react';
import { Trash2, Box, Cloud } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import { useDeleteVesselModel } from '../../../hooks/mutations/useVesselModelMutations';
import { useDeleteScanComposite, useLinkScanCompositeToProject } from '../../../hooks/mutations/useScanCompositeMutations';
import { useScanCompositeList } from '../../../hooks/queries/useScanComposites';
import type { ProjectVessel } from '../../../types/inspection-project';

const MODEL_TYPE_LABELS: Record<string, string> = {
    blank: 'Blank',
    coverage: 'Coverage',
    scan_overlayed: 'Scan Overlayed',
    fully_annotated: 'Fully Annotated',
};

const SECTION_TYPE_LABELS: Record<string, string> = {
    Shell: 'Shell',
    'Dome End': 'Dome End',
    Nozzle: 'Nozzle',
};

interface ModelsSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    composites: { id: string; name: string; stats: any; section_type?: string | null; created_at: string; project_vessel_id: string | null }[];
    vesselModels: { id: string; name: string; model_type?: string | null; updated_at: string; project_vessel_id: string | null; geometry?: any; coverageRects?: any[] }[];
}

export default function ModelsSection({ vessel, projectId, composites, vesselModels }: ModelsSectionProps) {
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
    const deleteModelMutation = useDeleteVesselModel();
    const deleteCompositeMutation = useDeleteScanComposite();
    const linkMutation = useLinkScanCompositeToProject();
    const { data: cloudComposites, isLoading: cloudLoading } = useScanCompositeList();

    const handleDeleteModel = (modelId: string, modelName: string) => {
        if (!window.confirm(`Delete model "${modelName}"? This cannot be undone.`)) return;
        deleteModelMutation.mutate(modelId);
    };

    const handleDeleteComposite = (compositeId: string, compositeName: string) => {
        if (!window.confirm(`Delete scan composite "${compositeName}"? This will also remove the stored thickness data and cannot be undone.`)) return;
        deleteCompositeMutation.mutate(compositeId);
    };

    const handleImportFromCloud = () => {
        if (!selectedImportId) return;
        linkMutation.mutate(
            { compositeId: selectedImportId, projectVesselId: vessel.id },
            { onSuccess: () => { setShowImportDialog(false); setSelectedImportId(null); } },
        );
    };

    const linkedIds = new Set(composites.map(c => c.id));
    const availableCloudComposites = (cloudComposites ?? []).filter(c => !linkedIds.has(c.id));
    const linkedModels = vesselModels.filter((m) => m.project_vessel_id === vessel.id);

    return (
        <CollapsibleSection title="3D Model & Scans">
            {/* Vessel Models */}
            <div className="pj-subsection-label">Vessel Models ({linkedModels.length})</div>

            {linkedModels.length > 0 ? (
                <div className="pj-model-grid" style={{ marginBottom: 16 }}>
                    {linkedModels.map((model) => {
                        const typeLabel = model.model_type
                            ? MODEL_TYPE_LABELS[model.model_type] || model.model_type
                            : null;

                        return (
                            <div key={model.id} className="pj-model-card">
                                <div className="pj-model-card-inner">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                        <span className="pj-model-name">{model.name}</span>
                                        <button
                                            onClick={() => handleDeleteModel(model.id, model.name)}
                                            title="Delete model"
                                            className="pj-vessel-action-btn danger-ghost"
                                            style={{ padding: 3, border: 'none' }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    {typeLabel && <span className="pj-model-badge">{typeLabel}</span>}

                                    <div className="pj-model-meta">
                                        {new Date(model.updated_at).toLocaleDateString()}
                                    </div>

                                    <a
                                        href={`/vessel-modeler?project=${projectId}&vessel=${vessel.id}&model=${model.id}`}
                                        className="pj-model-link"
                                    >
                                        <Box size={12} />
                                        Open in Modeler
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="pj-model-card" style={{ marginBottom: 16 }}>
                    <div className="pj-model-card-inner">
                        <div className="pj-empty-text" style={{ marginBottom: 8 }}>No models saved yet</div>
                        <a
                            href={`/vessel-modeler?project=${projectId}&vessel=${vessel.id}`}
                            className="pj-model-link"
                        >
                            <Box size={14} />
                            Create in Modeler
                        </a>
                    </div>
                </div>
            )}

            {/* Scan Composites */}
            <div className="pj-subsection-label">Scan Composites ({composites.length})</div>

            {composites.length > 0 ? (
                <div className="pj-model-grid">
                    {composites.map((comp) => {
                        const stats = comp.stats;
                        const hasStats = stats && typeof stats === 'object' && ('min' in stats || 'max' in stats || 'mean' in stats);
                        const sectionLabel = comp.section_type
                            ? SECTION_TYPE_LABELS[comp.section_type] || comp.section_type
                            : null;

                        return (
                            <div key={comp.id} className="pj-model-card">
                                <div className="pj-model-card-inner">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                        <span className="pj-model-name">{comp.name}</span>
                                        <button
                                            onClick={() => handleDeleteComposite(comp.id, comp.name)}
                                            title="Delete scan composite"
                                            className="pj-vessel-action-btn danger-ghost"
                                            style={{ padding: 3, border: 'none' }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    {sectionLabel && <span className="pj-model-badge">{sectionLabel}</span>}

                                    <div className="pj-model-meta" style={{ lineHeight: 1.4 }}>
                                        {hasStats ? (
                                            <>
                                                Min: {stats.min?.toFixed(2) ?? '—'} / Max: {stats.max?.toFixed(2) ?? '—'}
                                                <br />
                                                Mean: {stats.mean?.toFixed(2) ?? '—'}
                                            </>
                                        ) : 'No stats'}
                                    </div>

                                    <div className="pj-model-meta">
                                        {new Date(comp.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="pj-empty" style={{ padding: '12px 0' }}>
                    <div className="pj-empty-text">No scan composites yet.</div>
                </div>
            )}

            {/* Import from cloud */}
            <button
                onClick={() => setShowImportDialog(true)}
                className="pj-vessel-action-btn"
                style={{ marginTop: 14 }}
            >
                <Cloud size={14} />
                Import from Cloud
            </button>

            {/* Import Dialog */}
            {showImportDialog && (
                <div
                    style={{
                        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 50,
                    }}
                    onClick={() => setShowImportDialog(false)}
                >
                    <div
                        style={{
                            background: 'linear-gradient(180deg, var(--well-mid) 0%, var(--well-floor) 100%)',
                            border: '1px solid rgba(53, 160, 88, 0.15)',
                            borderRadius: 8, padding: 20, minWidth: 400, maxWidth: 500, maxHeight: '70vh',
                            display: 'flex', flexDirection: 'column',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="pj-info-card-title" style={{ marginBottom: 14, fontSize: '11px' }}>
                            Import Scan Composite from Cloud
                        </h3>

                        {cloudLoading ? (
                            <div className="pj-empty-text" style={{ padding: '16px 0', textAlign: 'center' }}>
                                Loading composites...
                            </div>
                        ) : availableCloudComposites.length === 0 ? (
                            <div className="pj-empty-text" style={{ padding: '16px 0', textAlign: 'center' }}>
                                No unlinked composites available.
                            </div>
                        ) : (
                            <div style={{ overflowY: 'auto', maxHeight: '40vh', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                                {availableCloudComposites.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => setSelectedImportId(c.id)}
                                        style={{
                                            padding: '10px 12px', borderRadius: 5, cursor: 'pointer',
                                            border: selectedImportId === c.id ? '1px solid rgba(53, 160, 88, 0.40)' : '1px solid rgba(53, 160, 88, 0.10)',
                                            background: selectedImportId === c.id ? 'rgba(53, 160, 88, 0.08)' : 'transparent',
                                        }}
                                    >
                                        <div className="pj-doc-filename">{c.name}</div>
                                        <div className="pj-model-meta" style={{ marginTop: 2 }}>
                                            {c.width} &times; {c.height} px · {new Date(c.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setShowImportDialog(false)} className="pj-btn secondary">
                                Cancel
                            </button>
                            <button
                                onClick={handleImportFromCloud}
                                disabled={!selectedImportId || linkMutation.isPending}
                                className="pj-btn primary"
                                style={{ opacity: !selectedImportId ? 0.5 : 1 }}
                            >
                                {linkMutation.isPending ? 'Linking...' : 'Link to Project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CollapsibleSection>
    );
}
