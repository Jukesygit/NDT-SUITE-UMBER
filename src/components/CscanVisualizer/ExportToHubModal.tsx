import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Loader2, FolderOpen, Ship, Layers } from 'lucide-react';
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
}

interface Strake {
  id: string;
  name: string;
  totalArea: number;
  requiredCoverage: number;
}

interface ExportToHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: CscanData[];
  isBatch?: boolean;
  onExportComplete?: (success: boolean, message: string) => void;
  generateThumbnail?: (scan: CscanData) => Promise<{ full: string; heatmapOnly: string } | null>;
}

const ExportToHubModal: React.FC<ExportToHubModalProps> = ({
  isOpen,
  onClose,
  scans,
  isBatch = false,
  onExportComplete,
  generateThumbnail
}) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedVesselId, setSelectedVesselId] = useState<string>('');
  const [selectedStrakeId, setSelectedStrakeId] = useState<string>('');
  const [scanName, setScanName] = useState<string>('');
  const [useFilenames, setUseFilenames] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
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

        // Set default scan name for single export
        if (!isBatch && scans.length === 1) {
          const scan = scans[0];
          const baseName = scan.filename?.replace(/\.(txt|csv)$/i, '') || 'C-Scan';
          setScanName(`${baseName} ${new Date().toLocaleDateString()}`);
        }
      } catch (err) {
        console.error('Error initializing data manager:', err);
        setError('Failed to load assets. Please try again.');
      } finally {
        setIsInitializing(false);
      }
    };

    initDataManager();
  }, [isOpen, isBatch, scans]);

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

  // Create new asset
  const handleCreateAsset = async () => {
    const name = prompt('Enter asset name:');
    if (!name) return;

    try {
      const asset = await dataManager.createAsset(name);
      setAssets(prev => [...prev, asset]);
      setSelectedAssetId(asset.id);
    } catch (err) {
      console.error('Error creating asset:', err);
      setError('Failed to create asset');
    }
  };

  // Create new vessel
  const handleCreateVessel = async () => {
    if (!selectedAssetId) {
      alert('Please select an asset first');
      return;
    }

    const name = prompt('Enter vessel name:');
    if (!name) return;

    try {
      const vessel = await dataManager.createVessel(selectedAssetId, name);
      // Refresh assets to get updated vessel list
      const loadedAssets = dataManager.getAssets();
      setAssets(loadedAssets);
      setSelectedVesselId(vessel.id);
    } catch (err) {
      console.error('Error creating vessel:', err);
      setError('Failed to create vessel');
    }
  };

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

  // Calculate stats from scan data
  const calculateStats = (scan: CscanData) => {
    return {
      min: scan.stats?.min ?? 0,
      max: scan.stats?.max ?? 0,
      mean: scan.stats?.mean ?? 0,
      median: scan.stats?.median ?? 0,
      stdDev: scan.stats?.stdDev ?? 0,
      validPoints: scan.stats?.validPoints ?? scan.validPoints ?? 0,
      totalPoints: scan.stats?.totalPoints ?? (scan.width * scan.height),
      totalArea: scan.stats?.totalArea ?? 0,
      validArea: scan.stats?.validArea ?? 0,
      ndPercent: scan.stats?.ndPercent ?? 0,
      ndCount: scan.stats?.ndCount ?? 0,
      ndArea: scan.stats?.ndArea ?? 0
    };
  };

  // Convert CscanData to format expected by data manager
  const convertToScanData = (scan: CscanData) => {
    // Flatten the 2D data array for storage
    const flatData: number[] = [];
    for (let row = 0; row < scan.data.length; row++) {
      for (let col = 0; col < scan.data[row].length; col++) {
        flatData.push(scan.data[row][col] ?? -999);
      }
    }

    return {
      metadata: scan.metadata || {},
      x_coords: scan.xAxis,
      y_coords: scan.yAxis,
      thickness_values_flat: flatData.length > 100000 ? null : flatData,
      rows: scan.height,
      cols: scan.width,
      fileName: scan.filename,
      isComposite: scan.isComposite || false
    };
  };

  // Export single scan
  const exportSingleScan = async () => {
    if (!selectedAssetId || !selectedVesselId) {
      setError('Please select an asset and vessel');
      return;
    }

    if (!scanName.trim()) {
      setError('Please enter a scan name');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const scan = scans[0];
      const stats = calculateStats(scan);

      // Generate thumbnail if function provided
      let thumbnails: { full: string; heatmapOnly: string } | null = null;
      if (generateThumbnail) {
        thumbnails = await generateThumbnail(scan);
      }

      const scanData = {
        name: scanName.trim(),
        toolType: 'cscan',
        data: {
          scanData: convertToScanData(scan),
          isComposite: scan.isComposite || false,
          customColorRange: { min: null, max: null },
          stats: stats,
          fileName: scan.filename,
          isCompressed: (scan.width * scan.height) > 100000
        },
        thumbnail: thumbnails?.full || null,
        heatmapOnly: thumbnails?.heatmapOnly || null
      };

      const createdScan = await dataManager.createScan(selectedAssetId, selectedVesselId, scanData);

      if (createdScan && selectedStrakeId) {
        await dataManager.assignScanToStrake(selectedAssetId, selectedVesselId, createdScan.id, selectedStrakeId);
      }

      onExportComplete?.(true, 'Scan exported successfully!');
      onClose();
    } catch (err) {
      console.error('Error exporting scan:', err);
      setError('Failed to export scan. Please try again.');
      onExportComplete?.(false, 'Failed to export scan');
    } finally {
      setIsLoading(false);
    }
  };

  // Export multiple scans
  const exportBatchScans = async () => {
    if (!selectedAssetId || !selectedVesselId) {
      setError('Please select an asset and vessel');
      return;
    }

    setIsLoading(true);
    setError('');
    setProgress({ current: 0, total: scans.length });

    const createdScanIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < scans.length; i++) {
        const scan = scans[i];
        setProgress({ current: i + 1, total: scans.length });

        try {
          const stats = calculateStats(scan);

          // Generate thumbnail if function provided
          let thumbnails: { full: string; heatmapOnly: string } | null = null;
          if (generateThumbnail) {
            thumbnails = await generateThumbnail(scan);
          }

          const name = useFilenames
            ? scan.filename?.replace(/\.(txt|csv)$/i, '') || `C-Scan ${i + 1}`
            : `C-Scan ${new Date().toLocaleDateString()} - ${i + 1}`;

          const scanData = {
            name,
            toolType: 'cscan',
            data: {
              scanData: convertToScanData(scan),
              isComposite: scan.isComposite || false,
              customColorRange: { min: null, max: null },
              stats: stats,
              fileName: scan.filename,
              isCompressed: (scan.width * scan.height) > 100000
            },
            thumbnail: thumbnails?.full || null,
            heatmapOnly: thumbnails?.heatmapOnly || null
          };

          const createdScan = await dataManager.createScan(selectedAssetId, selectedVesselId, scanData);

          if (createdScan) {
            successCount++;
            createdScanIds.push(createdScan.id);
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(`Error exporting scan ${scan.filename}:`, err);
          failCount++;
        }
      }

      // Assign all created scans to strake if one was selected
      if (selectedStrakeId && createdScanIds.length > 0) {
        for (const scanId of createdScanIds) {
          try {
            await dataManager.assignScanToStrake(selectedAssetId, selectedVesselId, scanId, selectedStrakeId);
          } catch (err) {
            console.error('Error assigning scan to strake:', err);
          }
        }
      }

      const strakeMsg = selectedStrakeId ? ' and assigned to strake' : '';
      if (failCount === 0) {
        onExportComplete?.(true, `Successfully exported ${successCount} scans${strakeMsg}!`);
      } else {
        onExportComplete?.(true, `Exported ${successCount} scans. ${failCount} failed.`);
      }
      onClose();
    } catch (err) {
      console.error('Error in batch export:', err);
      setError('Failed to complete batch export');
      onExportComplete?.(false, 'Batch export failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle export button click
  const handleExport = () => {
    if (isBatch) {
      exportBatchScans();
    } else {
      exportSingleScan();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {isBatch ? `Export ${scans.length} Scans to Hub` : 'Export Scan to Hub'}
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
              {/* Scan Name (single export only) */}
              {!isBatch && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scan Name
                  </label>
                  <input
                    type="text"
                    value={scanName}
                    onChange={(e) => setScanName(e.target.value)}
                    placeholder="e.g., Tank A North Side"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Use filenames checkbox (batch export only) */}
              {isBatch && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="use-filenames"
                    checked={useFilenames}
                    onChange={(e) => setUseFilenames(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="use-filenames" className="text-sm text-gray-300 cursor-pointer">
                    Use file names as scan names
                  </label>
                </div>
              )}

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
                <button
                  onClick={handleCreateAsset}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Create New Asset
                </button>
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
                  <button
                    onClick={handleCreateVessel}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Create New Vessel
                  </button>
                </div>
              )}

              {/* Strake Selection (optional) */}
              {selectedVesselId && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Layers className="w-4 h-4 inline mr-1" />
                    Strake (Optional)
                  </label>
                  <select
                    value={selectedStrakeId}
                    onChange={(e) => setSelectedStrakeId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- None (Don't assign to strake) --</option>
                    {strakes.map(strake => (
                      <option key={strake.id} value={strake.id}>{strake.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateStrake}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Create New Strake
                  </button>
                </div>
              )}

              {/* Files to export (batch only) */}
              {isBatch && (
                <div className="max-h-32 overflow-y-auto bg-gray-700/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-300 mb-2">Files to export:</p>
                  {scans.map(scan => (
                    <div key={scan.id} className="text-sm text-gray-400">
                      • {scan.filename}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress (batch export) */}
              {isLoading && isBatch && (
                <div>
                  <div className="text-sm text-gray-300 mb-2">
                    Exporting: {progress.current}/{progress.total}
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

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
            onClick={handleExport}
            disabled={isLoading || isInitializing || !selectedAssetId || !selectedVesselId}
            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isBatch ? 'Exporting...' : 'Exporting...'}
              </>
            ) : (
              isBatch ? 'Export All' : 'Export'
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

export default ExportToHubModal;
