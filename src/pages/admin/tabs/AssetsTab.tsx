/**
 * AssetsTab - Asset management and transfer for admin dashboard
 *
 * Features:
 * - Table view of all assets across organizations
 * - Select multiple assets for bulk operations
 * - Transfer assets between organizations
 * - Organization summary statistics
 */

import { useState, useMemo } from 'react';
import { useAdminAssets } from '../../../hooks/queries/useAdminAssets';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import { SectionSpinner, EmptyState } from '../../../components/ui';
import { TransferAssetModal } from '../modals';
import type { AdminAsset } from '../../../types/admin';
import type { Organization } from '../../../types/database.types';

/**
 * Simple badge component for organization names
 */
function StatusBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {children}
        </span>
    );
}

/**
 * Checkbox component
 */
interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
}

function Checkbox({ checked, onChange, label }: CheckboxProps) {
    return (
        <label className="flex items-center cursor-pointer">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500 focus:ring-2"
            />
            {label && <span className="ml-2 text-sm text-white">{label}</span>}
        </label>
    );
}

/**
 * Asset table row component
 */
interface AssetRowProps {
    asset: AdminAsset;
    organization: Organization | undefined;
    isSelected: boolean;
    onSelect: (selected: boolean) => void;
    onTransfer: () => void;
}

function AssetRow({ asset, organization, isSelected, onSelect, onTransfer }: AssetRowProps) {
    const vesselCount = asset.vessels?.length || 0;
    const createdDate = new Date(asset.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <tr
            style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            {/* Checkbox */}
            <td style={{ padding: '16px 24px' }}>
                <Checkbox checked={isSelected} onChange={onSelect} />
            </td>

            {/* Asset Name + ID */}
            <td style={{ padding: '16px 24px' }}>
                <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {asset.name}
                    </p>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', fontFamily: 'monospace' }}>
                        {asset.id.slice(0, 8)}...
                    </p>
                </div>
            </td>

            {/* Organization */}
            <td style={{ padding: '16px 24px' }}>
                <StatusBadge>{organization?.name || 'Unknown'}</StatusBadge>
            </td>

            {/* Vessels count */}
            <td style={{ padding: '16px 24px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{vesselCount}</span>
            </td>

            {/* Created date */}
            <td style={{ padding: '16px 24px' }}>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>{createdDate}</span>
            </td>

            {/* Actions */}
            <td style={{ padding: '16px 24px' }}>
                <button
                    onClick={onTransfer}
                    className="glass-badge badge-purple"
                    style={{ cursor: 'pointer', padding: '4px 12px' }}
                >
                    Transfer
                </button>
            </td>
        </tr>
    );
}

/**
 * Organization summary card
 */
interface OrgSummaryCardProps {
    org: Organization;
    assetCount: number;
}

function OrgSummaryCard({ org, assetCount }: OrgSummaryCardProps) {
    return (
        <div className="glass-card" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                {org.name}
            </h4>
            <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {assetCount}
                <span style={{ fontSize: '14px', fontWeight: 400, color: 'rgba(255, 255, 255, 0.5)', marginLeft: '8px' }}>
                    assets
                </span>
            </p>
        </div>
    );
}

export default function AssetsTab() {
    const { data: assets = [], isLoading, error } = useAdminAssets();
    const { data: organizations = [] } = useOrganizations();
    // Mutations - will be used when transfer modals are implemented
    // const transferAsset = useTransferAsset();
    // const bulkTransferAssets = useBulkTransferAssets();

    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferringAsset, setTransferringAsset] = useState<AdminAsset | null>(null);
    const [bulkTransferOpen, setBulkTransferOpen] = useState(false);

    // Get organization by ID helper
    const getOrganization = (orgId: string): Organization | undefined => {
        return organizations.find((org) => org.id === orgId);
    };

    // Calculate asset counts per organization
    const orgAssetCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        assets.forEach((asset: AdminAsset) => {
            const orgId = asset.organization_id;
            counts[orgId] = (counts[orgId] || 0) + 1;
        });
        return counts;
    }, [assets]);

    // Check if all assets are selected
    const allSelected = assets.length > 0 && selectedAssetIds.length === assets.length;

    // Handle select all toggle
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedAssetIds(assets.map((asset: AdminAsset) => asset.id));
        } else {
            setSelectedAssetIds([]);
        }
    };

    // Handle individual checkbox toggle
    const handleSelectAsset = (assetId: string, selected: boolean) => {
        if (selected) {
            setSelectedAssetIds([...selectedAssetIds, assetId]);
        } else {
            setSelectedAssetIds(selectedAssetIds.filter((id) => id !== assetId));
        }
    };

    // Handle transfer click
    const handleTransferClick = (asset: AdminAsset) => {
        setTransferringAsset(asset);
        setTransferModalOpen(true);
    };

    // Handle bulk transfer click
    const handleBulkTransferClick = () => {
        if (selectedAssetIds.length === 0) return;
        setBulkTransferOpen(true);
    };

    if (isLoading) {
        return <SectionSpinner message="Loading assets..." />;
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-400">Failed to load assets</p>
                <p className="text-sm text-white/50 mt-2">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Asset Management
                    </h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '4px' }}>
                        {assets.length} total assets across all organizations
                    </p>
                </div>
                <button
                    onClick={handleBulkTransferClick}
                    disabled={selectedAssetIds.length === 0}
                    className="btn btn-primary"
                    style={{ opacity: selectedAssetIds.length === 0 ? 0.5 : 1 }}
                >
                    Bulk Transfer ({selectedAssetIds.length})
                </button>
            </div>

            {/* Assets table */}
            {assets.length === 0 ? (
                <EmptyState
                    title="No Assets"
                    message="No assets found in the system"
                />
            ) : (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                <tr>
                                    <th style={{ padding: '12px 24px', textAlign: 'left' }}>
                                        <Checkbox
                                            checked={allSelected}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Asset Name / ID
                                    </th>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Organization
                                    </th>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Vessels
                                    </th>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Created
                                    </th>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {assets.map((asset: AdminAsset) => (
                                    <AssetRow
                                        key={asset.id}
                                        asset={asset}
                                        organization={getOrganization(asset.organization_id)}
                                        isSelected={selectedAssetIds.includes(asset.id)}
                                        onSelect={(selected) => handleSelectAsset(asset.id, selected)}
                                        onTransfer={() => handleTransferClick(asset)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Organization summary cards */}
            {organizations.length > 0 && (
                <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                        Assets by Organization
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {organizations.map((org) => (
                            <OrgSummaryCard
                                key={org.id}
                                org={org}
                                assetCount={orgAssetCounts[org.id] || 0}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Single Asset Transfer Modal */}
            <TransferAssetModal
                isOpen={transferModalOpen && !!transferringAsset}
                onClose={() => {
                    setTransferModalOpen(false);
                    setTransferringAsset(null);
                }}
                asset={transferringAsset}
                onSuccess={() => {
                    setTransferModalOpen(false);
                    setTransferringAsset(null);
                    setSelectedAssetIds([]);
                }}
            />

            {/* Bulk Transfer Modal */}
            <TransferAssetModal
                isOpen={bulkTransferOpen}
                onClose={() => setBulkTransferOpen(false)}
                assetIds={selectedAssetIds}
                onSuccess={() => {
                    setBulkTransferOpen(false);
                    setSelectedAssetIds([]);
                }}
            />
        </div>
    );
}
