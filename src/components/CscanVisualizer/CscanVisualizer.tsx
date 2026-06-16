import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  Image,
  Table,
  ChevronLeft,
  ChevronRight,
  Layers,
  Grid3x3,
  Loader2,
  CloudUpload,
  FolderOpen,
  Check,
  RotateCcw,
  FileText,
  Save,
  Database,
  Trash2,
} from 'lucide-react';
import CanvasViewport from './CanvasViewport';
import LayoutCanvas from './LayoutCanvas';
import FilePanel from './FilePanel';
import ToolBar from './ToolBar';
import { useLayoutMode } from './hooks/useLayoutMode';
import StatsPanel from './StatsPanel';
import DistributionPanel from './DistributionPanel';
import CsvRepairModal from './CsvRepairModal';
import { CscanData, Tool, DisplaySettings, DistributionConfig } from './types';
import { exportAndDownloadHeatmap } from './utils/streamedExport';
import { exportAnnotatedScanImage } from './utils/annotatedExport';
import { exportCscanAsCsv } from './utils/csvExport';
import {
  deleteCscanSession,
  listCscanSessions,
  loadCscanSession,
  saveCscanSession,
  type CscanSessionSummary,
} from './utils/sessionStore';
import {
  processFilesWithWorker,
  createCompositeWithWorker,
  createCompositeFromDataWithWorker,
  applyThresholdWithWorker,
  getCscanWorkerManager,
  type ProcessingProgress
} from './utils/workerManager';
import { useSaveScanComposite } from '../../hooks/mutations/useScanCompositeMutations';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectVessels } from '../../hooks/queries/useInspectionProjects';
// @ts-ignore - JS module without type declarations
import { isSupabaseConfigured } from '../../supabase-client';

const SECTION_OPTIONS = ['Shell', 'Dome End', 'Nozzle', 'Other'] as const;
const LEFT_PANEL_WIDTH = 256;
const SIDE_RAIL_WIDTH = 48;

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  colorScale: 'Jet',
  reverseScale: true,
  showGrid: true,
  whiteBackground: false,
  showFilenames: false,
  smoothing: 'best',
  flipH: false,
  flipV: false,
  range: { min: null, max: null },
  minimumThreshold: null,
};

function normalizeDisplaySettings(settings?: Partial<DisplaySettings>): DisplaySettings {
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...settings,
    range: {
      min: settings?.range?.min ?? null,
      max: settings?.range?.max ?? null,
    },
    minimumThreshold: settings?.minimumThreshold ?? null,
  };
}

const CscanVisualizer: React.FC = () => {
  // Project context from URL params
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectVesselId = searchParams.get('vessel');

  // Refs
  const canvasRef = useRef<{ exportImage: () => Promise<string | null>; exportCleanHeatmap: () => Promise<string | null> }>(null);

  // Core state
  const [scanData, setScanData] = useState<CscanData | null>(null);
  const [processedScans, setProcessedScans] = useState<CscanData[]>([]);
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set());

  // Layout mode state
  const [layoutMode, setLayoutMode] = useState(false);
  const [layoutHighlightId, setLayoutHighlightId] = useState<string | null>(null);

  // UI state
  const [activeTool, setActiveTool] = useState<Tool>('pan');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);

  // Modal state
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [pendingScans, setPendingScans] = useState<CscanData[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savedSessions, setSavedSessions] = useState<CscanSessionSummary[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Save to cloud state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveVesselId, setSaveVesselId] = useState(projectVesselId ?? '');
  const [saveSectionType, setSaveSectionType] = useState('Shell');
  const [saveCustomSection, setSaveCustomSection] = useState('');

  // Export progress state
  const [exportProgress, setExportProgress] = useState<{ progress: number; message: string } | null>(null);
  const [scanNotesById, setScanNotesById] = useState<Record<string, string>>({});

  // Processing progress state (for file loading and composite creation)
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);

  // Display settings
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => normalizeDisplaySettings());

  // Distribution panel state
  const [distributionConfig, setDistributionConfig] = useState<DistributionConfig>({
    enabled: false,
    mode: 'thickness',
    binCount: 5,
    nominalThickness: 10,
  });

  // Cloud save hooks
  const saveComposite = useSaveScanComposite();
  const { data: projectVessels } = useProjectVessels(projectId ?? undefined);
  const { user } = useAuth();

  // Layout mode hook
  const layoutState = useLayoutMode(processedScans);

  const makeDefaultSessionName = useCallback(() => {
    const base = scanData?.filename?.replace(/\.[^/.]+$/, '') || 'C-scan session';
    return `${base} ${new Date().toLocaleString()}`;
  }, [scanData]);

  const refreshSavedSessions = useCallback(async () => {
    try {
      const sessions = await listCscanSessions();
      setSavedSessions(sessions);
      setSessionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read saved sessions';
      setSessionError(message);
    }
  }, []);

  const handleOpenSessionDialog = useCallback(() => {
    setSessionName(makeDefaultSessionName());
    setSessionError(null);
    setShowSessionDialog(true);
    void refreshSavedSessions();
  }, [makeDefaultSessionName, refreshSavedSessions]);

  useEffect(() => {
    if (showSessionDialog) void refreshSavedSessions();
  }, [showSessionDialog, refreshSavedSessions]);

  // Helper to add scans to state
  const addScansToState = useCallback((scans: CscanData[]) => {
    if (scans.length === 0) return;

    setProcessedScans(prev => [...prev, ...scans]);
    const firstScan = scans[0];
    setScanData(firstScan);

    const metaMin = firstScan.metadata?.['Min Thickness (mm)'];
    const metaMax = firstScan.metadata?.['Max Thickness (mm)'];
    if (metaMin !== undefined && metaMax !== undefined) {
      setDisplaySettings(prev => ({
        ...prev,
        range: { min: parseFloat(metaMin), max: parseFloat(metaMax) }
      }));
    }
  }, []);

  // Handlers - using Web Worker for memory-efficient processing
  const handleFileUpload = useCallback(async (files: File[]) => {
    try {
      // Show processing progress
      setProcessingProgress({ current: 0, total: files.length, message: 'Starting...' });

      const result = await processFilesWithWorker(files, {
        batchSize: 15, // Process 15 files at a time to manage memory
        onProgress: (progress) => {
          setProcessingProgress(progress);
        }
      });

      // Clear progress
      setProcessingProgress(null);

      if (result.scans.length > 0) {
        // Check if any scans have offset issues
        if (result.hasOffsetIssues) {
          // Store scans and show repair modal
          setPendingScans(result.scans);
          setShowRepairModal(true);
        } else {
          // No issues, add directly
          addScansToState(result.scans);
          setStatusMessage({
            type: 'success',
            message: `${result.scans.length} file${result.scans.length !== 1 ? 's' : ''} loaded successfully`
          });
          setTimeout(() => setStatusMessage(null), 3000);
        }
      }
    } catch (error) {
      setProcessingProgress(null);
      setStatusMessage({
        type: 'error',
        message: `Error processing files: ${(error as Error).message}`
      });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [addScansToState]);

  // Handle repair completion
  const handleRepairComplete = useCallback((repairedScans: CscanData[]) => {
    // IMPORTANT: Clear worker cache since repaired scans have different coordinates
    // than the cached versions. This forces composite creation to use the legacy
    // algorithm with the corrected data from UI state.
    getCscanWorkerManager().clearCache();

    addScansToState(repairedScans);
    setPendingScans([]);
    setStatusMessage({
      type: 'success',
      message: `${repairedScans.length} file${repairedScans.length !== 1 ? 's' : ''} loaded successfully`
    });
    setTimeout(() => setStatusMessage(null), 3000);
  }, [addScansToState]);

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

  const handleCreateComposite = useCallback(async () => {
    const scansToComposite = selectedScans.size > 1
      ? processedScans.filter(scan => selectedScans.has(scan.id))
      : processedScans;

    if (scansToComposite.length < 2) {
      return;
    }

    // Show progress
    setProcessingProgress({
      current: 0,
      total: scansToComposite.length + 2,
      message: 'Creating composite...'
    });

    try {
      // Try worker-based composite first (streaming algorithm, memory efficient)
      const scanIds = scansToComposite.map(s => s.id);
      let workerResult = await createCompositeWithWorker(scanIds, {
        onProgress: (progress) => {
          setProcessingProgress(progress);
        }
      });

      // If scans aren't in cache (e.g., after repair), send data directly to worker
      if (!workerResult) {
        setProcessingProgress({
          current: 0,
          total: scansToComposite.length + 2,
          message: 'Processing with corrected data...'
        });

        workerResult = await createCompositeFromDataWithWorker(scansToComposite, {
          onProgress: (progress) => {
            setProcessingProgress(progress);
          }
        });
      }

      setProcessingProgress(null);

      if (workerResult) {
        // Worker succeeded - REPLACE source scans with composite to free memory
        // Keep only scans that weren't used in the composite
        const compositeSourceIds = new Set(scansToComposite.map(s => s.id));
        setProcessedScans(prev => {
          const nonSourceScans = prev.filter(s => !compositeSourceIds.has(s.id));
          return [...nonSourceScans, workerResult.composite];
        });
        setScanData(workerResult.composite);
        setSelectedScans(new Set());
        setDisplaySettings(prev => ({
          ...prev,
          range: { min: null, max: null }
        }));

        // Clear worker cache to free memory from source scans
        getCscanWorkerManager().clearCache();

        setStatusMessage({
          type: 'success',
          message: `Composite created from ${scansToComposite.length} files (source files removed to free memory)`
        });
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage({
          type: 'error',
          message: 'Failed to create composite — worker unavailable. Please use a modern browser.'
        });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setProcessingProgress(null);
      const msg = error instanceof Error ? error.message : 'Unknown error creating composite';
      setStatusMessage({ type: 'error', message: msg });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [processedScans, selectedScans]);

  const handleClearFiles = useCallback(() => {
    setProcessedScans([]);
    setScanData(null);
    setSelectedScans(new Set());
    setScanNotesById({});
    setDisplaySettings(prev => ({
      ...prev,
      range: { min: null, max: null }
    }));
    // Clear worker cache to free memory
    getCscanWorkerManager().clearCache();
  }, []);

  // Threshold apply handler — permanently nullifies values below threshold
  const handleApplyThreshold = useCallback(async (threshold: number) => {
    if (!scanData) return;

    // Count how many points will be removed for the confirmation message
    const flatData = scanData.data.flat().filter((v): v is number => v !== null && !isNaN(v));
    const belowCount = flatData.filter(v => v < threshold).length;
    const belowPercent = flatData.length > 0 ? ((belowCount / flatData.length) * 100).toFixed(1) : '0';

    if (belowCount === 0) {
      setStatusMessage({ type: 'success', message: 'No values below threshold — nothing to remove.' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const confirmed = window.confirm(
      `Permanently remove ${belowCount.toLocaleString()} points (${belowPercent}%) below ${threshold} mm?\n\nThis cannot be undone — to recover the data you would need to re-composite from source scans.`
    );
    if (!confirmed) return;

    try {
      // The scan needs to be in the worker cache — re-cache if needed
      const manager = getCscanWorkerManager();
      if (!manager.getCachedScan(scanData.id)) {
        const { toEfficientFormat } = await import('./utils/efficientTypes');
        manager.cacheScan(toEfficientFormat({
          ...scanData,
          stats: scanData.stats as unknown as Record<string, number>,
        }));
      }

      const result = await applyThresholdWithWorker(scanData.id, threshold);
      if (result) {
        setProcessedScans(prev =>
          prev.map(s => s.id === scanData.id ? result.composite : s)
        );
        setScanData(result.composite);
        setDisplaySettings(prev => ({
          ...prev,
          minimumThreshold: null,
        }));

        setStatusMessage({
          type: 'success',
          message: `Threshold applied: ${result.removedPoints.toLocaleString()} points (${result.removedPercent.toFixed(1)}%) below ${threshold} mm removed permanently.`
        });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to apply threshold';
      setStatusMessage({ type: 'error', message: msg });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [scanData]);

  const handleSaveSession = useCallback(async () => {
    if (processedScans.length === 0) {
      setSessionError('Load or create a scan before saving a session.');
      return;
    }

    setSessionBusy(true);
    setSessionError(null);
    try {
      const record = await saveCscanSession({
        name: sessionName.trim() || makeDefaultSessionName(),
        scans: processedScans,
        currentScanId: scanData?.id ?? null,
        selectedScanIds: Array.from(selectedScans),
        displaySettings,
        distributionConfig,
        scanNotesById,
        showStats,
      });
      setSessionName(record.name);
      await refreshSavedSessions();
      setStatusMessage({ type: 'success', message: `Session saved: ${record.name}` });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save session';
      setSessionError(message);
    } finally {
      setSessionBusy(false);
    }
  }, [
    processedScans,
    sessionName,
    makeDefaultSessionName,
    scanData,
    selectedScans,
    displaySettings,
    distributionConfig,
    scanNotesById,
    showStats,
    refreshSavedSessions,
  ]);

  const handleLoadSession = useCallback(async (sessionId: string) => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const session = await loadCscanSession(sessionId);
      if (!session) {
        setSessionError('Saved session could not be found.');
        return;
      }

      const currentScan = session.scans.find(scan => scan.id === session.currentScanId)
        ?? session.scans[0]
        ?? null;
      const validIds = new Set(session.scans.map(scan => scan.id));

      setProcessedScans(session.scans);
      setScanData(currentScan);
      setSelectedScans(new Set(session.selectedScanIds.filter(id => validIds.has(id))));
      setDisplaySettings(normalizeDisplaySettings(session.displaySettings));
      setDistributionConfig(session.distributionConfig);
      setScanNotesById(session.scanNotesById ?? {});
      setShowStats(session.showStats);
      setLayoutMode(false);
      setLayoutHighlightId(null);
      setSessionName(session.name);
      setShowSessionDialog(false);
      setLeftPanelOpen(true);
      getCscanWorkerManager().clearCache();
      setStatusMessage({ type: 'success', message: `Session loaded: ${session.name}` });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load session';
      setSessionError(message);
    } finally {
      setSessionBusy(false);
    }
  }, []);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      await deleteCscanSession(sessionId);
      await refreshSavedSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session';
      setSessionError(message);
    } finally {
      setSessionBusy(false);
    }
  }, [refreshSavedSessions]);

  // Layout mode handlers
  const handleLayoutApply = useCallback(async () => {
    const shifts: Array<{ id: string; deltaX: number; deltaY: number }> = [];
    for (const scan of processedScans) {
      const pos = layoutState.scanPositions.get(scan.id);
      if (!pos) continue;
      const origMinX = Math.min(...scan.xAxis);
      const origMinY = Math.min(...scan.yAxis);
      const deltaX = pos.x - origMinX;
      const deltaY = pos.y - origMinY;
      if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001) {
        shifts.push({ id: scan.id, deltaX, deltaY });
      }
    }

    setLayoutMode(false);
    setLayoutHighlightId(null);

    if (shifts.length === 0) {
      await handleCreateComposite();
      return;
    }

    setProcessingProgress({
      current: 0,
      total: processedScans.length + 2,
      message: 'Creating composite from layout...',
    });

    try {
      const manager = getCscanWorkerManager();
      await manager.shiftScanAxes(shifts);

      const scanIds = processedScans.map(s => s.id);
      let result = await createCompositeWithWorker(scanIds, {
        onProgress: (progress) => setProcessingProgress(progress),
      });

      if (!result) {
        const adjustedScans: CscanData[] = processedScans.map(scan => {
          const shift = shifts.find(s => s.id === scan.id);
          if (!shift) return scan;
          return {
            ...scan,
            xAxis: scan.xAxis.map(v => v + shift.deltaX),
            yAxis: scan.yAxis.map(v => v + shift.deltaY),
          };
        });
        result = await createCompositeFromDataWithWorker(adjustedScans, {
          onProgress: (progress) => setProcessingProgress(progress),
        });
      }

      setProcessingProgress(null);

      if (result) {
        const compositeSourceIds = new Set(processedScans.map(s => s.id));
        setProcessedScans(prev => {
          const nonSourceScans = prev.filter(s => !compositeSourceIds.has(s.id));
          return [...nonSourceScans, result.composite];
        });
        setScanData(result.composite);
        setSelectedScans(new Set());
        setDisplaySettings(prev => ({ ...prev, range: { min: null, max: null } }));
        manager.clearCache();
        setStatusMessage({ type: 'success', message: `Layout composite created from ${processedScans.length} files` });
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (error) {
      setProcessingProgress(null);
      const msg = error instanceof Error ? error.message : 'Failed to create composite';
      setStatusMessage({ type: 'error', message: msg });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [processedScans, layoutState.scanPositions, handleCreateComposite]);

  const handleLayoutReset = useCallback(() => {
    layoutState.resetPositions();
  }, [layoutState]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      getCscanWorkerManager().clearCache();
    };
  }, []);

  // Effective scan data with threshold applied — used for all exports/saves
  const effectiveScanData = useMemo((): CscanData | null => {
    if (!scanData) return null;
    const threshold = displaySettings.minimumThreshold;
    if (threshold === null) return scanData;
    return {
      ...scanData,
      data: scanData.data.map(row =>
        row.map(val => (val !== null && val < threshold) ? null : val)
      ),
    };
  }, [scanData, displaySettings.minimumThreshold]);

  // Save to cloud handler
  const handleSaveToCloud = useCallback(async () => {
    if (!effectiveScanData || !user) return;
    const effectiveVesselId = saveVesselId || undefined;
    const sectionType = saveSectionType === 'Other' ? saveCustomSection : saveSectionType;
    try {
      await saveComposite.mutateAsync({
        name: saveName || effectiveScanData.filename || 'Untitled Composite',
        organizationId: user.organizationId || '',
        userId: user.id,
        thicknessData: effectiveScanData.data,
        xAxis: effectiveScanData.xAxis,
        yAxis: effectiveScanData.yAxis,
        stats: effectiveScanData.stats || null,
        width: effectiveScanData.width,
        height: effectiveScanData.height,
        sourceFiles: effectiveScanData.sourceRegions || null,
        projectVesselId: effectiveVesselId,
        sectionType: sectionType || undefined,
      });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveSectionType('Shell');
      setSaveCustomSection('');
      const savedToLabel = effectiveVesselId ? 'Composite saved to project' : 'Composite saved to cloud';
      setStatusMessage({ type: 'success', message: savedToLabel });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save composite:', err);
      const sizeMsg = err instanceof Error && err.message?.includes('maximum allowed size')
        ? ' — file too large for storage'
        : '';
      setStatusMessage({ type: 'error', message: `Failed to save composite${sizeMsg}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [effectiveScanData, user, saveName, saveVesselId, saveSectionType, saveCustomSection, saveComposite]);

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
      // Export failed silently
    }
    setShowExportMenu(false);
  }, [scanData]);

  const handleExportCleanHeatmap = useCallback(async () => {
    if (!effectiveScanData) return;

    setShowExportMenu(false);

    try {
      // Use streamed export for memory efficiency (handles large composites)
      const success = await exportAndDownloadHeatmap(
        effectiveScanData,
        displaySettings,
        (progress, message) => {
          setExportProgress({ progress, message });
        }
      );

      // Clear progress after a short delay
      setTimeout(() => setExportProgress(null), 1500);

      if (!success) {
        setStatusMessage({ type: 'error', message: 'Failed to export heatmap' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setExportProgress(null);
      setStatusMessage({ type: 'error', message: 'Export failed - image may be too large' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [effectiveScanData, displaySettings]);

  const handleExportCsv = useCallback(() => {
    if (!effectiveScanData) return;
    exportCscanAsCsv(effectiveScanData);
    setShowExportMenu(false);
  }, [effectiveScanData]);

  const scanNotes = scanData ? scanNotesById[scanData.id] ?? '' : '';

  const handleScanNotesChange = useCallback((notes: string) => {
    if (!scanData) return;
    setScanNotesById(prev => ({ ...prev, [scanData.id]: notes }));
  }, [scanData]);

  const handleExportAnnotatedImage = useCallback(async () => {
    if (!scanData || !canvasRef.current) return;

    setShowExportMenu(false);

    try {
      const plotDataUrl = await canvasRef.current.exportImage();
      if (!plotDataUrl) {
        throw new Error('Graph export failed');
      }

      await exportAnnotatedScanImage({
        data: scanData,
        displaySettings,
        distributionConfig,
        plotDataUrl,
        notes: scanNotes,
      });
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Annotated export failed' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [scanData, displaySettings, distributionConfig, scanNotes]);

  // Effective scan data with threshold applied — used for all exports/saves
  const dataMin = scanData?.stats?.min ?? 0;
  const dataMax = scanData?.stats?.max ?? 100;
  const viewportInsetLeft = leftPanelOpen ? LEFT_PANEL_WIDTH + SIDE_RAIL_WIDTH : SIDE_RAIL_WIDTH;

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Project context banner */}
      {projectId && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-blue-500/20"
          style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa' }}>
          <FolderOpen size={13} />
          <span>Saving to project</span>
          {projectVesselId && <span className="text-blue-400/60">| Vessel linked</span>}
        </div>
      )}
      {/* Fixed Toolbar */}
      <ToolBar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        displaySettings={displaySettings}
        onDisplaySettingsChange={setDisplaySettings}
        dataMin={dataMin}
        dataMax={dataMax}
        showStats={showStats}
        onToggleStats={() => setShowStats(!showStats)}
        layoutMode={layoutMode}
        onToggleLayoutMode={() => setLayoutMode(prev => !prev)}
        layoutModeDisabled={processedScans.length < 2}
        distributionConfig={distributionConfig}
        onDistributionConfigChange={setDistributionConfig}
        hasData={!!scanData}
        onApplyThreshold={handleApplyThreshold}
      />

      {/* Main Content Area - relative container for absolute children */}
      <div className="flex-1 relative overflow-hidden">
        {/* VIEWPORT LAYER - fills entire space, always rendered */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${viewportInsetLeft}px`,
            right: `${SIDE_RAIL_WIDTH}px`,
            backgroundColor: '#1c1b18',
            transition: 'left 300ms ease-in-out, right 300ms ease-in-out',
          }}
        >
          {layoutMode && processedScans.length >= 2 ? (
            <LayoutCanvas
              scans={processedScans}
              scanPositions={layoutState.scanPositions}
              scanExtentsMap={layoutState.scanExtentsMap}
              zOrder={layoutState.zOrder}
              highlightedScanId={layoutHighlightId}
              onPositionChange={layoutState.setScanPosition}
              onBringToFront={(id) => {
                layoutState.bringToFront(id);
                setLayoutHighlightId(id);
              }}
              displaySettings={displaySettings}
              camera={layoutState.camera}
              onCameraChange={layoutState.setCamera}
            />
          ) : scanData ? (
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
          className="absolute left-0 top-0 bottom-0 z-20 flex"
          style={{
            width: `${LEFT_PANEL_WIDTH + SIDE_RAIL_WIDTH}px`,
            transform: leftPanelOpen ? 'translateX(0)' : `translateX(-${LEFT_PANEL_WIDTH}px)`,
            transition: 'transform 300ms ease-in-out',
          }}
        >
          {/* Panel Content */}
          <div
            className="border-r border-gray-700 flex flex-col shadow-xl"
            style={{
              width: `${LEFT_PANEL_WIDTH}px`,
              flex: '0 0 auto',
              backgroundColor: '#1f2937',
            }}
          >
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
              layoutMode={layoutMode}
              onBringToFront={(id) => {
                layoutState.bringToFront(id);
                setLayoutHighlightId(id);
              }}
            />
          </div>

          {/* Collapse Tab - always visible */}
          <div
            className="border-r border-gray-700 flex flex-col items-center py-4 space-y-4"
            style={{
              width: `${SIDE_RAIL_WIDTH}px`,
              flex: '0 0 auto',
              backgroundColor: '#1f2937',
            }}
          >
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
            <span className="text-xs text-gray-500 [writing-mode:vertical-rl] rotate-180">
              {processedScans.length} files
            </span>
          </div>
        </div>

        {/* Stats Panel - Independent floating popout */}
        {showStats && (
          <div
            className="absolute bottom-12 z-30 rounded-lg shadow-xl border border-gray-700"
            style={{
              left: `${viewportInsetLeft + 16}px`,
              backgroundColor: '#1f2937',
              minWidth: '520px',
              transition: 'left 300ms ease-in-out',
            }}
          >
            <StatsPanel
              data={scanData}
              isExpanded={true}
              onToggle={() => setShowStats(false)}
              minimumThreshold={displaySettings.minimumThreshold}
            />
          </div>
        )}

        {/* Distribution Panel - stacks above stats panel */}
        {distributionConfig.enabled && (
          <DistributionPanel
            data={scanData}
            config={distributionConfig}
            onConfigChange={setDistributionConfig}
            displaySettings={displaySettings}
            statsVisible={showStats}
            leftOffset={viewportInsetLeft + 16}
            onClose={() => setDistributionConfig(prev => ({ ...prev, enabled: false }))}
          />
        )}

        {/* SCAN NOTES - included in annotated graph export */}
        {scanData && !layoutMode && (
          <div
            className="absolute z-30 rounded-lg shadow-xl border border-gray-700"
            style={{
              right: `${SIDE_RAIL_WIDTH + 16}px`,
              bottom: 16,
              width: 'min(420px, calc(100% - 32px))',
              backgroundColor: 'rgba(20, 25, 35, 0.95)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Scan Notes</span>
            </div>
            <div className="p-3">
              <textarea
                value={scanNotes}
                onChange={(event) => handleScanNotesChange(event.target.value)}
                placeholder="Add inspection notes for the annotated export..."
                rows={3}
                className="w-full rounded bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600"
                style={{
                  resize: 'vertical',
                  minHeight: 74,
                  maxHeight: 180,
                  padding: '8px 10px',
                  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                }}
              />
            </div>
          </div>
        )}

        {/* LAYOUT MODE ACTION BUTTONS - floating above viewport */}
        {layoutMode && processedScans.length >= 2 && (
          <div className="absolute bottom-4 right-16 flex gap-2 z-30">
            <button
              onClick={handleLayoutReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors"
              style={{ backgroundColor: '#4a4845', color: '#f5f4f2' }}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleLayoutApply}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded font-medium transition-colors"
              style={{ backgroundColor: '#2d8a4e', color: '#f5f4f2' }}
            >
              <Check className="w-4 h-4" />
              Apply &amp; Composite
            </button>
          </div>
        )}

        {/* RIGHT TOOLBAR - floating overlay */}
        <div className="absolute right-0 top-0 bottom-0 w-12 z-20 border-l border-gray-700 flex flex-col items-center py-4 space-y-4" style={{ backgroundColor: '#1f2937' }}>
          <button
            onClick={handleOpenSessionDialog}
            className={`p-2 hover:bg-gray-700 rounded transition-colors ${showSessionDialog ? 'bg-blue-600' : ''}`}
            title="Save / Load Sessions"
          >
            <Database className="w-4 h-4 text-gray-400" />
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
                className="absolute right-full mr-2 top-0 border border-gray-600 rounded-lg shadow-xl py-1 z-50"
                style={{ backgroundColor: '#1f2937', minWidth: 210 }}
              >
                <button
                  onClick={handleExportImage}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Graph Image
                </button>
                <button
                  onClick={handleExportAnnotatedImage}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Export Graph + Stats
                </button>
                <button
                  onClick={handleExportCleanHeatmap}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Image className="w-4 h-4" />
                  Export Heatmap
                </button>
                <button
                  onClick={handleExportCsv}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Table className="w-4 h-4" />
                  Export CSV Data
                </button>
              </div>
            )}
          </div>

          {/* Save to Cloud button */}
          {scanData && isSupabaseConfigured() && (
            <button
              onClick={() => {
                setSaveName(scanData.filename || 'Composite');
                setShowSaveDialog(true);
              }}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="Save to Cloud"
            >
              <CloudUpload className="w-4 h-4 text-gray-400" />
            </button>
          )}
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

      {/* Export Progress Overlay */}
      {exportProgress && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <div
            className="rounded-lg p-6 shadow-xl min-w-[320px]"
            style={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Download className="w-5 h-5 animate-pulse" style={{ color: '#60a5fa' }} />
              <span style={{ color: '#ffffff', fontWeight: 500 }}>Exporting Heatmap</span>
            </div>
            <div className="mb-2">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: '#374151' }}
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${exportProgress.progress}%`,
                    backgroundColor: '#3b82f6'
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
              <span>{exportProgress.message}</span>
              <span>{Math.round(exportProgress.progress)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing Progress Overlay (File Loading & Composite Creation) */}
      {processingProgress && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <div
            className="rounded-lg p-6 shadow-xl min-w-[360px]"
            style={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#60a5fa' }} />
              <span style={{ color: '#ffffff', fontWeight: 500 }}>Processing Files</span>
            </div>
            <div className="mb-2">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: '#374151' }}
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${(processingProgress.current / processingProgress.total) * 100}%`,
                    backgroundColor: '#3b82f6'
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
              <span className="truncate max-w-[240px]">{processingProgress.message}</span>
              <span className="ml-2 whitespace-nowrap">{processingProgress.current}/{processingProgress.total}</span>
            </div>
            {processingProgress.memoryUsage && (
              <div className="mt-2 text-xs" style={{ color: '#6b7280' }}>
                Memory: {(processingProgress.memoryUsage / 1024 / 1024).toFixed(0)} MB
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSV Repair Modal */}
      <CsvRepairModal
        isOpen={showRepairModal}
        onClose={() => {
          setShowRepairModal(false);
          setPendingScans([]);
        }}
        scans={pendingScans}
        onRepairComplete={handleRepairComplete}
      />

      {/* Local Session Dialog */}
      {showSessionDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowSessionDialog(false)}
        >
          <div
            className="rounded-lg shadow-xl"
            style={{
              width: 'min(760px, calc(100vw - 32px))',
              maxHeight: '82vh',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-gray-400" />
                <div>
                  <h3 className="text-white font-medium">C-Scan Sessions</h3>
                  <p className="text-xs text-gray-400">Saved locally in this browser</p>
                </div>
              </div>
              <button
                onClick={() => setShowSessionDialog(false)}
                className="px-3 py-1.5 text-sm rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-5" style={{ maxHeight: 'calc(82vh - 72px)', overflowY: 'auto' }}>
              <div className="rounded-lg border border-gray-700 p-4" style={{ backgroundColor: '#111827' }}>
                <div className="flex items-end gap-3">
                  <label className="flex-1">
                    <span className="block text-xs text-gray-400 mb-1">Session name</span>
                    <input
                      type="text"
                      value={sessionName}
                      onChange={(event) => setSessionName(event.target.value)}
                      className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600"
                      placeholder="C-scan session name"
                    />
                  </label>
                  <button
                    onClick={handleSaveSession}
                    disabled={sessionBusy || processedScans.length === 0}
                    className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title={processedScans.length === 0 ? 'Load a scan before saving a session' : 'Save current session'}
                  >
                    <Save className="w-4 h-4" />
                    Save Current
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {processedScans.length > 0
                    ? `${processedScans.length} scan${processedScans.length !== 1 ? 's' : ''} will be saved with notes and display settings.`
                    : 'No scan data is currently loaded.'}
                </div>
              </div>

              {sessionError && (
                <div className="px-3 py-2 rounded text-sm bg-red-600/20 text-red-300 border border-red-600/40">
                  {sessionError}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-white">Saved Sessions</h4>
                  <button
                    onClick={refreshSavedSessions}
                    disabled={sessionBusy}
                    className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>

                {savedSessions.length === 0 ? (
                  <div className="rounded-lg border border-gray-700 px-4 py-8 text-center text-sm text-gray-500" style={{ backgroundColor: '#111827' }}>
                    No saved sessions yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedSessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-lg border border-gray-700 px-4 py-3 flex items-center gap-3"
                        style={{ backgroundColor: '#111827' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{session.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {session.scanCount} scan{session.scanCount !== 1 ? 's' : ''} - Saved {new Date(session.updatedAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleLoadSession(session.id)}
                          disabled={sessionBusy}
                          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={sessionBusy}
                          className="p-2 rounded hover:bg-red-600/30 transition-colors disabled:opacity-50"
                          title="Delete session"
                        >
                          <Trash2 className="w-4 h-4 text-red-300" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save to Cloud Dialog */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="rounded-lg p-6 shadow-xl min-w-[360px]"
            style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-medium mb-4">Save Composite to Cloud</h3>

            {/* Name */}
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Composite name"
              className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
            />

            {/* Vessel (dropdown — only shown when in project context) */}
            {projectId && projectVessels && projectVessels.length > 0 && (
              <>
                <label className="block text-sm text-gray-400 mb-1">Vessel</label>
                <select
                  value={saveVesselId}
                  onChange={(e) => setSaveVesselId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500 mb-4"
                >
                  <option value="">— No vessel —</option>
                  {projectVessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vessel_tag || v.vessel_name || v.id}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Section Type */}
            <label className="block text-sm text-gray-400 mb-1">Section</label>
            <div className="flex gap-2 mb-2">
              {SECTION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSaveSectionType(opt)}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                    saveSectionType === opt
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {saveSectionType === 'Other' && (
              <input
                type="text"
                value={saveCustomSection}
                onChange={(e) => setSaveCustomSection(e.target.value)}
                placeholder="Custom section name"
                className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              />
            )}
            {saveSectionType !== 'Other' && <div className="mb-4" />}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm rounded bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToCloud}
                disabled={saveComposite.isPending}
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saveComposite.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {saveComposite.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CscanVisualizer;
