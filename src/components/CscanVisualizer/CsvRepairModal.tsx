import React, { useState, useMemo } from 'react';
import { X, AlertTriangle, Wrench, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { CscanData } from './types';
import { detectOffsetsForScans, applyOffsetCorrections } from './utils/fileParser';

interface CsvRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: CscanData[];
  onRepairComplete: (repairedScans: CscanData[]) => void;
}

const CsvRepairModal: React.FC<CsvRepairModalProps> = ({
  isOpen,
  onClose,
  scans,
  onRepairComplete
}) => {
  const [correctIndex, setCorrectIndex] = useState(true);
  const [correctScan, setCorrectScan] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Detect offsets for all scans
  const detections = useMemo(() => {
    return detectOffsetsForScans(scans);
  }, [scans]);

  // Separate by type
  const indexIssues = detections.filter(d => d.indexNeedsCorrection);
  const scanIssues = detections.filter(d => d.scanNeedsCorrection);

  const handleRepair = () => {
    const repairedScans = applyOffsetCorrections(scans, correctIndex, correctScan);
    onRepairComplete(repairedScans);
    onClose();
  };

  const handleSkip = () => {
    onRepairComplete(scans); // Return unchanged
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 9999 }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-gray-700"
        style={{ backgroundColor: '#1f2937' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                CSV Offset Issues Detected
              </h2>
              <p className="text-sm text-gray-400">
                {detections.length} file{detections.length !== 1 ? 's' : ''} may have incorrect axis values
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Explanation */}
          <div className="p-3 rounded-lg text-sm text-gray-300" style={{ backgroundColor: '#374151' }}>
            <p>
              These files appear to have axis values that don't match their expected positions
              based on the filename or metadata. This commonly occurs when the scanner outputs
              relative positions instead of absolute positions.
            </p>
          </div>

          {/* Issue Summary */}
          <div className="space-y-3">
            {/* Index Issues */}
            {indexIssues.length > 0 && (
              <div className="flex items-center gap-3 p-3 border border-blue-500/50 rounded-lg" style={{ backgroundColor: '#1e3a5f' }}>
                <input
                  type="checkbox"
                  id="fix-index"
                  checked={correctIndex}
                  onChange={(e) => setCorrectIndex(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="fix-index" className="flex-1 cursor-pointer">
                  <span className="font-medium text-white">Fix Index Axis (Y)</span>
                  <p className="text-sm text-gray-400">
                    {indexIssues.length} file{indexIssues.length !== 1 ? 's' : ''} have incorrect Index values
                  </p>
                </label>
              </div>
            )}

            {/* Scan Issues */}
            {scanIssues.length > 0 && (
              <div className="flex items-center gap-3 p-3 border border-purple-500/50 rounded-lg" style={{ backgroundColor: '#3b1f5f' }}>
                <input
                  type="checkbox"
                  id="fix-scan"
                  checked={correctScan}
                  onChange={(e) => setCorrectScan(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="fix-scan" className="flex-1 cursor-pointer">
                  <span className="font-medium text-white">Fix Scan Axis (X)</span>
                  <p className="text-sm text-gray-400">
                    {scanIssues.length} file{scanIssues.length !== 1 ? 's' : ''} have incorrect Scan values
                  </p>
                </label>
              </div>
            )}
          </div>

          {/* Collapsible Details */}
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              {showDetails ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Show file details
            </button>

            {showDetails && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-700" style={{ backgroundColor: '#111827' }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ backgroundColor: '#1f2937' }}>
                    <tr>
                      <th className="text-left p-2 text-gray-400 font-medium">File</th>
                      <th className="text-right p-2 text-gray-400 font-medium">Index Offset</th>
                      <th className="text-right p-2 text-gray-400 font-medium">Scan Offset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections.map((d, idx) => (
                      <tr key={d.fileId} style={{ backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                        <td className="p-2 text-gray-300 truncate max-w-[200px]" title={d.filename}>
                          {d.filename}
                        </td>
                        <td className="p-2 text-right">
                          {d.indexNeedsCorrection ? (
                            <span className="text-yellow-400">+{d.indexOffset.toFixed(0)}</span>
                          ) : (
                            <span className="text-gray-500">OK</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {d.scanNeedsCorrection ? (
                            <span className="text-yellow-400">+{d.scanOffset.toFixed(0)}</span>
                          ) : (
                            <span className="text-gray-500">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Preview Example */}
          {detections.length > 0 && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#111827' }}>
              <p className="text-gray-400 mb-2">Example correction:</p>
              <div className="flex items-center gap-2 text-gray-300">
                <span className="font-mono text-red-400">
                  {detections[0].actualIndexStart.toFixed(0)}
                </span>
                <span className="text-gray-500">→</span>
                <span className="font-mono text-green-400">
                  {(detections[0].actualIndexStart + detections[0].indexOffset).toFixed(0)}
                </span>
                <span className="text-gray-500 ml-2">
                  (Index +{detections[0].indexOffset.toFixed(0)} mm)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-700">
          <button
            onClick={handleRepair}
            disabled={!correctIndex && !correctScan}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Wrench className="w-4 h-4" />
            Apply Corrections
          </button>
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Keep Original
          </button>
        </div>
      </div>
    </div>
  );
};

export default CsvRepairModal;
