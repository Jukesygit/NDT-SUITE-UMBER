/**
 * CompanionScanSection — Interactive B-scan/D-scan/A-scan from Matrix NDT Companion.
 *
 * Flow:
 * 1. User selects NDE file and clicks "Connect to NDE File"
 * 2. A cropped C-scan of the annotation region appears with a crosshair
 * 3. User clicks on the C-scan → B-scan, D-scan, and A-scan render at that position
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCompanionApp } from '../../../hooks/queries/useCompanionApp';
import { useCompanionFiles } from '../../../hooks/queries/useCompanionFiles';
import type { AnnotationShapeConfig, ScanCompositeConfig, VesselState } from '../types';
import { createAnnotationHeatmapCanvas } from '../engine/annotation-heatmap';

interface CompanionScanSectionProps {
  annotation: AnnotationShapeConfig;
  composite: ScanCompositeConfig | undefined;
  vesselState: VesselState;
  onViewImage: (url: string) => void;
  onSaveScanImages: (images: { cscan?: string; bscan?: string; dscan?: string; ascan?: string }) => Promise<void>;
  onClearScanImages: () => Promise<void>;
  getImageUrl: (storagePath: string) => string;
}

interface RenderResponse {
  bscanAxial?: string;
  bscanIndex?: string;
  ascanCenter?: string;
  clipped: boolean;
  actualBounds: Record<string, number>;
  metadata: Record<string, unknown>;
}

/** Convert annotation vessel coords to NDE file coords for the full annotation region.
 *  Uses the same directed-angle logic as annotation-heatmap.ts sampleComposite(). */
function annotationToNdeCoords(
  annotation: AnnotationShapeConfig,
  composite: ScanCompositeConfig,
  circumference: number,
): { scanStartMm: number; scanEndMm: number; indexStartMm: number; indexEndMm: number } {
  // datumAngleDeg uses 0=TDC; annotation.angle uses 90=TDC — convert datum
  const datumConv = ((composite.datumAngleDeg + 90) % 360 + 360) % 360;

  // Directed angular distance from datum to annotation center (always positive)
  let scanCenterDeg: number;
  if (composite.scanDirection === 'cw') {
    scanCenterDeg = ((datumConv - annotation.angle) % 360 + 360) % 360;
  } else {
    scanCenterDeg = ((annotation.angle - datumConv) % 360 + 360) % 360;
  }
  const scanCenterMm = (scanCenterDeg / 360) * circumference;

  // annotation.height = circumferential extent (scan direction)
  const scanHalfMm = annotation.height / 2;

  // Index (axial) — convert vessel pos to NDE index space
  const indexDir = composite.indexDirection === 'forward' ? 1 : -1;
  const indexOffset = (annotation.pos - composite.indexStartMm) * indexDir;
  const indexCenterMm = composite.yAxis[0] + indexOffset;

  // annotation.width = axial extent (index direction)
  const indexHalfMm = annotation.width / 2;

  return {
    scanStartMm: scanCenterMm - scanHalfMm,
    scanEndMm: scanCenterMm + scanHalfMm,
    indexStartMm: indexCenterMm - indexHalfMm,
    indexEndMm: indexCenterMm + indexHalfMm,
  };
}

export default function CompanionScanSection({
  annotation, composite, vesselState, onViewImage, onSaveScanImages, onClearScanImages, getImageUrl,
}: CompanionScanSectionProps) {
  const vesselId = vesselState.id;
  const { connected, port } = useCompanionApp();
  const { data: companionFiles } = useCompanionFiles(port);

  const [loading, setLoading] = useState(false);
  const [scanImages, setScanImages] = useState<RenderResponse | null>(null);
  const [showGates, setShowGates] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Whether the NDE file connection is established (C-scan visible, ready for clicks)
  const [isConnected, setIsConnected] = useState(false);

  // Crosshair position as fraction (0-1) within the annotation region
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  // NDE region bounds (set on connect)
  const [ndeCoords, setNdeCoords] = useState<ReturnType<typeof annotationToNdeCoords> | null>(null);

  const [saving, setSaving] = useState(false);
  const cscanContainerRef = useRef<HTMLDivElement>(null);

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize a string for fuzzy filename comparison: lowercase, strip .nde/.csv
  // extensions, and collapse underscores/spaces so "NEV_H_0310" matches "NEV H 0310".
  const normName = (s: string) =>
    s.toLowerCase().replace(/\.(nde|csv|txt)$/i, '').replace(/[_ ]+/g, ' ').trim();

  // Auto-match: prefer sourceFiles spatial match, fall back to sourceNdeFile string match
  const autoMatchedFile = (() => {
    if (!companionFiles?.length) return undefined;
    // Try spatial match: find which source file's raw region contains the annotation
    // sourceFiles bounds are in composite raw coordinate space (yAxis values),
    // NOT vessel shell coordinates. Convert annotation.pos (vessel shell mm) back
    // to the composite's raw index axis space.
    if (composite?.sourceFiles?.length && composite.yAxis.length > 0) {
      const dir = composite.indexDirection === 'forward' ? 1 : -1;
      // Vessel pos → composite raw index:
      //   vessel pos = indexStartMm + dir * (rawIndex - yAxis[0])
      //   rawIndex = yAxis[0] + (vessel pos - indexStartMm) / dir
      const rawIndex = composite.yAxis[0] + (annotation.pos - composite.indexStartMm) / dir;

      const matched = composite.sourceFiles.find(sf =>
        rawIndex >= sf.minY && rawIndex <= sf.maxY
      );
      if (matched) {
        const norm = normName(matched.filename);
        const companion = companionFiles.find(f => normName(f.filename).includes(norm));
        if (companion) return companion.filename;
      }
    }
    // Fall back to single sourceNdeFile string match
    if (composite?.sourceNdeFile) {
      const norm = normName(composite.sourceNdeFile);
      const companion = companionFiles.find(f => normName(f.filename).includes(norm));
      if (companion) return companion.filename;
    }
    return undefined;
  })();

  const activeFile = selectedFile || autoMatchedFile || '';

  /** Fetch B-scan/D-scan/A-scan at a specific crosshair position.
   *  cx/cy are screen fractions (0-1) on the C-scan canvas.
   *  Canvas X = axial (index axis), Canvas Y = circumferential (scan axis).
   *  Must account for the flip logic used by createAnnotationHeatmapCanvas. */
  const fetchAtPosition = useCallback(async (
    cx: number, cy: number, coords: NonNullable<typeof ndeCoords>,
  ) => {
    if (!port || !activeFile || !composite) return;

    // Must match the flip logic in createAnnotationHeatmapCanvas (annotation-heatmap.ts)
    const flipU = composite.indexDirection === 'forward';
    const flipV = composite.scanDirection !== 'cw';

    // Undo the flip to get true data fractions
    const indexFrac = flipU ? (1 - cx) : cx;
    const scanFrac = flipV ? (1 - cy) : cy;

    // Canvas X → index (longitudinal), Canvas Y → scan (circumferential)
    const indexLineMm = coords.indexStartMm + indexFrac * (coords.indexEndMm - coords.indexStartMm);
    const scanLineMm = coords.scanStartMm + scanFrac * (coords.scanEndMm - coords.scanStartMm);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:${port}/render-region`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeFile,
          ...coords,
          scanLineMm,
          indexLineMm,
          views: ['bscan_axial', 'bscan_index', 'ascan_center'],
          showGates: showGates ? undefined : [],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to render');
      }

      setScanImages(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [port, activeFile, showGates, composite]);

  /** Connect — compute NDE region, show C-scan, but don't fetch B/D-scans yet */
  const handleConnect = useCallback(() => {
    if (!composite) return;
    const circumference = Math.PI * vesselId;
    const coords = annotationToNdeCoords(annotation, composite, circumference);
    setNdeCoords(coords);
    setCrosshair(null);    // No crosshair until user clicks
    setScanImages(null);   // No B/D/A-scans until user clicks
    setIsConnected(true);
  }, [composite, annotation, vesselId]);

  /** Handle C-scan click — set crosshair and fetch B/D/A-scans */
  const handleCscanClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ndeCoords) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCrosshair({ x, y });

    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      fetchAtPosition(x, y, ndeCoords);
    }, 150);
  }, [ndeCoords, fetchAtPosition]);

  useEffect(() => {
    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current); };
  }, []);

  // Reset when annotation or file changes
  useEffect(() => {
    setIsConnected(false);
    setCrosshair(null);
    setScanImages(null);
    setNdeCoords(null);
  }, [annotation.id, activeFile]);

  // Auto-connect when file is auto-matched (no manual selection needed)
  useEffect(() => {
    if (autoMatchedFile && !selectedFile && !isConnected && composite) {
      handleConnect();
    }
  }, [autoMatchedFile, selectedFile, isConnected, composite, handleConnect]);

  const handleExportImages = useCallback(() => {
    if (!scanImages) return;
    const download = (dataUri: string, name: string) => {
      const a = document.createElement('a');
      a.href = dataUri;
      a.download = name;
      a.click();
    };
    if (scanImages.bscanAxial) download(scanImages.bscanAxial, `${annotation.name}_dscan.png`);
    if (scanImages.bscanIndex) download(scanImages.bscanIndex, `${annotation.name}_bscan.png`);
    if (scanImages.ascanCenter) download(scanImages.ascanCenter, `${annotation.name}_ascan.png`);
  }, [scanImages, annotation.name]);

  /** Render the C-scan heatmap + crosshair overlay into a single canvas data URL */
  const captureCscanWithCrosshair = useCallback((): string | undefined => {
    const container = cscanContainerRef.current;
    if (!container || !crosshair || !composite) return undefined;

    // Get the heatmap canvas from the AnnotationCscanMap child
    const sourceCanvas = container.querySelector('canvas');
    if (!sourceCanvas) return undefined;

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;

    // Draw heatmap
    ctx.drawImage(sourceCanvas, 0, 0);

    // Draw crosshair lines
    const cx = crosshair.x * w;
    const cy = crosshair.y * h;

    ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    // Draw yellow dot
    ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    return out.toDataURL('image/png');
  }, [crosshair, composite]);

  const handleSaveScanImages = useCallback(async () => {
    if (!scanImages) return;
    setSaving(true);
    try {
      const cscanDataUrl = captureCscanWithCrosshair();
      await onSaveScanImages({
        cscan: cscanDataUrl,
        dscan: scanImages.bscanAxial,
        bscan: scanImages.bscanIndex,
        ascan: scanImages.ascanCenter,
      });
    } finally {
      setSaving(false);
    }
  }, [scanImages, onSaveScanImages, captureCscanWithCrosshair]);

  // Saved scan-capture attachments for this annotation
  const savedScans = annotation.attachments?.filter(a => a.type === 'scan-capture') ?? [];

  // Renders saved scan images (used when no live companion images are showing)
  const savedScansBlock = savedScans.length > 0 && !scanImages ? (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
        Saved Scan Images
      </div>
      {(['cscan', 'dscan', 'bscan', 'ascan'] as const).map(scanType => {
        const att = savedScans.find(a => a.scanType === scanType);
        if (!att) return null;
        const label = scanType === 'cscan' ? 'C-scan' : scanType === 'dscan' ? 'D-scan' : scanType === 'bscan' ? 'B-scan' : 'A-scan';
        return (
          <div key={scanType} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
              {label}
            </div>
            <img
              src={getImageUrl(att.storagePath)}
              alt={label}
              onClick={() => onViewImage(getImageUrl(att.storagePath))}
              style={{ width: '100%', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
            />
          </div>
        );
      })}
      <button
        onClick={onClearScanImages}
        style={{
          width: '100%', padding: '4px 8px', marginTop: 4, fontSize: '0.75rem',
          background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5',
          border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 4, cursor: 'pointer',
        }}
      >
        Clear Saved Scans
      </button>
    </div>
  ) : null;

  if (!connected) {
    if (savedScans.length === 0) return null;
    return (
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">Saved Scan Images</div>
        {savedScansBlock}
      </div>
    );
  }

  if (!companionFiles?.length) {
    return (
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">
          Detailed Scan Data
          <span style={{ fontWeight: 400, fontSize: '0.65rem', color: '#4ade80', marginLeft: 6 }}>
            Companion Connected
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', margin: '8px 0' }}>
          No NDE files loaded in companion app. Open a directory containing .nde files to enable detailed scan views.
        </p>
      </div>
    );
  }

  return (
    <div className="vm-inspection-section">
      <div className="vm-inspection-section-title">
        Detailed Scan Data
        <span style={{ fontWeight: 400, fontSize: '0.65rem', color: '#4ade80', marginLeft: 6 }}>
          Companion Connected
        </span>
      </div>

      {/* NDE file selector */}
      <div style={{ padding: '4px 0' }}>
        <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>NDE File:</label>
        <select
          value={activeFile}
          onChange={e => setSelectedFile(e.target.value)}
          style={{
            width: '100%', marginTop: 2, padding: '4px 6px', fontSize: '0.75rem',
            background: 'rgba(255,255,255,0.08)', color: '#e0e0e0',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
          }}
        >
          <option value="">
            {autoMatchedFile ? `Auto: ${autoMatchedFile}` : '-- Select NDE file --'}
          </option>
          {companionFiles.map(f => (
            <option key={f.filename} value={f.filename}>{f.filename}</option>
          ))}
        </select>
      </div>

      {/* Gate overlay toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', padding: '4px 0', cursor: 'pointer',
      }}>
        <input type="checkbox" checked={showGates} onChange={e => setShowGates(e.target.checked)} />
        Show gate overlays
      </label>

      {/* Connect button */}
      {!isConnected && (
        <button
          onClick={handleConnect}
          disabled={!activeFile || !composite}
          style={{
            width: '100%', padding: '6px 12px', marginTop: 4, fontSize: '0.8rem', fontWeight: 500,
            background: activeFile ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)',
            color: activeFile ? '#93c5fd' : 'rgba(255,255,255,0.3)',
            border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 4,
            cursor: activeFile && composite ? 'pointer' : 'default',
          }}
        >
          Connect to NDE File
        </button>
      )}

      {/* Saved scans (shown until live scans replace them) */}
      {savedScansBlock}

      {/* Error display */}
      {error && (
        <div style={{
          marginTop: 4, padding: '4px 8px', fontSize: '0.7rem',
          color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 4,
        }}>
          {error}
        </div>
      )}

      {/* Interactive C-scan + scan images */}
      {isConnected && composite && (
        <div style={{ marginTop: 8 }}>

          {/* Clickable annotation-region C-scan with crosshair */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
              C-scan — click to select position
              {loading && <span style={{ color: '#93c5fd', marginLeft: 6 }}>updating...</span>}
            </div>
            <div
              ref={cscanContainerRef}
              onClick={handleCscanClick}
              style={{
                position: 'relative',
                height: 100,
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: 'crosshair',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <AnnotationCscanMap
                annotation={annotation}
                vesselState={vesselState}
                colorScale={composite.colorScale}
              />

              {/* Crosshair overlay — only when user has clicked */}
              {crosshair && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <div style={{
                    position: 'absolute', left: `${crosshair.x * 100}%`,
                    top: 0, bottom: 0, width: 1, background: 'rgba(255, 100, 100, 0.8)',
                  }} />
                  <div style={{
                    position: 'absolute', top: `${crosshair.y * 100}%`,
                    left: 0, right: 0, height: 1, background: 'rgba(100, 255, 100, 0.8)',
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: `${crosshair.x * 100}%`, top: `${crosshair.y * 100}%`,
                    width: 8, height: 8, marginLeft: -4, marginTop: -4,
                    borderRadius: '50%', background: 'rgba(255, 255, 0, 0.9)',
                    border: '1px solid rgba(0,0,0,0.5)',
                  }} />
                </div>
              )}

              {/* Prompt when no crosshair set */}
              {!crosshair && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                  background: 'rgba(0,0,0,0.3)',
                  fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)',
                }}>
                  Click to inspect
                </div>
              )}
            </div>
          </div>

          {/* D-scan — only after crosshair is placed */}
          {scanImages?.bscanAxial && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
                D-scan (along scan direction)
                <span style={{ color: '#4ade80', marginLeft: 4 }}>— at green line</span>
              </div>
              <img
                src={scanImages.bscanAxial}
                alt="D-scan"
                onClick={() => onViewImage(scanImages.bscanAxial!)}
                style={{ width: '100%', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* B-scan — only after crosshair is placed */}
          {scanImages?.bscanIndex && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
                B-scan (across index axis)
                <span style={{ color: '#f87171', marginLeft: 4 }}>— at red line</span>
              </div>
              <img
                src={scanImages.bscanIndex}
                alt="B-scan"
                onClick={() => onViewImage(scanImages.bscanIndex!)}
                style={{ width: '100%', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* A-scan — only after crosshair is placed */}
          {scanImages?.ascanCenter && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
                A-scan — at crosshair
                <span style={{ color: '#fbbf24', marginLeft: 4 }}>(yellow dot)</span>
              </div>
              <img
                src={scanImages.ascanCenter}
                alt="A-scan"
                onClick={() => onViewImage(scanImages.ascanCenter!)}
                style={{ width: '100%', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Action buttons — only when images are loaded */}
          {scanImages && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                onClick={handleExportImages}
                style={{
                  flex: 1, padding: '4px 8px', fontSize: '0.75rem',
                  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer',
                }}
              >
                Export Images
              </button>
              <button
                onClick={handleSaveScanImages}
                disabled={saving}
                style={{
                  flex: 1, padding: '4px 8px', fontSize: '0.75rem',
                  background: saving ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.2)',
                  color: saving ? 'rgba(147,197,253,0.6)' : '#93c5fd',
                  border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4,
                  cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : savedScans.length > 0 ? 'Update Scans' : 'Attach Scans'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnnotationCscanMap — reuses the existing createAnnotationHeatmapCanvas
// so the colors and coordinate mapping match the Heatmap Preview exactly.
// ---------------------------------------------------------------------------

function AnnotationCscanMap({ annotation, vesselState, colorScale }: {
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  colorScale: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const canvas = createAnnotationHeatmapCanvas(annotation, vesselState, colorScale);
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'fill';
      canvas.style.imageRendering = 'pixelated';
      canvas.style.display = 'block';
      container.appendChild(canvas);
    }
  }, [annotation, vesselState, colorScale]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
