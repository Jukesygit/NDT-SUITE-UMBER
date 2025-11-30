import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Loader2, FolderOpen, Ship, Layers, AlertCircle } from 'lucide-react';
import { CscanData } from './types';

// Import dataManager - using dynamic import to handle JS module
let dataManager: any = null;

interface Asset {
  id: string;
  name: string;
  vessels: Vessel[];
}

interface Vessel {
  id: string;
  name: string;
  strakes?: Strake[];
  scans?: HubScan[];
}

interface Strake {
  id: string;
  name: string;
  totalArea: number;
  requiredCoverage: number;
}

interface HubScan {
  id: string;
  name: string;
  data?: {
    fileName?: string;
  };
}

interface AssignStrakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: CscanData[];
  onAssignComplete?: (success: boolean, message: string) => void;
}

const AssignStrakeModal: React.FC<AssignStrakeModalProps> = ({
  isOpen,
  onClose,
  scans,
  onAssignComplete
}) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedVesselId, setSelectedVesselId] = useState<string>('');
  const [selectedStrakeId, setSelectedStrakeId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Initialize data manager and load assets
  useEffect(() => {
    const initDataManager = async () => {
      if (!isOpen) return;

      setIsInitializing(true);
      setError('');

      try {
        // Dynamic import of data-manager
        if (!dataManager) {
          const module = await import('../../data-manager.js');
          dataManager = module.default;
        }

        await dataManager.ensureInitialized();
        const loadedAssets = dataManager.getAssets();
        setAssets(loadedAssets);
      } catch (err) {
        console.error('Error initializing data manager:', err);
        setError('Failed to load assets. Please try again.');
      } finally {
        setIsInitializing(false);
      }
    };

    initDataManager();
  }, [isOpen]);

  // Get vessels for selected asset
  const vessels = React.useMemo(() => {
    if (!selectedAssetId) return [];
    const asset = assets.find(a => a.id === selectedAssetId);
    return asset?.vessels || [];
  }, [assets, selectedAssetId]);

  // Get strakes for selected vessel
  const strakes = React.useMemo(() => {
    if (!selectedAssetId || !selectedVesselId) return [];
    const asset = assets.find(a => a.id === selectedAssetId);
    const vessel = asset?.vessels.find(v => v.id === selectedVesselId);
    return vessel?.strakes || [];
  }, [assets, selectedAssetId, selectedVesselId]);

  // Get hub scans for selected vessel (to match against local files)
  const hubScans = React.useMemo(() => {
    if (!selectedAssetId || !selectedVesselId) return [];
    const vessel = dataManager?.getVessel(selectedAssetId, selectedVesselId);
    return vessel?.scans || [];
  }, [selectedAssetId, selectedVesselId]);

  // Handle asset selection change
  const handleAssetChange = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    setSelectedVesselId('');
    setSelectedStrakeId('');
  }, []);

  // Handle vessel selection change
  const handleVesselChange = useCallback((vesselId: string) => {
    setSelectedVesselId(vesselId);
    setSelectedStrakeId('');
  }, []);

  // Create new strake
  const handleCreateStrake = async () => {
    if (!selectedAssetId || !selectedVesselId) {
      alert('Please select an asset and vessel first');
      return;
    }

    const name = prompt('Enter strake name:');
    if (!name) return;

    const totalAreaStr = prompt('Enter total area (m²):', '0');
    const requiredCoverageStr = prompt('Enter required coverage (%):', '100');

    const totalArea = parseFloat(totalAreaStr || '0');
    const requiredCoverage = parseFloat(requiredCoverageStr || '100');

    try {
      const strake = await dataManager.createStrake(selectedAssetId, selectedVesselId, {
        name,
        totalArea,
        requiredCoverage
      });
      // Refresh assets to get updated strake list
      const loadedAssets = dataManager.getAssets();
      setAssets(loadedAssets);
      setSelectedStrakeId(strake.id);
    } catch (err) {
      console.error('Error creating strake:', err);
      setError('Failed to create strake');
    }
  };

  // Find matching hub scan for a local scan
  const findMatchingHubScan = (localScan: CscanData): HubScan | null => {
    const localFileName = localScan.filename?.replace(/\.(txt|csv)$/i, '');

    return hubScans.find((hubScan: HubScan) => {
      const hubFileName = hubScan.data?.fileName?.replace(/\.(txt|csv)$/i, '');
      return hubFileName === localScan.filename || hubScan.name.includes(localFileName || '');
    }) || null;
  };

  // Handle assignment
  const handleAssign = async () => {
    if (!selectedAssetId || !selectedVesselId || !selectedStrakeId) {
      setError('Please select an asset, vessel, and strake');
      return;
    }

    setIsLoading(true);
    setError('');

    let assignedCount = 0;
    let notFoundCount = 0;

    try {
      for (const scan of scans) {
        const hubScan = findMatchingHubScan(scan);

        if (hubScan) {
          try {
            await dataManager.assignScanToStrake(selectedAssetId, selectedVesselId, hubScan.id, selectedStrakeId);
            assignedCount++;
          } catch (err) {
            console.error(`Error assigning scan ${scan.filename}:`, err);
          }
        } else {
          notFoundCount++;
          console.warn(`Scan not found in hub: ${scan.filename}`);
        }
      }

      if (notFoundCount === 0) {
        onAssignComplete?.(true, `Successfully assigned ${assignedCount} scans to strake!`);
      } else {
        onAssignComplete?.(true, `Assigned ${assignedCount} scans. ${notFoundCount} not found in hub (export them first).`);
      }
      onClose();
    } catch (err) {
      console.error('Error assigning scans to strake:', err);
      setError('Failed to assign scans to strake');
      onAssignComplete?.(false, 'Assignment failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            Assign {scans.length} Scans to Strake
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {isInitializing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="ml-3 text-gray-400">Loading assets...</span>
            </div>
          ) : (
            <>
              {/* Info Message */}
              <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-blue-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  This will assign scans that have already been exported to the hub.
                  Scans not found in the hub will be skipped.
                </div>
              </div>

              {/* Asset Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <FolderOpen className="w-4 h-4 inline mr-1" />
                  Asset
                </label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => handleAssetChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select Asset --</option>
                  {assets.map(asset => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
                </select>
              </div>

              {/* Vessel Selection */}
              {selectedAssetId && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Ship className="w-4 h-4 inline mr-1" />
                    Vessel
                  </label>
                  <select
                    value={selectedVesselId}
                    onChange={(e) => handleVesselChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select Vessel --</option>
                    {vessels.map(vessel => (
                      <option key={vessel.id} value={vessel.id}>{vessel.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Strake Selection */}
              {selectedVesselId && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Layers className="w-4 h-4 inline mr-1" />
                    Strake
                  </label>
                  <select
                    value={selectedStrakeId}
                    onChange={(e) => setSelectedStrakeId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select Strake --</option>
                    {strakes.length === 0 ? (
                      <option value="" disabled>No strakes available (Create new)</option>
                    ) : (
                      strakes.map(strake => (
                        <option key={strake.id} value={strake.id}>{strake.name}</option>
                      ))
                    )}
                  </select>
                  <button
                    onClick={handleCreateStrake}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Create New Strake
                  </button>
                </div>
              )}

              {/* Files to assign */}
              <div className="max-h-32 overflow-y-auto bg-gray-700/50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-300 mb-2">Selected scans:</p>
                {scans.map(scan => (
                  <div key={scan.id} className="text-sm text-gray-400">
                    • {scan.filename}
                  </div>
                ))}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-700">
          <button
            onClick={handleAssign}
            disabled={isLoading || isInitializing || !selectedAssetId || !selectedVesselId || !selectedStrakeId}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign to Strake'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignStrakeModal;
