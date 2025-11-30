/**
 * CreateShareModal - Multi-step wizard for sharing assets with other organizations
 *
 * Features:
 * - Wizard-style multi-step flow
 * - Optional preselected asset
 * - Share entire asset or drill down to vessel/scan
 * - Organization and permission selection
 * - Summary before confirmation
 */

import { useState, useEffect, useMemo } from 'react';
import { Modal, FormSelect, ButtonSpinner } from '../../../components/ui';
import { useAdminAssets } from '../../../hooks/queries/useAdminAssets';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import { useCreateShare } from '../../../hooks/mutations/useShareMutations';
import type { AdminAsset, SharePermission } from '../../../types/admin';

interface CreateShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedAsset?: AdminAsset;
    onSuccess?: () => void;
}

type ShareLevel = 'asset' | 'vessel' | 'scan';
type Step = 1 | 2 | 3 | 4 | 5;

export default function CreateShareModal({
    isOpen,
    onClose,
    preselectedAsset,
    onSuccess,
}: CreateShareModalProps) {
    const { data: assets = [], isLoading: isLoadingAssets } = useAdminAssets();
    const { data: organizations = [], isLoading: isLoadingOrgs } = useOrganizations();
    const createShare = useCreateShare();

    // State
    const [step, setStep] = useState<Step>(preselectedAsset ? 2 : 1);
    const [selectedAssetId, setSelectedAssetId] = useState(preselectedAsset?.id || '');
    const [shareLevel, setShareLevel] = useState<ShareLevel>('asset');
    const [selectedVesselId, setSelectedVesselId] = useState('');
    const [selectedScanId, setSelectedScanId] = useState('');
    const [targetOrgId, setTargetOrgId] = useState('');
    const [permission, setPermission] = useState<SharePermission>('view');
    const [error, setError] = useState('');

    // Get selected asset
    const selectedAsset = useMemo(() => {
        if (preselectedAsset && selectedAssetId === preselectedAsset.id) {
            return preselectedAsset;
        }
        return assets.find((a: AdminAsset) => a.id === selectedAssetId);
    }, [selectedAssetId, assets, preselectedAsset]);

    // Get vessels for selected asset
    const vessels = selectedAsset?.vessels || [];

    // Get scans for selected vessel
    const scans = useMemo(() => {
        if (!selectedVesselId) return [];
        const vessel = vessels.find((v: any) => v.id === selectedVesselId);
        return vessel?.scans || [];
    }, [selectedVesselId, vessels]);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setStep(preselectedAsset ? 2 : 1);
            setSelectedAssetId(preselectedAsset?.id || '');
            setShareLevel('asset');
            setSelectedVesselId('');
            setSelectedScanId('');
            setTargetOrgId('');
            setPermission('view');
            setError('');
        }
    }, [isOpen, preselectedAsset]);

    // Handle step navigation
    const handleNext = () => {
        setError('');

        if (step === 1 && !selectedAssetId) {
            setError('Please select an asset');
            return;
        }
        if (step === 2 && !shareLevel) {
            setError('Please select a share level');
            return;
        }
        if (step === 3) {
            if (shareLevel === 'vessel' && !selectedVesselId) {
                setError('Please select a vessel');
                return;
            }
            if (shareLevel === 'scan' && (!selectedVesselId || !selectedScanId)) {
                setError('Please select a vessel and scan');
                return;
            }
            // Skip to step 4 if sharing entire asset
            if (shareLevel === 'asset') {
                setStep(4);
                return;
            }
        }
        if (step === 4 && !targetOrgId) {
            setError('Please select an organization');
            return;
        }
        if (step === 5 && !permission) {
            setError('Please select a permission level');
            return;
        }

        setStep((s) => Math.min(5, s + 1) as Step);
    };

    const handleBack = () => {
        setError('');
        // Skip step 3 when going back if sharing entire asset
        if (step === 4 && shareLevel === 'asset') {
            setStep(2);
        } else {
            setStep((s) => Math.max(1, s - 1) as Step);
        }
    };

    // Handle form submission
    const handleSubmit = async () => {
        setError('');

        if (!selectedAssetId || !targetOrgId || !permission) {
            setError('Please complete all required fields');
            return;
        }

        try {
            const result = await createShare.mutateAsync({
                assetId: selectedAssetId,
                vesselId: shareLevel === 'vessel' || shareLevel === 'scan' ? selectedVesselId : undefined,
                scanId: shareLevel === 'scan' ? selectedScanId : undefined,
                sharedWithOrganizationId: targetOrgId,
                permission,
            });

            if (result.success) {
                onSuccess?.();
                onClose();
            } else {
                setError(result.error || 'Failed to create share');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    const isPending = createShare.isPending;

    // Get step title
    const getStepTitle = () => {
        switch (step) {
            case 1: return 'Select Asset';
            case 2: return 'Share Level';
            case 3: return shareLevel === 'vessel' ? 'Select Vessel' : 'Select Scan';
            case 4: return 'Select Organization';
            case 5: return 'Review & Confirm';
            default: return '';
        }
    };

    // Get target org name
    const targetOrgName = organizations.find(org => org.id === targetOrgId)?.name || '';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Share Asset - ${getStepTitle()}`}
            size="large"
            closeOnBackdropClick={!isPending}
            closeOnEscape={!isPending}
        >
            <div className="space-y-6">
                {/* Progress indicator */}
                <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => {
                        // Skip step 3 in indicator if sharing entire asset
                        if (s === 3 && shareLevel === 'asset') return null;

                        return (
                            <div key={s} className="flex items-center flex-1">
                                <div
                                    className={`h-2 rounded-full flex-1 ${
                                        s <= step ? 'bg-purple-500' : 'bg-slate-700'
                                    }`}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Step 1: Select Asset */}
                {step === 1 && (
                    <div className="space-y-4">
                        <FormSelect
                            label="Asset"
                            required
                            value={selectedAssetId}
                            onChange={(e) => setSelectedAssetId(e.target.value)}
                            disabled={isPending || isLoadingAssets}
                            placeholder="Select an asset to share..."
                            options={assets.map((asset: AdminAsset) => ({
                                value: asset.id,
                                label: asset.name || `Asset ${asset.id.slice(0, 8)}`,
                            }))}
                        />
                    </div>
                )}

                {/* Step 2: Share Level */}
                {step === 2 && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-3">
                                What would you like to share?
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                    <input
                                        type="radio"
                                        name="shareLevel"
                                        value="asset"
                                        checked={shareLevel === 'asset'}
                                        onChange={(e) => setShareLevel(e.target.value as ShareLevel)}
                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-medium text-white">Entire Asset</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Share all vessels and scans within this asset
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                    <input
                                        type="radio"
                                        name="shareLevel"
                                        value="vessel"
                                        checked={shareLevel === 'vessel'}
                                        onChange={(e) => setShareLevel(e.target.value as ShareLevel)}
                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-medium text-white">Specific Vessel</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Share only a specific vessel and all its scans
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                    <input
                                        type="radio"
                                        name="shareLevel"
                                        value="scan"
                                        checked={shareLevel === 'scan'}
                                        onChange={(e) => setShareLevel(e.target.value as ShareLevel)}
                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-medium text-white">Specific Scan</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Share only a specific scan
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Select Vessel/Scan */}
                {step === 3 && (
                    <div className="space-y-4">
                        {(shareLevel === 'vessel' || shareLevel === 'scan') && (
                            <FormSelect
                                label="Vessel"
                                required
                                value={selectedVesselId}
                                onChange={(e) => {
                                    setSelectedVesselId(e.target.value);
                                    setSelectedScanId(''); // Reset scan selection
                                }}
                                disabled={isPending}
                                placeholder="Select a vessel..."
                                options={vessels.map((vessel: any) => ({
                                    value: vessel.id,
                                    label: vessel.name || `Vessel ${vessel.id.slice(0, 8)}`,
                                }))}
                            />
                        )}

                        {shareLevel === 'scan' && selectedVesselId && (
                            <FormSelect
                                label="Scan"
                                required
                                value={selectedScanId}
                                onChange={(e) => setSelectedScanId(e.target.value)}
                                disabled={isPending}
                                placeholder="Select a scan..."
                                options={scans.map((scan: any) => ({
                                    value: scan.id,
                                    label: scan.name || `Scan ${scan.id.slice(0, 8)}`,
                                }))}
                            />
                        )}
                    </div>
                )}

                {/* Step 4: Select Organization */}
                {step === 4 && (
                    <div className="space-y-4">
                        <FormSelect
                            label="Share with Organization"
                            required
                            value={targetOrgId}
                            onChange={(e) => setTargetOrgId(e.target.value)}
                            disabled={isPending || isLoadingOrgs}
                            placeholder="Select organization..."
                            options={organizations
                                .filter(org => org.id !== selectedAsset?.organization_id)
                                .map(org => ({
                                    value: org.id,
                                    label: org.name,
                                }))}
                        />

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-3">
                                Permission Level
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                    <input
                                        type="radio"
                                        name="permission"
                                        value="view"
                                        checked={permission === 'view'}
                                        onChange={(e) => setPermission(e.target.value as SharePermission)}
                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-medium text-white">View Only</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Can view data but cannot make changes
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                    <input
                                        type="radio"
                                        name="permission"
                                        value="edit"
                                        checked={permission === 'edit'}
                                        onChange={(e) => setPermission(e.target.value as SharePermission)}
                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-medium text-white">Edit Access</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Can view and modify data
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 5: Summary */}
                {step === 5 && (
                    <div className="space-y-4">
                        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                            <div>
                                <p className="text-xs text-white/50">Asset</p>
                                <p className="text-sm text-white font-medium">
                                    {selectedAsset?.name || 'Unknown'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-white/50">Sharing</p>
                                <p className="text-sm text-white font-medium capitalize">{shareLevel}</p>
                            </div>

                            {shareLevel === 'vessel' && selectedVesselId && (
                                <div>
                                    <p className="text-xs text-white/50">Vessel</p>
                                    <p className="text-sm text-white font-medium">
                                        {vessels.find((v: any) => v.id === selectedVesselId)?.name || 'Unknown'}
                                    </p>
                                </div>
                            )}

                            {shareLevel === 'scan' && selectedScanId && (
                                <div>
                                    <p className="text-xs text-white/50">Scan</p>
                                    <p className="text-sm text-white font-medium">
                                        {scans.find((s: any) => s.id === selectedScanId)?.name || 'Unknown'}
                                    </p>
                                </div>
                            )}

                            <div>
                                <p className="text-xs text-white/50">Share with</p>
                                <p className="text-sm text-white font-medium">{targetOrgName}</p>
                            </div>

                            <div>
                                <p className="text-xs text-white/50">Permission</p>
                                <p className="text-sm text-white font-medium capitalize">{permission}</p>
                            </div>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                            <p className="text-xs text-blue-200/80">
                                The selected organization will be able to {permission === 'view' ? 'view' : 'view and edit'} the shared data.
                                You can modify or remove this share at any time.
                            </p>
                        </div>
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-2">
                    <button
                        type="button"
                        onClick={handleBack}
                        disabled={isPending || step === 1 || (step === 4 && shareLevel === 'asset' && !preselectedAsset)}
                        className="px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Back
                    </button>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>

                        {step < 5 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isPending && <ButtonSpinner />}
                                Create Share
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
