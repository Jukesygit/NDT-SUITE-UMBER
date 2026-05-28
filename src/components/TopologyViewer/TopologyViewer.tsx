import { useState, useCallback, useMemo } from 'react';
import type { CscanData } from '../CscanVisualizer/types';
import {
  processFilesWithWorker,
  createCompositeFromDataWithWorker,
  getCscanWorkerManager,
  type ProcessingProgress,
} from '../CscanVisualizer/utils/workerManager';
import CsvRepairModal from '../CscanVisualizer/CsvRepairModal';
import { resolveNominal } from './types';
import type {
  SurfaceOptions,
  TopologyTool,
  HoverInfo,
  CrossSectionData,
  MeasurementPoint,
  MeasurementState,
} from './types';
import { DEFAULT_SURFACE_OPTIONS } from './types';
import TopologyViewport from './TopologyViewport';
import TopologyToolbar from './TopologyToolbar';
import TopologyInfoPanel from './TopologyInfoPanel';
import CrossSectionPanel from './CrossSectionPanel';
import './topology-viewer.css';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TopologyViewer() {
  const [cscanData, setCscanData] = useState<CscanData | null>(null);
  const [processedScans, setProcessedScans] = useState<CscanData[]>([]);
  const [surfaceOptions, setSurfaceOptions] = useState<SurfaceOptions>(
    DEFAULT_SURFACE_OPTIONS,
  );
  const [activeTool, setActiveTool] = useState<TopologyTool>('orbit');
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [crossSection, setCrossSection] = useState<CrossSectionData | null>(
    null,
  );
  const [measurement, setMeasurement] = useState<MeasurementState>({
    pointA: null,
    pointB: null,
  });
  const [processingProgress, setProcessingProgress] =
    useState<ProcessingProgress | null>(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [pendingScans, setPendingScans] = useState<CscanData[]>([]);

  // ---- Computed values ---------------------------------------------------

  const resolvedNominal = useMemo(
    () =>
      cscanData ? resolveNominal(surfaceOptions.nominalThickness, cscanData.data) : 0,
    [cscanData, surfaceOptions.nominalThickness],
  );

  const isDecimated = useMemo(() => {
    if (!cscanData) return false;
    return (
      cscanData.height > surfaceOptions.maxDisplayResolution ||
      cscanData.width > surfaceOptions.maxDisplayResolution
    );
  }, [cscanData, surfaceOptions.maxDisplayResolution]);

  // ---- Helpers -----------------------------------------------------------

  const addScansToState = useCallback(
    (newScans: CscanData[]) => {
      const allScans = [...processedScans, ...newScans];
      setProcessedScans(allScans);

      if (allScans.length === 1) {
        setCscanData(allScans[0]);
      } else {
        // Multi-scan: composite
        createCompositeFromDataWithWorker(allScans).then((result) => {
          if (result) setCscanData(result.composite);
        });
      }
    },
    [processedScans],
  );

  // ---- Handlers ----------------------------------------------------------

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      try {
        setProcessingProgress({
          current: 0,
          total: fileArray.length,
          message: 'Starting...',
        });

        const result = await processFilesWithWorker(fileArray, {
          batchSize: 15,
          onProgress: (progress) => setProcessingProgress(progress),
        });

        setProcessingProgress(null);

        if (result.scans.length > 0) {
          if (result.hasOffsetIssues) {
            setPendingScans(result.scans);
            setShowRepairModal(true);
          } else {
            addScansToState(result.scans);
          }
        }
      } catch (error) {
        setProcessingProgress(null);
        console.error('File processing error:', error);
      }
    },
    [addScansToState],
  );

  const handleRepairComplete = useCallback(
    (repairedScans: CscanData[]) => {
      getCscanWorkerManager().clearCache();
      addScansToState(repairedScans);
      setShowRepairModal(false);
      setPendingScans([]);
    },
    [addScansToState],
  );

  const handleRepairClose = useCallback(() => {
    setShowRepairModal(false);
    setPendingScans([]);
  }, []);

  const handleMeasurementPoint = useCallback((point: MeasurementPoint) => {
    setMeasurement((prev) => {
      if (!prev.pointA) return { pointA: point, pointB: null };
      if (!prev.pointB) return { ...prev, pointB: point };
      return { pointA: point, pointB: null }; // Reset cycle
    });
  }, []);

  const handleOptionsChange = useCallback(
    (updates: Partial<SurfaceOptions>) => {
      setSurfaceOptions((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // ---- Render ------------------------------------------------------------

  return (
    <div className="topology-viewer">
      <TopologyToolbar
        surfaceOptions={surfaceOptions}
        onOptionsChange={handleOptionsChange}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onFileUpload={handleFileUpload}
        autoNominal={
          cscanData ? resolveNominal(null, cscanData.data) : null
        }
      />

      <div className="topology-viewer__main">
        <TopologyViewport
          cscanData={cscanData}
          surfaceOptions={surfaceOptions}
          activeTool={activeTool}
          isDecimated={isDecimated}
          onHover={setHoverInfo}
          onCrossSection={setCrossSection}
          onMeasurementPoint={handleMeasurementPoint}
          measurementState={measurement}
          nominalThickness={resolvedNominal}
        />

        {cscanData && (
          <TopologyInfoPanel
            hoverInfo={hoverInfo}
            cscanData={cscanData}
            nominalThickness={resolvedNominal}
            isAutoNominal={surfaceOptions.nominalThickness == null}
            isDecimated={isDecimated}
            isGeometryClamped={surfaceOptions.displacementClampUpper != null}
            isDenoised={surfaceOptions.denoiseRadius != null}
            isGapFilled={surfaceOptions.gapFillRadius > 0}
          />
        )}
      </div>

      {crossSection && (
        <CrossSectionPanel
          data={crossSection}
          nominalThickness={resolvedNominal}
          onClose={() => setCrossSection(null)}
        />
      )}

      <CsvRepairModal
        isOpen={showRepairModal && pendingScans.length > 0}
        onClose={handleRepairClose}
        scans={pendingScans}
        onRepairComplete={handleRepairComplete}
      />

      {processingProgress && (
        <div className="topology-viewer__progress">
          Processing {processingProgress.current}/{processingProgress.total}...
        </div>
      )}
    </div>
  );
}
