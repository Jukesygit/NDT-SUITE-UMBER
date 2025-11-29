/**
 * VesselOverviewPage - Shows vessel details and inspection history
 * Navigation: DataHub -> Asset -> Vessel Overview -> Inspection
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createModernHeader } from '../../components/modern-header.js';
import { SectionSpinner } from '../../components/ui';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';
import { assetService } from '../../services/asset-service.js';

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

    // Fetch scans (inspection history)
    const {
        data: scans = [],
        isLoading: scansLoading
    } = useQuery({
        queryKey: ['scans', vesselId],
        queryFn: async (): Promise<Scan[]> => {
            if (!vesselId) return [];
            return await assetService.getScans(vesselId);
        },
        enabled: !!vesselId,
    });

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

    // Handlers
    const handleBackToAsset = () => {
        navigate('/');
    };

    const handleCreateInspection = () => {
        // Navigate to inspection page with "new" mode
        navigate(`/inspection/${assetId}/${vesselId}`);
    };

    const handleViewInspection = (scan: Scan) => {
        // Navigate to inspection page with scan context
        navigate(`/inspection/${assetId}/${vesselId}?scan=${scan.id}`);
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

    // Group scans by date for inspection history
    const scansByDate = scans.reduce((acc, scan) => {
        const date = new Date(scan.created_at).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(scan);
        return acc;
    }, {} as Record<string, Scan[]>);

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
                                        {scans.length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        Total Scans
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {Object.keys(scansByDate).length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        Inspection Days
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={handleCreateInspection}
                            className="btn btn-primary"
                            style={{ padding: '12px 24px', fontSize: '14px' }}
                        >
                            <PlusIcon />
                            <span style={{ marginLeft: '8px' }}>New Inspection</span>
                        </button>
                    </div>
                </div>

                {/* Inspection History */}
                <div>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '16px',
                    }}>
                        Inspection History
                    </h3>

                    {scansLoading ? (
                        <SectionSpinner message="Loading inspections..." />
                    ) : scans.length === 0 ? (
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
                                onClick={handleCreateInspection}
                                className="btn btn-success"
                                style={{ padding: '10px 20px' }}
                            >
                                Create First Inspection
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(scansByDate)
                                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                                .map(([date, dateScans]) => (
                                    <div key={date} className="glass-card" style={{ padding: '16px' }}>
                                        <div
                                            className="flex items-center justify-between mb-3"
                                            style={{
                                                paddingBottom: '12px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon />
                                                <span style={{
                                                    fontSize: '14px',
                                                    fontWeight: 500,
                                                    color: 'var(--text-primary)',
                                                }}>
                                                    {date}
                                                </span>
                                            </div>
                                            <span
                                                className="glass-badge"
                                                style={{ fontSize: '11px', padding: '4px 10px' }}
                                            >
                                                {dateScans.length} scan{dateScans.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {dateScans.map((scan) => (
                                                <div
                                                    key={scan.id}
                                                    onClick={() => handleViewInspection(scan)}
                                                    className="glass-panel list-item-hover cursor-pointer"
                                                    style={{ padding: '12px' }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '6px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: getScanTypeColor(scan.tool_type),
                                                            }}
                                                        >
                                                            <ScanIcon type={scan.tool_type} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div
                                                                style={{
                                                                    fontSize: '13px',
                                                                    fontWeight: 500,
                                                                    color: 'var(--text-primary)',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                {scan.name}
                                                            </div>
                                                            <div style={{
                                                                fontSize: '11px',
                                                                color: 'rgba(255, 255, 255, 0.4)',
                                                            }}>
                                                                {scan.tool_type.toUpperCase()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getScanTypeColor(type: string): string {
    switch (type) {
        case 'pec':
            return 'rgba(234, 179, 8, 0.15)';
        case 'cscan':
            return 'rgba(59, 130, 246, 0.15)';
        case '3dview':
            return 'rgba(168, 85, 247, 0.15)';
        default:
            return 'rgba(255, 255, 255, 0.1)';
    }
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

function ScanIcon({ type }: { type: string }) {
    const color = type === 'pec' ? 'rgba(234, 179, 8, 0.9)' :
                  type === 'cscan' ? 'rgba(59, 130, 246, 0.9)' :
                  'rgba(168, 85, 247, 0.9)';

    return (
        <svg width="14" height="14" fill="none" stroke={color} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    );
}
