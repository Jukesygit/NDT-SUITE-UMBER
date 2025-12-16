/**
 * VesselOverviewPage - Shows vessel details and inspection history
 * Navigation: DataHub -> Asset -> Vessel Overview -> Inspection
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createModernHeader } from '../../components/modern-header.js';
import { SectionSpinner } from '../../components/ui';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';
import { assetService } from '../../services/asset-service.js';
import { useVesselInspections, type Inspection, inspectionKeys } from '../../hooks/queries/useDataHub';
import { useCreateInspection } from '../../hooks/mutations/useInspectionMutations';
import CreateInspectionDialog from './components/CreateInspectionDialog';

interface Scan {
    id: string;
    name: string;
    vessel_id: string;
    tool_type: 'pec' | 'cscan' | '3dview';
    thumbnail_url?: string;
    created_at: string;
    updated_at: string;
}

interface Vessel {
    id: string;
    name: string;
    asset_id: string;
    model_3d_url: string | null;
    created_at: string;
    updated_at: string;
}

interface Asset {
    id: string;
    name: string;
    organization_id: string;
}

export default function VesselOverviewPage() {
    const { assetId, vesselId } = useParams<{ assetId: string; vesselId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    // Fetch vessel details
    const {
        data: vessel,
        isLoading: vesselLoading,
        error: vesselError
    } = useQuery({
        queryKey: ['vessel', vesselId],
        queryFn: async (): Promise<Vessel | null> => {
            if (!vesselId) return null;
            return await assetService.getVessel(vesselId);
        },
        enabled: !!vesselId,
    });

    // Fetch parent asset for breadcrumb
    const {
        data: asset,
        isLoading: assetLoading
    } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: async (): Promise<Asset | null> => {
            if (!assetId) return null;
            return await assetService.getAsset(assetId);
        },
        enabled: !!assetId,
    });

    // Fetch inspections
    const {
        data: inspections = [],
        isLoading: inspectionsLoading
    } = useVesselInspections(vesselId || null);

    // Fetch scans (for legacy display / stats)
    const {
        data: scans = [],
    } = useQuery({
        queryKey: ['scans', vesselId],
        queryFn: async (): Promise<Scan[]> => {
            if (!vesselId) return [];
            return await assetService.getScans(vesselId);
        },
        enabled: !!vesselId,
    });

    // Create inspection mutation
    const createInspection = useCreateInspection();

    // Initialize the modern header
    useEffect(() => {
        const container = document.getElementById('vessel-overview-header');
        if (container && container.children.length === 0) {
            const header = createModernHeader(
                vessel?.name || 'Vessel Overview',
                'View vessel details and inspection history',
                {
                    showParticles: true,
                    particleCount: 20,
                    gradientColors: ['#34d399', '#60a5fa'],
                    height: '80px',
                    showLogo: false
                }
            );
            container.appendChild(header);
        }
    }, [vessel?.name]);

    // Prefetch likely navigation data when component mounts
    useEffect(() => {
        if (vesselId) {
            // Prefetch strakes (likely needed for inspection page)
            queryClient.prefetchQuery({
                queryKey: inspectionKeys.strakes(vesselId),
                queryFn: () => assetService.getStrakes(vesselId),
                staleTime: 2 * 60 * 1000,
            });

            // Prefetch vessel images (likely needed for inspection page)
            queryClient.prefetchQuery({
                queryKey: inspectionKeys.images(vesselId),
                queryFn: () => assetService.getVesselImages(vesselId),
                staleTime: 2 * 60 * 1000,
            });
        }
    }, [vesselId, queryClient]);

    // Handlers
    const handleBackToAsset = () => {
        navigate('/');
    };

    const handleOpenCreateDialog = () => {
        setShowCreateDialog(true);
    };

    const handleCreateInspection = async (data: {
        name: string;
        status: 'planned' | 'in_progress' | 'completed' | 'on_hold';
        inspection_date?: string;
        notes?: string;
    }) => {
        if (!vesselId) return;
        const inspection = await createInspection.mutateAsync({ vesselId, data });
        // Navigate to the new inspection
        navigate(`/inspection/${assetId}/${vesselId}/${inspection.id}`);
    };

    const handleViewInspection = (inspection: Inspection) => {
        // Navigate to inspection page with inspection ID
        navigate(`/inspection/${assetId}/${vesselId}/${inspection.id}`);
    };

    const handleQuickInspection = () => {
        // Quick start: navigate to inspection page without pre-created inspection
        navigate(`/inspection/${assetId}/${vesselId}`);
    };

    // Loading state
    if (vesselLoading || assetLoading) {
        return (
            <div className="h-full flex flex-col">
                <div id="vessel-overview-header" style={{ flexShrink: 0 }}></div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <MatrixLogoRacer size={160} duration={4} />
                    <div className="text-gray-400 animate-pulse">Loading vessel...</div>
                </div>
            </div>
        );
    }

    // Error state
    if (vesselError) {
        return (
            <div className="h-full flex flex-col">
                <div id="vessel-overview-header" style={{ flexShrink: 0 }}></div>
                <div className="flex-1 p-6">
                    <ErrorDisplay error={vesselError} title="Failed to load vessel" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="vessel-overview-header" style={{ flexShrink: 0 }}></div>

            {/* Breadcrumb */}
            <div
                className="flex items-center text-sm px-6 py-3"
                style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}
            >
                <button
                    onClick={handleBackToAsset}
                    className="hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                >
                    Data Hub
                </button>
                <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{asset?.name}</span>
                <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                <span style={{ color: 'var(--text-primary)' }}>{vessel?.name}</span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {/* Vessel Info Card */}
                <div className="glass-card mb-6" style={{ padding: '24px' }}>
                    <div className="flex items-start gap-6">
                        {/* 3D Preview or Placeholder */}
                        <div
                            style={{
                                width: '120px',
                                height: '120px',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {vessel?.model_3d_url ? (
                                <div style={{ color: 'var(--color-success-light)', textAlign: 'center' }}>
                                    <CubeIcon size={48} />
                                    <div style={{ fontSize: '10px', marginTop: '4px' }}>3D Model</div>
                                </div>
                            ) : (
                                <div style={{ color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                                    <CubeIcon size={48} />
                                    <div style={{ fontSize: '10px', marginTop: '4px' }}>No 3D</div>
                                </div>
                            )}
                        </div>

                        {/* Vessel Details */}
                        <div className="flex-1">
                            <h2 style={{
                                fontSize: '24px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '8px',
                            }}>
                                {vessel?.name}
                            </h2>
                            <div style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.5)',
                                marginBottom: '16px',
                            }}>
                                Part of <strong style={{ color: 'var(--text-primary)' }}>{asset?.name}</strong>
                            </div>

                            {/* Stats */}
                            <div className="flex gap-6">
                                <div>
                                    <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {inspections.length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        Inspections
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {scans.length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        Total Scans
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleOpenCreateDialog}
                                className="btn-primary"
                            >
                                <PlusIcon />
                                New Inspection
                            </button>
                            <button
                                onClick={handleQuickInspection}
                                className="btn-secondary btn-sm"
                            >
                                Quick Start
                            </button>
                        </div>
                    </div>
                </div>

                {/* Inspections List */}
                <div>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '16px',
                    }}>
                        Inspections
                    </h3>

                    {inspectionsLoading ? (
                        <SectionSpinner message="Loading inspections..." />
                    ) : inspections.length === 0 ? (
                        <div
                            className="glass-card"
                            style={{
                                padding: '48px',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ color: 'rgba(255, 255, 255, 0.3)', marginBottom: '16px' }}>
                                <ClipboardIcon size={48} />
                            </div>
                            <h4 style={{
                                fontSize: '16px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '8px',
                            }}>
                                No inspections yet
                            </h4>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.5)',
                                marginBottom: '16px',
                            }}>
                                Create your first inspection to start recording scan data.
                            </p>
                            <button
                                onClick={handleOpenCreateDialog}
                                className="btn-success"
                            >
                                Create First Inspection
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {inspections.map((inspection) => (
                                <div
                                    key={inspection.id}
                                    onClick={() => handleViewInspection(inspection)}
                                    className="glass-card list-item-hover cursor-pointer"
                                    style={{ padding: '20px' }}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <h4 style={{
                                            fontSize: '16px',
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                        }}>
                                            {inspection.name}
                                        </h4>
                                        <StatusBadge status={inspection.status} />
                                    </div>

                                    {inspection.inspection_date && (
                                        <div className="flex items-center gap-2 mb-2">
                                            <CalendarIcon />
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                {new Date(inspection.inspection_date).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}

                                    {inspection.notes && (
                                        <p style={{
                                            fontSize: '13px',
                                            color: 'var(--text-dim)',
                                            marginTop: '8px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                        }}>
                                            {inspection.notes}
                                        </p>
                                    )}

                                    <div style={{
                                        fontSize: '11px',
                                        color: 'var(--text-dim)',
                                        marginTop: '12px',
                                        paddingTop: '12px',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                    }}>
                                        Created {new Date(inspection.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Inspection Dialog */}
            <CreateInspectionDialog
                isOpen={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
                vesselName={vessel?.name || ''}
                onCreateInspection={handleCreateInspection}
            />
        </div>
    );
}

// ============================================================================
// Helper Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
    const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
        planned: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)', label: 'Planned' },
        in_progress: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'In Progress' },
        completed: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', label: 'Completed' },
        on_hold: { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', label: 'On Hold' },
    };

    const config = statusConfig[status] || statusConfig.planned;

    return (
        <span
            style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: config.bg,
                color: config.color,
                fontWeight: 500,
            }}
        >
            {config.label}
        </span>
    );
}

// ============================================================================
// Icons
// ============================================================================

function CubeIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
    );
}

function ClipboardIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    );
}

// ScanIcon removed - unused
