/**
 * DataHubPage - Modern React implementation of the Data Hub
 * Navigation: Org Tabs -> Assets -> Vessels -> Vessel Overview -> Inspection
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createModernHeader } from '../../components/modern-header.js';
import { SectionSpinner } from '../../components/ui';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';
import { useDataHubOrganizations, useAssetsByOrg, useVesselsByAsset } from '../../hooks/queries';
import type { AssetWithCounts, VesselWithCounts } from '../../hooks/queries/useDataHub';
import CreateAssetDialog from './components/CreateAssetDialog';
import CreateVesselDialog from './components/CreateVesselDialog';

// View states for navigation
type ViewState = 'assets' | 'vessels';

interface NavigationState {
    view: ViewState;
    selectedOrgId: string | null;
    selectedAssetId: string | null;
    selectedAssetName: string | null;
}

export default function DataHubPage() {
    const navigate = useNavigate();

    // Navigation state
    const [navState, setNavState] = useState<NavigationState>({
        view: 'assets',
        selectedOrgId: null,
        selectedAssetId: null,
        selectedAssetName: null,
    });

    // Dialog state
    const [showCreateAssetDialog, setShowCreateAssetDialog] = useState(false);
    const [showCreateVesselDialog, setShowCreateVesselDialog] = useState(false);

    // Fetch organizations for tabs
    const {
        data: organizations = [],
        isLoading: orgsLoading,
        error: orgsError
    } = useDataHubOrganizations();

    // Fetch assets for selected org
    const {
        data: assets = [],
        isLoading: assetsLoading
    } = useAssetsByOrg(navState.selectedOrgId);

    // Fetch vessels for selected asset
    const {
        data: vessels = [],
        isLoading: vesselsLoading
    } = useVesselsByAsset(navState.selectedAssetId);

    // Auto-select first org when orgs load
    useEffect(() => {
        if (organizations.length > 0 && !navState.selectedOrgId) {
            setNavState(prev => ({
                ...prev,
                selectedOrgId: organizations[0].id
            }));
        }
    }, [organizations, navState.selectedOrgId]);

    // Initialize the modern header
    useEffect(() => {
        const container = document.getElementById('data-hub-header');
        if (container && container.children.length === 0) {
            const header = createModernHeader(
                'NDT Data Hub',
                'Organize and manage your inspection scans by asset and vessel',
                {
                    showParticles: true,
                    particleCount: 25,
                    gradientColors: ['#60a5fa', '#34d399'],
                    height: '100px',
                    showLogo: false
                }
            );
            container.appendChild(header);
        }
    }, []);

    // Handlers
    const handleOrgSelect = (orgId: string) => {
        setNavState({
            view: 'assets',
            selectedOrgId: orgId,
            selectedAssetId: null,
            selectedAssetName: null,
        });
    };

    const handleAssetClick = (asset: AssetWithCounts) => {
        setNavState(prev => ({
            ...prev,
            view: 'vessels',
            selectedAssetId: asset.id,
            selectedAssetName: asset.name,
        }));
    };

    const handleBackToAssets = () => {
        setNavState(prev => ({
            ...prev,
            view: 'assets',
            selectedAssetId: null,
            selectedAssetName: null,
        }));
    };

    const handleVesselClick = (vessel: VesselWithCounts) => {
        // Navigate to vessel overview page
        navigate(`/vessel/${navState.selectedAssetId}/${vessel.id}`);
    };

    // Loading state
    if (orgsLoading) {
        return (
            <div className="h-full flex flex-col">
                <div id="data-hub-header" style={{ flexShrink: 0 }}></div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <MatrixLogoRacer size={160} duration={4} />
                    <div className="text-gray-400 animate-pulse">Loading organizations...</div>
                </div>
            </div>
        );
    }

    // Error state
    if (orgsError) {
        return (
            <div className="h-full flex flex-col">
                <div id="data-hub-header" style={{ flexShrink: 0 }}></div>
                <div className="flex-1 p-6">
                    <ErrorDisplay error={orgsError} title="Failed to load organizations" />
                </div>
            </div>
        );
    }

    // Get current org name for display
    const currentOrg = organizations.find(org => org.id === navState.selectedOrgId);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="data-hub-header" style={{ flexShrink: 0 }}></div>

            {/* Organization Tabs */}
            <div
                className="glass-panel"
                style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 0,
                    flexShrink: 0,
                    padding: 0
                }}
            >
                <div className="flex px-6 overflow-x-auto">
                    {organizations.map((org) => {
                        const isActive = navState.selectedOrgId === org.id;
                        return (
                            <button
                                key={org.id}
                                onClick={() => handleOrgSelect(org.id)}
                                className="tab-btn px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap"
                                style={{
                                    borderColor: isActive ? 'var(--accent-primary)' : 'transparent',
                                    color: isActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {org.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Breadcrumb (when in vessels view) */}
            {navState.view === 'vessels' && (
                <div
                    className="flex items-center text-sm px-6 py-3"
                    style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                >
                    <button
                        onClick={handleBackToAssets}
                        className="hover:underline"
                        style={{ color: 'var(--accent-primary)' }}
                    >
                        {currentOrg?.name || 'Assets'}
                    </button>
                    <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                    <span style={{ color: 'var(--text-primary)' }}>{navState.selectedAssetName}</span>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {navState.view === 'assets' ? (
                    // Assets Grid
                    <>
                        {/* Header with Create Button */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Assets
                            </h2>
                            <button
                                className="btn btn-primary flex items-center gap-2"
                                style={{ padding: '8px 14px', fontSize: '13px' }}
                                onClick={() => setShowCreateAssetDialog(true)}
                            >
                                <PlusIcon />
                                New Asset
                            </button>
                        </div>
                        {assetsLoading ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-4">
                                <SectionSpinner message="Loading assets..." />
                            </div>
                        ) : assets.length === 0 ? (
                            <EmptyState
                                title="No assets yet"
                                message="Create your first asset to get started."
                                icon={<BuildingIcon />}
                                onCreateClick={() => setShowCreateAssetDialog(true)}
                                createLabel="Create Asset"
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {assets.map((asset) => (
                                    <AssetCard
                                        key={asset.id}
                                        asset={asset}
                                        onClick={() => handleAssetClick(asset)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    // Vessels List
                    <>
                        {/* Header with Create Button */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Vessels
                            </h2>
                            <button
                                className="btn btn-primary flex items-center gap-2"
                                style={{ padding: '8px 14px', fontSize: '13px' }}
                                onClick={() => setShowCreateVesselDialog(true)}
                            >
                                <PlusIcon />
                                New Vessel
                            </button>
                        </div>
                        {vesselsLoading ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-4">
                                <SectionSpinner message="Loading vessels..." />
                            </div>
                        ) : vessels.length === 0 ? (
                            <EmptyState
                                title="No vessels yet"
                                message="Create your first vessel to start inspections."
                                icon={<CubeIcon />}
                                onCreateClick={() => setShowCreateVesselDialog(true)}
                                createLabel="Create Vessel"
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {vessels.map((vessel) => (
                                    <VesselCard
                                        key={vessel.id}
                                        vessel={vessel}
                                        onClick={() => handleVesselClick(vessel)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Create Asset Dialog */}
            {navState.selectedOrgId && (
                <CreateAssetDialog
                    isOpen={showCreateAssetDialog}
                    onClose={() => setShowCreateAssetDialog(false)}
                    organizationId={navState.selectedOrgId}
                />
            )}

            {/* Create Vessel Dialog */}
            {navState.selectedAssetId && navState.selectedAssetName && (
                <CreateVesselDialog
                    isOpen={showCreateVesselDialog}
                    onClose={() => setShowCreateVesselDialog(false)}
                    assetId={navState.selectedAssetId}
                    assetName={navState.selectedAssetName}
                />
            )}
        </div>
    );
}

// ============================================================================
// Sub-components
// ============================================================================

interface AssetCardProps {
    asset: AssetWithCounts;
    onClick: () => void;
}

function AssetCard({ asset, onClick }: AssetCardProps) {
    return (
        <div
            onClick={onClick}
            className="glass-card list-item-hover cursor-pointer"
            style={{ padding: '16px' }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <BuildingIcon />
                </div>
                <h3 style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                }}>
                    {asset.name}
                </h3>
            </div>
            <div style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex',
                gap: '16px',
            }}>
                <span>
                    <strong style={{ color: 'var(--text-primary)' }}>{asset.vesselCount}</strong>
                    {' '}vessel{asset.vesselCount !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}

interface VesselCardProps {
    vessel: VesselWithCounts;
    onClick: () => void;
}

function VesselCard({ vessel, onClick }: VesselCardProps) {
    return (
        <div
            onClick={onClick}
            className="glass-card list-item-hover cursor-pointer"
            style={{ padding: '16px' }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(52, 211, 153, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <CubeIcon />
                </div>
                <h3 style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                }}>
                    {vessel.name}
                </h3>
            </div>
            <div style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex',
                gap: '16px',
            }}>
                <span>
                    <strong style={{ color: 'var(--text-primary)' }}>{vessel.scanCount}</strong>
                    {' '}scan{vessel.scanCount !== 1 ? 's' : ''}
                </span>
                {vessel.model_3d_url && (
                    <span className="glass-badge badge-blue" style={{ fontSize: '10px', padding: '2px 8px' }}>
                        3D Model
                    </span>
                )}
            </div>
        </div>
    );
}

interface EmptyStateProps {
    title: string;
    message: string;
    icon: React.ReactNode;
    onCreateClick?: () => void;
    createLabel?: string;
}

function EmptyState({ title, message, icon, onCreateClick, createLabel }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
            <div style={{
                width: '64px',
                height: '64px',
                color: 'rgba(255, 255, 255, 0.3)',
                marginBottom: '16px',
            }}>
                {icon}
            </div>
            <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '8px',
            }}>
                {title}
            </h3>
            <p style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: onCreateClick ? '16px' : 0,
            }}>
                {message}
            </p>
            {onCreateClick && createLabel && (
                <button
                    className="btn btn-primary flex items-center gap-2"
                    style={{ padding: '10px 18px', fontSize: '14px' }}
                    onClick={onCreateClick}
                >
                    <PlusIcon />
                    {createLabel}
                </button>
            )}
        </div>
    );
}

// ============================================================================
// Icons
// ============================================================================

function PlusIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
    );
}

function BuildingIcon() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-primary-400)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
    );
}

function CubeIcon() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-success-light)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
    );
}
