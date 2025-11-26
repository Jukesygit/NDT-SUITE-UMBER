import React, { useState, useCallback, useRef } from 'react';
import {
  Download,
  Image,
  ChevronLeft,
  ChevronRight,
  Layers,
  BarChart2,
  Grid3x3,
  Send
} from 'lucide-react';
import CanvasViewport from './CanvasViewport';
import FilePanel from './FilePanel';
import ToolBar from './ToolBar';
import StatsPanel from './StatsPanel';
import ExportToHubModal from './ExportToHubModal';
import AssignStrakeModal from './AssignStrakeModal';
import { CscanData, Tool, DisplaySettings } from './types';
import { processFiles, createComposite } from './utils/fileParser';

const CscanVisualizer: React.FC = () => {
  // Refs
  const canvasRef = useRef<{ exportImage: () => Promise<string | null> }>(null);

  // Core state
  const [scanData, setScanData] = useState<CscanData | null>(null);
  const [processedScans, setProcessedScans] = useState<CscanData[]>([]);
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set());

  // UI state
  const [activeTool, setActiveTool] = useState<Tool>('pan');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAssignStrakeModal, setShowAssignStrakeModal] = useState(false);
  const [scansForExport, setScansForExport] = useState<CscanData[]>([]);
  const [scansForStrakeAssign, setScansForStrakeAssign] = useState<CscanData[]>([]);
  const [isBatchExport, setIsBatchExport] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Display settings
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    colorScale: 'Jet',
    reverseScale: true,
    showGrid: true,
    smoothing: 'best',
    range: { min: null, max: null }
  });

  // Handlers
  const handleFileUpload = useCallback(async (files: File[]) => {
    try {
      const newScans = await processFiles(files);
      if (newScans.length > 0) {
        setProcessedScans(prev => [...prev, ...newScans]);
        const firstScan = newScans[0];
        setScanData(firstScan);

        const metaMin = firstScan.metadata?.['Min Thickness (mm)'];
        const metaMax = firstScan.metadata?.['Max Thickness (mm)'];
        if (metaMin !== undefined && metaMax !== undefined) {
          setDisplaySettings(prev => ({
            ...prev,
            range: { min: parseFloat(metaMin), max: parseFloat(metaMax) }
          }));
        }
      }
    } catch (error) {
      console.error('Error processing files:', error);
    }
  }, []);

  const handleFileSelect = useCallback((fileId: string) => {
    const scan = processedScans.find(s => s.id === fileId);
    if (scan) {
      setScanData(scan);
      const metaMin = scan.metadata?.['Min Thickness (mm)'];
      const metaMax = scan.metadata?.['Max Thickness (mm)'];
      if (metaMin !== undefined && metaMax !== undefined) {
        setDisplaySettings(prev => ({
          ...prev,
          range: { min: parseFloat(metaMin), max: parseFloat(metaMax) }
        }));
      } else {
        setDisplaySettings(prev => ({
          ...prev,
          range: { min: null, max: null }
        }));
      }
    }
  }, [processedScans]);

  const handleCreateComposite = useCallback(() => {
    const scansToComposite = selectedScans.size > 1
      ? processedScans.filter(scan => selectedScans.has(scan.id))
      : processedScans;

    if (scansToComposite.length < 2) {
      console.warn('Need at least 2 scans to create composite');
      return;
    }

    const composite = createComposite(scansToComposite);
    if (composite) {
      setProcessedScans(prev => [...prev, composite]);
      setScanData(composite);
      setSelectedScans(new Set());
      setDisplaySettings(prev => ({
        ...prev,
        range: { min: null, max: null }
      }));
    }
  }, [processedScans, selectedScans]);

  const handleClearFiles = useCallback(() => {
    setProcessedScans([]);
    setScanData(null);
    setSelectedScans(new Set());
    setDisplaySettings(prev => ({
      ...prev,
      range: { min: null, max: null }
    }));
  }, []);

  // Export handlers
  const handleExportImage = useCallback(async () => {
    if (!scanData || !canvasRef.current) return;

    try {
      const dataUrl = await canvasRef.current.exportImage();
      if (dataUrl) {
        const link = document.createElement('a');
        const filename = scanData.isComposite
          ? 'composite_cscan.png'
          : `${scanData.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_export.png`;
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting image:', error);
    }
    setShowExportMenu(false);
  }, [scanData]);

  const handleExportCleanHeatmap = useCallback(async () => {
    if (!scanData || !canvasRef.current) return;

    try {
      const dataUrl = await canvasRef.current.exportImage();
      if (dataUrl) {
        const link = document.createElement('a');
        const filename = scanData.isComposite
          ? 'composite_heatmap.png'
          : `${scanData.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_heatmap.png`;
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting heatmap:', error);
    }
    setShowExportMenu(false);
  }, [scanData]);

  const handleExportToHub = useCallback((scans: CscanData[]) => {
    setScansForExport(scans);
    setIsBatchExport(false);
    setShowExportModal(true);
  }, []);

  const handleBatchExportToHub = useCallback((scans: CscanData[]) => {
    setScansForExport(scans);
    setIsBatchExport(true);
    setShowExportModal(true);
  }, []);

  const handleAssignToStrake = useCallback((scans: CscanData[]) => {
    setScansForStrakeAssign(scans);
    setShowAssignStrakeModal(true);
  }, []);

  const handleExportComplete = useCallback((success: boolean, message: string) => {
    setStatusMessage({ type: success ? 'success' : 'error', message });
    setTimeout(() => setStatusMessage(null), 5000);
  }, []);

  const generateThumbnail = useCallback(async (_scan: CscanData): Promise<{ full: string; heatmapOnly: string } | null> => {
    return null;
  }, []);

  const dataMin = scanData?.stats?.min ?? 0;
  const dataMax = scanData?.stats?.max ?? 100;

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Fixed Toolbar */}
      <ToolBar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        displaySettings={displaySettings}
        onDisplaySettingsChange={setDisplaySettings}
        dataMin={dataMin}
        dataMax={dataMax}
      />

      {/* Main Content Area - relative container for absolute children */}
      <div className="flex-1 relative overflow-hidden">
        {/* VIEWPORT LAYER - fills entire space, always rendered */}
        <div className="absolute inset-0 bg-gray-900">
          {scanData ? (
            <CanvasViewport
              ref={canvasRef}
              data={scanData}
              activeTool={activeTool}
              displaySettings={displaySettings}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Grid3x3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-400 mb-2">No C-Scan Loaded</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Upload C-Scan files to begin analysis
                </p>
                <button
                  onClick={() => setLeftPanelOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  Open File Panel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* LEFT PANEL - floating overlay */}
        <div
          className={`
            absolute left-0 top-0 bottom-0 z-20
            flex transition-transform duration-300 ease-in-out
            ${leftPanelOpen ? 'translate-x-0' : '-translate-x-[calc(100%-48px)]'}
          `}
        >
          {/* Panel Content */}
          <div className="w-64 border-r border-gray-700 flex flex-col shadow-xl" style={{ backgroundColor: '#1f2937' }}>
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <h3 className="text-sm font-medium text-white">Files</h3>
              <button
                onClick={() => setLeftPanelOpen(false)}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Collapse panel"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <FilePanel
              files={processedScans}
              selectedFiles={selectedScans}
              currentFileId={scanData?.id}
              onFileSelect={handleFileSelect}
              onFileUpload={handleFileUpload}
              onSelectionChange={setSelectedScans}
              onCreateComposite={handleCreateComposite}
              onClearFiles={handleClearFiles}
              onExportToHub={handleExportToHub}
              onBatchExportToHub={handleBatchExportToHub}
              onAssignToStrake={handleAssignToStrake}
            />
          </div>

          {/* Collapse Tab - always visible */}
          <div className="w-12 border-r border-gray-700 flex flex-col items-center py-4 space-y-4" style={{ backgroundColor: '#1f2937' }}>
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title={leftPanelOpen ? 'Collapse panel' : 'Expand panel'}
            >
              {leftPanelOpen ? (
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>
            <button
              onClick={() => setLeftPanelOpen(true)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="Files"
            >
              <Layers className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-2 hover:bg-gray-700 rounded transition-colors ${showStats ? 'bg-blue-600' : ''}`}
              title="Statistics"
            >
              <BarChart2 className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-xs text-gray-500 [writing-mode:vertical-rl] rotate-180">
              {processedScans.length} files
            </span>
          </div>

          {/* Stats Panel - floating independently */}
          {showStats && (
            <div
              className="absolute left-14 top-4 w-64 rounded-lg shadow-xl border border-gray-700"
              style={{ backgroundColor: '#1f2937' }}
            >
              <StatsPanel
                data={scanData}
                isExpanded={true}
                onToggle={() => setShowStats(false)}
              />
            </div>
          )}
        </div>

        {/* RIGHT TOOLBAR - floating overlay */}
        <div className="absolute right-0 top-0 bottom-0 w-12 z-20 border-l border-gray-700 flex flex-col items-center py-4 space-y-4" style={{ backgroundColor: '#1f2937' }}>
          <button
            onClick={() => scanData && handleExportToHub([scanData])}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Send to Hub"
            disabled={!scanData}
          >
            <Send className={`w-4 h-4 ${scanData ? 'text-orange-400' : 'text-gray-600'}`} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`p-2 hover:bg-gray-700 rounded transition-colors ${showExportMenu ? 'bg-blue-600' : ''}`}
              title="Export Options"
              disabled={!scanData}
            >
              <Download className={`w-4 h-4 ${scanData ? 'text-gray-400' : 'text-gray-600'}`} />
            </button>

            {showExportMenu && scanData && (
              <div
                className="absolute right-full mr-2 top-0 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[160px] z-50"
                style={{ backgroundColor: '#1f2937' }}
              >
                <button
                  onClick={handleExportImage}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Image
                </button>
                <button
                  onClick={handleExportCleanHeatmap}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Image className="w-4 h-4" />
                  Export Heatmap
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Fixed Status Bar */}
      <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-4 z-30">
        <div className="flex items-center space-x-6 text-xs text-gray-400">
          <span>{scanData ? 'Ready' : 'No data loaded'}</span>
          {scanData && (
            <>
              <span>•</span>
              <span>{scanData.filename}</span>
              <span>•</span>
              <span>Size: {scanData.width}x{scanData.height}</span>
              <span>•</span>
              <span>Valid: {scanData.validPoints?.toLocaleString() || 0} points</span>
              <span>•</span>
              <span>Range: {dataMin.toFixed(2)} - {dataMax.toFixed(2)} mm</span>
            </>
          )}
        </div>
      </div>

      {/* Status Message Toast */}
      {statusMessage && (
        <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 ${
          statusMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white text-sm`}>
          {statusMessage.message}
        </div>
      )}

      {/* Export to Hub Modal */}
      <ExportToHubModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        scans={scansForExport}
        isBatch={isBatchExport}
        onExportComplete={handleExportComplete}
        generateThumbnail={generateThumbnail}
      />

      {/* Assign to Strake Modal */}
      <AssignStrakeModal
        isOpen={showAssignStrakeModal}
        onClose={() => setShowAssignStrakeModal(false)}
        scans={scansForStrakeAssign}
        onAssignComplete={handleExportComplete}
      />
    </div>
  );
};

export default CscanVisualizer;
