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
            {
                onSuccess: () => {
                    setShowImportDialog(false);
                    setSelectedImportId(null);
                },
            },
        );
    };

    // Filter out composites already linked to this vessel
    const linkedIds = new Set(composites.map(c => c.id));
    const availableCloudComposites = (cloudComposites ?? []).filter(c => !linkedIds.has(c.id));

    const linkedModels = vesselModels.filter((m) => m.project_vessel_id === vessel.id);

    return (
        <CollapsibleSection title="3D Model & Scans">
            {/* Vessel Models */}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Vessel Models ({linkedModels.length})
            </div>

            {linkedModels.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}>
                    {linkedModels.map((model) => {
                        const typeLabel = model.model_type
                            ? MODEL_TYPE_LABELS[model.model_type] || model.model_type
                            : null;

                        return (
                            <div
                                key={model.id}
                                style={{
                                    padding: '12px 14px',
                                    background: 'var(--surface-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 8,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {model.name}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteModel(model.id, model.name)}
                                        title="Delete model"
                                        style={{
                                            display: 'flex', alignItems: 'center', padding: 3,
                                            borderRadius: 4, border: 'none', background: 'transparent',
                                            color: 'rgba(239,68,68,0.5)', cursor: 'pointer', flexShrink: 0,
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>

                                {typeLabel && (
                                    <span
                                        style={{
                                            alignSelf: 'flex-start',
                                            padding: '1px 8px',
                                            borderRadius: 10,
                                            fontSize: '0.6rem',
                                            fontWeight: 500,
                                            background: 'rgba(59,130,246,0.15)',
                                            color: '#60a5fa',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {typeLabel}
                                    </span>
                                )}

                                <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)' }}>
                                    {new Date(model.updated_at).toLocaleDateString()}
                                </div>

                                <a
                                    href={`/vessel-modeler?project=${projectId}&vessel=${vessel.id}&model=${model.id}`}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none',
                                        marginTop: 'auto',
                                    }}
                                >
                                    <Box size={12} />
                                    Open in Modeler
                                </a>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div
                    style={{
                        padding: 14,
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        marginBottom: 16,
                    }}
                >
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-quaternary)' }}>
                        No models saved yet
                    </div>
                    <a
                        href={`/vessel-modeler?project=${projectId}&vessel=${vessel.id}`}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            marginTop: 8, fontSize: '0.8rem', color: '#60a5fa', textDecoration: 'none',
                        }}
                    >
                        <Box size={14} />
                        Create in Modeler
                    </a>
                </div>
            )}

            {/* Scan Composites */}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Scan Composites ({composites.length})
            </div>

            {composites.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                    {composites.map((comp) => {
                        const stats = comp.stats;
                        const hasStats = stats && typeof stats === 'object' && ('min' in stats || 'max' in stats || 'mean' in stats);
                        const sectionLabel = comp.section_type
                            ? SECTION_TYPE_LABELS[comp.section_type] || comp.section_type
                            : null;

                        return (
                            <div
                                key={comp.id}
                                style={{
                                    padding: '12px 14px',
                                    background: 'var(--surface-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 8,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                {/* Header: name + delete */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {comp.name}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteComposite(comp.id, comp.name)}
                                        title="Delete scan composite"
                                        style={{
                                            display: 'flex', alignItems: 'center', padding: 3,
                                            borderRadius: 4, border: 'none', background: 'transparent',
                                            color: 'rgba(239,68,68,0.5)', cursor: 'pointer', flexShrink: 0,
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>

                                {/* Section type badge */}
                                {sectionLabel && (
                                    <span
                                        style={{
                                            alignSelf: 'flex-start',
                                            padding: '1px 8px',
                                            borderRadius: 10,
                                            fontSize: '0.6rem',
                                            fontWeight: 500,
                                            background: 'rgba(16,185,129,0.15)',
                                            color: '#34d399',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {sectionLabel}
                                    </span>
                                )}

                                {/* Stats */}
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-quaternary)', lineHeight: 1.4 }}>
                                    {hasStats ? (
                                        <>
                                            <span>Min: {stats.min?.toFixed(2) ?? '\u2014'}</span>
                                            {' / '}
                                            <span>Max: {stats.max?.toFixed(2) ?? '\u2014'}</span>
                                            <br />
                                            <span>Mean: {stats.mean?.toFixed(2) ?? '\u2014'}</span>
                                        </>
                                    ) : 'No stats'}
                                </div>

                                {/* Date */}
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)' }}>
                                    {new Date(comp.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-quaternary)', fontSize: '0.85rem' }}>
                    No scan composites yet.
                </div>
            )}

            {/* Import from cloud button */}
            <button
                onClick={() => setShowImportDialog(true)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 14, fontSize: '0.85rem', color: '#60a5fa',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
            >
                <Cloud size={14} />
                Import from Cloud
            </button>

            {/* Import from Cloud Dialog */}
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
                            background: '#1f2937', border: '1px solid #374151',
                            borderRadius: 8, padding: 24, minWidth: 400, maxWidth: 500, maxHeight: '70vh',
                            display: 'flex', flexDirection: 'column',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ color: 'white', fontWeight: 500, marginBottom: 16, fontSize: '0.95rem' }}>
                            Import Scan Composite from Cloud
                        </h3>

                        {cloudLoading ? (
                            <div style={{ color: 'var(--text-quaternary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                                Loading composites...
                            </div>
                        ) : availableCloudComposites.length === 0 ? (
                            <div style={{ color: 'var(--text-quaternary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                                No unlinked composites available.
                            </div>
                        ) : (
                            <div style={{ overflowY: 'auto', maxHeight: '40vh', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                                {availableCloudComposites.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => setSelectedImportId(c.id)}
                                        style={{
                                            padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                                            border: selectedImportId === c.id ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                                            background: selectedImportId === c.id ? 'rgba(59,130,246,0.1)' : 'var(--surface-elevated)',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', marginTop: 2 }}>
                                            {c.width} &times; {c.height} px &middot; {new Date(c.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                onClick={() => setShowImportDialog(false)}
                                style={{
                                    padding: '8px 16px', fontSize: '0.85rem', borderRadius: 6,
                                    background: '#374151', color: '#d1d5db', border: 'none', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImportFromCloud}
                                disabled={!selectedImportId || linkMutation.isPending}
                                style={{
                                    padding: '8px 16px', fontSize: '0.85rem', borderRadius: 6,
                                    background: !selectedImportId ? '#1e3a5f' : '#2563eb', color: 'white',
                                    border: 'none', cursor: selectedImportId ? 'pointer' : 'default',
                                    opacity: !selectedImportId ? 0.5 : 1,
                                }}
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
