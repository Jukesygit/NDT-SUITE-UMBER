/**
 * InspectionPage - Dashboard-style inspection view
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';
import { assetService } from '../../services/asset-service.js';
import {
    useVesselScans,
    useVesselStrakes,
    useVesselImages,
    useInspection,
    type Scan,
    type Strake,
} from '../../hooks/queries/useDataHub';
import {
    useDeleteScan,
    useCreateStrake,
    useUpdateStrake,
    useDeleteStrake,
    useUpdateScan,
    useUploadVesselImages,
    useUploadDrawing,
    useUpdateDrawingAnnotations,
    useUpdateInspection,
} from '../../hooks/mutations/useInspectionMutations';
import { useInspectionDialogs } from './hooks/useInspectionDialogs';

// Dialogs
import StrakeManagementDialog from './components/StrakeManagementDialog';
import ImageUploadDialog from './components/ImageUploadDialog';
import DrawingUploadDialog from './components/DrawingUploadDialog';
import DrawingAnnotationDialog from './components/DrawingAnnotationDialog';
import ScanReassignDialog from './components/ScanReassignDialog';
import ImageLightbox from './components/ImageLightbox';

// Types
type AnnotationType = 'marker' | 'box';

interface Annotation {
    id: string;
    type: AnnotationType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    label: string;
}

interface Drawing {
    image_url: string;
    annotations?: Annotation[];
    comment?: string;
}

interface VesselWithDrawings {
    id: string;
    name: string;
    asset_id: string;
    location_drawing?: Drawing | null;
    ga_drawing?: Drawing | null;
}

// Status config
const STATUS_CONFIG = {
    planned: { label: 'Planned', color: '#3b82f6', bg: '#3b82f622' },
    in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#f59e0b22' },
    completed: { label: 'Completed', color: '#22c55e', bg: '#22c55e22' },
    on_hold: { label: 'On Hold', color: '#6b7280', bg: '#6b728022' },
} as const;

// Calculate coverage
function calcCoverage(strakes: Strake[], scans: Scan[]) {
    if (strakes.length === 0) return 0;
    return strakes.reduce((acc, s) => {
        const n = scans.filter(sc => sc.strake_id === s.id).length;
        const target = (s.total_area * s.required_coverage) / 100;
        return acc + (target > 0 ? Math.min((n * s.total_area / 10 / target) * 100, 100) : 0);
    }, 0) / strakes.length;
}

// ============================================================================
// Dashboard Components
// ============================================================================

function MetricCard({ label, value, icon, color = '#f59e0b', onClick }: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
    onClick?: () => void;
}) {
    return (
        <div
            className={`glass-panel p-4 ${onClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                <div style={{ color }}>{icon}</div>
            </div>
            <div className="text-3xl font-bold" style={{ color }}>{value}</div>
        </div>
    );
}

function StatusDropdown({ status, onChange }: {
    status: keyof typeof STATUS_CONFIG;
    onChange: (s: keyof typeof STATUS_CONFIG) => void;
}) {
    const [open, setOpen] = useState(false);
    const cfg = STATUS_CONFIG[status];

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="btn-secondary btn-sm flex items-center gap-2"
            >
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                <span style={{ color: cfg.color }}>{cfg.label}</span>
                <svg className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 py-1 rounded-lg shadow-xl min-w-[140px] glass-panel">
                        {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                            <button
                                key={key}
                                onClick={() => { onChange(key as keyof typeof STATUS_CONFIG); setOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                <span className="w-2 h-2 rounded-full" style={{ background: val.color }} />
                                {val.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function DrawingPanel({ title, drawing, onUpload, onAnnotate, onView }: {
    title: string;
    drawing: Drawing | null;
    onUpload: () => void;
    onAnnotate: () => void;
    onView: () => void;
}) {
    return (
        <div className="glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</span>
                {drawing?.image_url ? (
                    <button onClick={onAnnotate} className="text-[10px] hover:underline" style={{ color: '#f59e0b' }}>
                        Annotate
                    </button>
                ) : (
                    <button onClick={onUpload} className="text-[10px] hover:underline" style={{ color: '#22c55e' }}>
                        + Upload
                    </button>
                )}
            </div>
            {drawing?.image_url ? (
                <div className="relative cursor-pointer group rounded overflow-hidden" onClick={onView}>
                    <img src={drawing.image_url} alt={title} className="w-full h-24 object-contain bg-black/20" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </div>
                    {(drawing.annotations?.length || 0) > 0 && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white">
                            {drawing.annotations?.length}
                        </span>
                    )}
                </div>
            ) : (
                <div className="h-24 rounded flex items-center justify-center" style={{ background: 'var(--glass-bg-tertiary)' }}>
                    <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            )}
        </div>
    );
}

function StrakeRow({ strake, scans, onScanClick, onDelete, onReassign }: {
    strake: Strake;
    scans: Scan[];
    onScanClick: (s: Scan) => void;
    onDelete: (s: Scan) => void;
    onReassign: (s: Scan) => void;
}) {
    const strakeScans = scans.filter(s => s.strake_id === strake.id);
    const coverage = strake.total_area > 0
        ? Math.min((strakeScans.length * strake.total_area / 10) / (strake.total_area * strake.required_coverage / 100) * 100, 100)
        : 0;
    const color = coverage >= 100 ? '#22c55e' : '#f59e0b';

    return (
        <div className="glass-panel p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>{strake.name}</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {strake.total_area.toFixed(1)} m² • {strake.required_coverage}% required
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-tertiary)' }}>
                        <div className="h-full" style={{ width: `${coverage}%`, background: color }} />
                    </div>
                    <span className="text-sm font-bold min-w-[45px] text-right" style={{ color }}>{coverage.toFixed(0)}%</span>
                </div>
            </div>
            {strakeScans.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {strakeScans.map(scan => (
                        <div
                            key={scan.id}
                            className="group relative w-20 rounded overflow-hidden cursor-pointer"
                            style={{ background: 'var(--glass-bg-tertiary)', border: '1px solid var(--glass-border)' }}
                            onClick={() => onScanClick(scan)}
                        >
                            <div className="aspect-video flex items-center justify-center relative">
                                {scan.thumbnail ? (
                                    <img src={scan.thumbnail} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <svg className="w-5 h-5" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                )}
                                <span className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-bold uppercase"
                                    style={{ background: scan.tool_type === 'pec' ? '#eab30833' : scan.tool_type === 'cscan' ? '#3b82f633' : '#a855f733',
                                             color: scan.tool_type === 'pec' ? '#eab308' : scan.tool_type === 'cscan' ? '#3b82f6' : '#a855f7' }}>
                                    {scan.tool_type}
                                </span>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1">
                                    <button onClick={e => { e.stopPropagation(); onReassign(scan); }} className="p-1 rounded bg-purple-600 text-white">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); onDelete(scan); }} className="p-1 rounded bg-red-600 text-white">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="px-1 py-0.5 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>{scan.name}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No scans assigned</p>
            )}
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export default function InspectionPage() {
    const { assetId, vesselId, inspectionId } = useParams<{ assetId: string; vesselId: string; inspectionId?: string }>();
    const navigate = useNavigate();
    const dialogState = useInspectionDialogs();
    const [editingNotes, setEditingNotes] = useState(false);
    const [notes, setNotes] = useState('');

    // Data fetching
    const { data: inspection, isLoading: inspectionLoading } = useInspection(inspectionId || null);
    const { data: vessel, isLoading: vesselLoading } = useQuery({
        queryKey: ['vessel-details', vesselId],
        queryFn: async (): Promise<VesselWithDrawings | null> => vesselId ? await assetService.getVesselWithDrawings(vesselId) : null,
        enabled: !!vesselId,
    });
    const { data: asset } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: async () => assetId ? await assetService.getAsset(assetId) : null,
        enabled: !!assetId,
    });
    const { data: scans = [], isLoading: scansLoading } = useVesselScans(vesselId || null);
    const { data: strakes = [], isLoading: strakesLoading } = useVesselStrakes(vesselId || null);
    const { data: images = [] } = useVesselImages(vesselId || null);

    // Mutations
    const deleteScan = useDeleteScan();
    const createStrake = useCreateStrake();
    const updateStrake = useUpdateStrake();
    const deleteStrake = useDeleteStrake();
    const updateScan = useUpdateScan();
    const uploadImages = useUploadVesselImages();
    const uploadDrawing = useUploadDrawing();
    const updateAnnotations = useUpdateDrawingAnnotations();
    const updateInspection = useUpdateInspection();

    // Loading
    const isLoading = vesselLoading || scansLoading || strakesLoading || (inspectionId && inspectionLoading);
    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                <MatrixLogoRacer size={160} duration={4} />
                <p className="animate-pulse" style={{ color: 'var(--text-dim)' }}>Loading...</p>
            </div>
        );
    }

    // Derived
    const coverage = calcCoverage(strakes, scans);
    const statusCfg = STATUS_CONFIG[inspection?.status || 'planned'];
    const unassigned = scans.filter(s => !s.strake_id);

    // Handlers
    const handleScanClick = (scan: Scan) => {
        const routes: Record<string, string> = { pec: '/pec-visualizer', cscan: '/cscan-visualizer', '3dview': '/3d-viewer' };
        const route = routes[scan.tool_type];
        if (route) navigate(`${route}?scanId=${scan.id}&vesselId=${vesselId}&assetId=${assetId}`);
    };
    const handleDeleteScan = async (scan: Scan) => {
        if (confirm(`Delete "${scan.name}"?`) && vesselId) await deleteScan.mutateAsync({ scanId: scan.id, vesselId });
    };
    const handleReassignScan = async (scanId: string, strakeId: string | null) => {
        if (vesselId) await updateScan.mutateAsync({ scanId, vesselId, updates: { strake_id: strakeId } });
    };
    const handleUpdateInspection = async (updates: Partial<{ name: string; status: keyof typeof STATUS_CONFIG; notes: string; inspection_date: string }>) => {
        if (inspectionId && vesselId) await updateInspection.mutateAsync({ inspectionId, vesselId, updates });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header Bar */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <div>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                        <button onClick={() => navigate('/')} className="hover:underline" style={{ color: 'var(--accent-primary)' }}>Data Hub</button>
                        <span>/</span>
                        <span>{asset?.name}</span>
                        <span>/</span>
                        <button onClick={() => navigate(`/vessel/${assetId}/${vesselId}`)} className="hover:underline" style={{ color: 'var(--accent-primary)' }}>{vessel?.name}</button>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{inspection?.name || 'Inspection'}</h1>
                </div>
                <StatusDropdown status={inspection?.status || 'planned'} onChange={s => handleUpdateInspection({ status: s })} />
            </div>

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {/* Row 1: Metric Cards */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    <MetricCard
                        label="Status"
                        value={statusCfg.label}
                        color={statusCfg.color}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                    <MetricCard
                        label="Total Scans"
                        value={scans.length}
                        color="#3b82f6"
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                        onClick={() => alert('Add scans coming soon')}
                    />
                    <MetricCard
                        label="Strakes"
                        value={strakes.length}
                        color="#a855f7"
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
                        onClick={dialogState.openStrakeManagement}
                    />
                    <MetricCard
                        label="Coverage"
                        value={`${coverage.toFixed(0)}%`}
                        color={coverage >= 100 ? '#22c55e' : '#f59e0b'}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                    />
                    <MetricCard
                        label="Photos"
                        value={images.length}
                        color="#06b6d4"
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        onClick={dialogState.openImageUpload}
                    />
                </div>

                {/* Row 2: Info + Drawings */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    {/* Inspection Info */}
                    <div className="glass-panel p-4 col-span-2">
                        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Inspection Details</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Date</label>
                                <input
                                    type="date"
                                    value={inspection?.inspection_date || ''}
                                    onChange={e => handleUpdateInspection({ inspection_date: e.target.value })}
                                    className="glass-input w-full mt-1"
                                    style={{ padding: '8px 12px' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Notes</label>
                                {editingNotes ? (
                                    <textarea
                                        autoFocus
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        onBlur={() => { handleUpdateInspection({ notes }); setEditingNotes(false); }}
                                        className="glass-textarea w-full mt-1"
                                        rows={3}
                                    />
                                ) : (
                                    <div
                                        onClick={() => { setNotes(inspection?.notes || ''); setEditingNotes(true); }}
                                        className="mt-1 p-2 rounded text-sm cursor-pointer min-h-[70px]"
                                        style={{ background: 'var(--glass-bg-secondary)', border: '1px solid var(--glass-border)', color: inspection?.notes ? 'var(--text-primary)' : 'var(--text-dim)' }}
                                    >
                                        {inspection?.notes || 'Click to add notes...'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Drawings */}
                    <DrawingPanel
                        title="Location Drawing"
                        drawing={vessel?.location_drawing || null}
                        onUpload={() => dialogState.openDrawingUpload('location')}
                        onAnnotate={() => dialogState.openDrawingAnnotation('location')}
                        onView={() => vessel?.location_drawing?.image_url && window.open(vessel.location_drawing.image_url, '_blank')}
                    />
                    <DrawingPanel
                        title="GA Drawing"
                        drawing={vessel?.ga_drawing || null}
                        onUpload={() => dialogState.openDrawingUpload('ga')}
                        onAnnotate={() => dialogState.openDrawingAnnotation('ga')}
                        onView={() => vessel?.ga_drawing?.image_url && window.open(vessel.ga_drawing.image_url, '_blank')}
                    />
                </div>

                {/* Row 3: Strakes */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                            Strakes & Coverage
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={() => alert('Add scans coming soon')} className="btn-primary btn-sm">+ Add Scans</button>
                            <button onClick={dialogState.openStrakeManagement} className="btn-secondary btn-sm">Manage Strakes</button>
                        </div>
                    </div>
                    {strakes.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                            {strakes.map(strake => (
                                <StrakeRow
                                    key={strake.id}
                                    strake={strake}
                                    scans={scans}
                                    onScanClick={handleScanClick}
                                    onDelete={handleDeleteScan}
                                    onReassign={s => dialogState.openScanReassign(s)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="glass-panel p-8 text-center" style={{ border: '2px dashed var(--glass-border)' }}>
                            <p className="mb-3" style={{ color: 'var(--text-dim)' }}>No strakes defined yet</p>
                            <button onClick={dialogState.openStrakeManagement} className="btn-primary btn-sm">+ Add First Strake</button>
                        </div>
                    )}
                </div>

                {/* Unassigned Scans */}
                {unassigned.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
                            Unassigned Scans ({unassigned.length})
                        </h3>
                        <div className="glass-panel p-4" style={{ border: '2px dashed #f59e0b44' }}>
                            <div className="flex flex-wrap gap-2">
                                {unassigned.map(scan => (
                                    <div key={scan.id} className="group relative w-24 rounded overflow-hidden cursor-pointer"
                                        style={{ background: 'var(--glass-bg-tertiary)', border: '1px solid var(--glass-border)' }}
                                        onClick={() => handleScanClick(scan)}>
                                        <div className="aspect-video flex items-center justify-center relative">
                                            {scan.thumbnail ? <img src={scan.thumbnail} alt="" className="w-full h-full object-cover" /> :
                                                <svg className="w-6 h-6" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                                <button onClick={e => { e.stopPropagation(); dialogState.openScanReassign(scan); }} className="p-1.5 rounded bg-purple-600 text-white">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="px-1.5 py-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>{scan.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Photos Gallery */}
                {images.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                                Photos ({images.length})
                            </h3>
                            <button onClick={dialogState.openImageUpload} className="btn-secondary btn-sm">+ Add Photos</button>
                        </div>
                        <div className="glass-panel p-4">
                            <div className="grid grid-cols-6 gap-2">
                                {images.slice(0, 12).map((img, i) => (
                                    <div key={img.id} className="aspect-square rounded overflow-hidden cursor-pointer relative group"
                                        onClick={() => dialogState.openImageLightbox(images, i)}>
                                        <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                                        {i === 11 && images.length > 12 && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold">
                                                +{images.length - 12}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <StrakeManagementDialog
                isOpen={dialogState.dialogs.strakeManagement}
                onClose={dialogState.closeStrakeManagement}
                vesselName={vessel?.name || ''}
                strakes={strakes}
                scans={scans}
                onCreateStrake={async (data) => { if (vesselId) await createStrake.mutateAsync({ vesselId, data }); }}
                onUpdateStrake={async (id, updates) => { if (vesselId) await updateStrake.mutateAsync({ strakeId: id, vesselId, updates }); }}
                onDeleteStrake={async (id) => { if (vesselId) await deleteStrake.mutateAsync({ strakeId: id, vesselId }); }}
            />
            <ImageUploadDialog
                isOpen={dialogState.dialogs.imageUpload}
                onClose={dialogState.closeImageUpload}
                vesselName={vessel?.name || ''}
                onUpload={async (files) => { if (vesselId) await uploadImages.mutateAsync({ vesselId, files }); }}
            />
            {dialogState.dialogs.drawingUpload && (
                <DrawingUploadDialog
                    isOpen={true}
                    onClose={dialogState.closeDrawingUpload}
                    drawingType={dialogState.dialogs.drawingUpload}
                    vesselName={vessel?.name || ''}
                    onUpload={async (file) => { if (vesselId) await uploadDrawing.mutateAsync({ vesselId, drawingType: dialogState.dialogs.drawingUpload!, file }); }}
                />
            )}
            {dialogState.dialogs.drawingAnnotation && (vessel?.location_drawing || vessel?.ga_drawing) && (
                <DrawingAnnotationDialog
                    isOpen={true}
                    onClose={dialogState.closeDrawingAnnotation}
                    drawingType={dialogState.dialogs.drawingAnnotation}
                    vesselName={vessel?.name || ''}
                    drawing={(dialogState.dialogs.drawingAnnotation === 'location' ? vessel?.location_drawing : vessel?.ga_drawing)!}
                    onSave={async (annotations, comment) => { if (vesselId) await updateAnnotations.mutateAsync({ vesselId, drawingType: dialogState.dialogs.drawingAnnotation!, annotations, comment }); }}
                />
            )}
            {dialogState.dialogs.scanReassign && (
                <ScanReassignDialog
                    isOpen={true}
                    onClose={dialogState.closeScanReassign}
                    scan={dialogState.dialogs.scanReassign}
                    strakes={strakes}
                    onReassign={handleReassignScan}
                />
            )}
            {dialogState.dialogs.imageLightbox && (
                <ImageLightbox
                    isOpen={true}
                    onClose={dialogState.closeImageLightbox}
                    images={dialogState.dialogs.imageLightbox.images}
                    initialIndex={dialogState.dialogs.imageLightbox.initialIndex}
                />
            )}
        </div>
    );
}
