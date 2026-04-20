/**
 * Standalone Scan Viewer — works directly with the companion app.
 *
 * No project/Supabase context needed. Select folders from the companion,
 * generate a composite, and view it with interactive B-scan/A-scan cursors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCompanionApp } from '../hooks/queries/useCompanionApp';
import { useCompanionFolders } from '../hooks/queries/useCompanionFolders';
import { useRefreshCompanionIndex } from '../hooks/mutations/useCompanionMutations';
import { useCompanionWebSocket } from '../hooks/useCompanionWebSocket';
import { useThicknessEngine } from '../hooks/useThicknessEngine';
import type { GatePosition } from '../hooks/useThicknessEngine';
import { fetchComposite } from '../services/companion-service';
import { PageHeader } from '../components/ui/PageHeader';
import { RandomMatrixSpinner } from '../components/MatrixSpinners';
import CscanHeatmap from '../components/projects/scan-viewer/CscanHeatmap';
import BscanStrip from '../components/projects/scan-viewer/BscanStrip';
import AscanCanvas from '../components/projects/scan-viewer/AscanCanvas';
import type { GateOverlay } from '../components/projects/scan-viewer/AscanCanvas';
import GateControlsSidebar from '../components/projects/scan-viewer/GateControlsSidebar';
import ScanViewerToolbar from '../components/projects/scan-viewer/ScanViewerToolbar';
import type { CompositeData, GateSettings } from '../types/companion';
import { DEFAULT_GATE_SETTINGS } from '../types/companion';

function deriveRefGate(gates: GateOverlay[], gateMode: string): GatePosition | null {
  // A-I mode: ref = Gate I (id 0). B-A mode: ref = Gate A (id 1)
  const refId = gateMode === 'B-A' ? 1 : 0;
  const gate = gates.find(g => g.id === refId);
  if (!gate) return null;
  return { startUs: gate.startUs, endUs: gate.endUs, thresholdPct: gate.thresholdPct };
}

function deriveMeasGate(gates: GateOverlay[], gateMode: string): GatePosition | null {
  // A-I mode: meas = Gate A (id 1). B-A mode: meas = Gate B (id 2)
  const measId = gateMode === 'B-A' ? 2 : 1;
  const gate = gates.find(g => g.id === measId);
  if (!gate) return null;
  return { startUs: gate.startUs, endUs: gate.endUs, thresholdPct: gate.thresholdPct };
}

/** Gate settings that require companion reprocessing (server-side). */
const SERVER_GATE_KEYS: (keyof GateSettings)[] = [
  'gateMode',
  'refRecovery',
  'measRecovery',
  'minAmplitudeRef',
  'minAmplitudeMeas',
];

export default function ScanViewerLandingPage() {
  const { connected, port } = useCompanionApp();
  const { data: foldersData, isLoading: foldersLoading } = useCompanionFolders(port);
  const refreshIndex = useRefreshCompanionIndex();
  const ws = useCompanionWebSocket(port);
  const { tierTwoThickness, tierTwoProgress } = ws;

  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [composite, setComposite] = useState<CompositeData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ pct: number; file: string; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursorScanMm, setCursorScanMm] = useState(0);
  const [cursorIndexMm, setCursorIndexMm] = useState(0);
  const [gateSettings, setGateSettings] = useState<GateSettings>({ ...DEFAULT_GATE_SETTINGS });
  const [colormap, setColormap] = useState('Jet');
  const abortRef = useRef<AbortController | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const prevServerSettingsRef = useRef<string>('');

  const folders = foldersData?.folders ?? [];

  // Local gate overrides — persist user drag adjustments across WebSocket updates
  const [gateOverrides, setGateOverrides] = useState<Record<number, Partial<GateOverlay>>>({});
  // Visible region — stored as state so the expand effect in useThicknessEngine triggers,
  // but only updated when the region actually changes (prevents infinite re-render loops).
  const [visibleRegion, setVisibleRegion] = useState<{ x0: number; y0: number; x1: number; y1: number } | undefined>(undefined);
  const handleVisibleRegionChange = useCallback((region: { x0: number; y0: number; x1: number; y1: number }) => {
    setVisibleRegion(prev => {
      if (prev && prev.x0 === region.x0 && prev.y0 === region.y0 && prev.x1 === region.x1 && prev.y1 === region.y1) {
        return prev; // same reference — no re-render
      }
      return region;
    });
  }, []);

  const handleGateChange = useCallback((gateId: number, updates: Partial<GateOverlay>) => {
    setGateOverrides(prev => ({ ...prev, [gateId]: { ...prev[gateId], ...updates } }));
  }, []);

  // Merge server gates with local overrides
  const effectiveGates = useMemo(() => {
    const serverGates = ws.cursorData?.gates ?? [];
    return serverGates.map(g => ({ ...g, ...gateOverrides[g.id] }));
  }, [ws.cursorData?.gates, gateOverrides]);

  // Derive amplitude filter from the measurement gate's threshold.
  // The measurement gate is the second gate in A-I mode (id=1) or third in B-A mode (id=2).
  const amplitudeMin = useMemo(() => {
    const measGateId = gateSettings.gateMode === 'B-A' ? 2 : 1;
    const override = gateOverrides[measGateId];
    return override?.thresholdPct ?? null;
  }, [gateOverrides, gateSettings.gateMode]);

  const refGate = useMemo(() => deriveRefGate(effectiveGates, gateSettings.gateMode), [effectiveGates, gateSettings.gateMode]);
  const measGate = useMemo(() => deriveMeasGate(effectiveGates, gateSettings.gateMode), [effectiveGates, gateSettings.gateMode]);

  const { thickness: workerThickness } = useThicknessEngine({
    envelope: composite?.envelope ?? null,
    width: composite?.width ?? 0,
    height: composite?.height ?? 0,
    envelopeSamples: composite?.envelopeSamples ?? 0,
    timeStartUs: composite?.timeStartUs ?? 0,
    timeEndUs: composite?.timeEndUs ?? 1,
    velocity: composite?.velocity ?? 5900,
    refGate,
    measGate,
    visibleRegion,
  });

  const hasGateOverrides = Object.keys(gateOverrides).length > 0;

  // --- Tier 2: send full-res request to companion on gate release ---
  const handleGateRelease = useCallback(() => {
    if (!refGate || !measGate || selectedFolders.length === 0) return;
    ws.sendGateAdjust({
      tier: 2,
      gates: { ref: refGate, meas: measGate },
      folders: selectedFolders,
    });
  }, [ws, refGate, measGate, selectedFolders]);

  // Use Tier 2 result when available, otherwise fall back to Tier 1 worker result
  const effectiveThicknessOverride = tierTwoThickness ?? (hasGateOverrides ? workerThickness : null);

  const toggleFolder = useCallback((name: string) => {
    setSelectedFolders(prev =>
      prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name],
    );
  }, []);

  // Poll companion for generation progress while active
  useEffect(() => {
    if ((!isGenerating && !isRegenerating) || !port) {
      setGenerationProgress(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      // Brief delay — let the companion start processing before polling
      await new Promise(r => setTimeout(r, 300));
      while (!cancelled) {
        try {
          const res = await fetch(`http://localhost:${port}/composite-progress`, { signal: AbortSignal.timeout(2000) });
          if (cancelled) break;
          if (res.ok) {
            const data = await res.json();
            if (data.active) {
              setGenerationProgress({ pct: data.pct ?? 0, file: data.file ?? '', stage: data.stage ?? '' });
            }
          } else if (res.status === 404) {
            break; // endpoint doesn't exist — old companion, stop polling
          }
        } catch { /* network error — ignore, will retry */ }
        await new Promise(r => setTimeout(r, 500));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [isGenerating, isRegenerating, port]);

  const handleGenerate = useCallback(async () => {
    if (!port || selectedFolders.length === 0) return;

    setIsGenerating(true);
    setError(null);
    // Don't clear composite — keep showing the existing viewer with a loading overlay.
    // Only clear if there's no composite yet (first generation).

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // Strip thickness min/max from gate settings sent to companion — these are
      // applied client-side only so the user can adjust them without regeneration.
      const companionGateSettings = { ...gateSettings, thicknessMin: null, thicknessMax: null };
      const data = await fetchComposite(port, selectedFolders, companionGateSettings, abortRef.current.signal);
      setComposite(data);
      // Center cursor and send initial position via WebSocket
      if (data.xAxis.length > 0 && data.yAxis.length > 0) {
        const initScan = data.xAxis[Math.floor(data.xAxis.length / 2)];
        const initIndex = data.yAxis[Math.floor(data.yAxis.length / 2)];
        setCursorScanMm(initScan);
        setCursorIndexMm(initIndex);
        ws.sendCursor({
          scanMm: initScan,
          indexMm: initIndex,
          folders: selectedFolders,
          gateSettings,
          bscanWidth: 400,
          bscanHeight: 150,
          dscanWidth: 400,
          dscanHeight: 150,
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Composite generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [port, selectedFolders, gateSettings, ws]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleCursorMove = useCallback((scanMm: number, indexMm: number) => {
    setCursorScanMm(scanMm);
    setCursorIndexMm(indexMm);
    ws.sendCursor({
      scanMm,
      indexMm,
      folders: selectedFolders,
      gateSettings,
      bscanWidth: 400,
      bscanHeight: 150,
      dscanWidth: 400,
      dscanHeight: 150,
    });
  }, [ws, selectedFolders, gateSettings]);

  // --- Auto-regenerate when server-side gate settings change ---
  const regenerate = useCallback(async () => {
    if (!port || selectedFolders.length === 0) return;

    setIsRegenerating(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const companionGateSettings = { ...gateSettings, thicknessMin: null, thicknessMax: null };
      const data = await fetchComposite(port, selectedFolders, companionGateSettings, abortRef.current.signal);
      setComposite(data);
      // Preserve cursor if within bounds, otherwise re-center
      if (data.xAxis.length > 0 && data.yAxis.length > 0) {
        const xMin = data.xAxis[0], xMax = data.xAxis[data.xAxis.length - 1];
        const yMin = data.yAxis[0], yMax = data.yAxis[data.yAxis.length - 1];
        if (cursorScanMm < xMin || cursorScanMm > xMax || cursorIndexMm < yMin || cursorIndexMm > yMax) {
          setCursorScanMm(data.xAxis[Math.floor(data.xAxis.length / 2)]);
          setCursorIndexMm(data.yAxis[Math.floor(data.yAxis.length / 2)]);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  }, [port, selectedFolders, gateSettings, cursorScanMm, cursorIndexMm]);

  useEffect(() => {
    if (!composite || !port || selectedFolders.length === 0) return;

    const serverSettings = JSON.stringify(
      SERVER_GATE_KEYS.reduce<Record<string, unknown>>((acc, key) => ({ ...acc, [key]: gateSettings[key] }), {}),
    );

    // Skip initial render
    if (prevServerSettingsRef.current === '') {
      prevServerSettingsRef.current = serverSettings;
      return;
    }

    // No change
    if (serverSettings === prevServerSettingsRef.current) return;
    prevServerSettingsRef.current = serverSettings;

    const timer = setTimeout(() => {
      regenerate();
    }, 500);

    return () => clearTimeout(timer);
  }, [gateSettings, composite, port, selectedFolders, regenerate]);

  // --- Not connected ---
  if (!connected) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <PageHeader
          title="Scan Viewer"
          subtitle="Interactive C-scan heatmap with B-scan and A-scan cursors"
          icon={<ViewerIcon />}
        />
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          background: 'var(--surface-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          marginTop: 20,
        }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Companion app not connected
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-quaternary)', lineHeight: 1.5 }}>
            Start the NDT Companion app and set the directory to a folder containing NDE file subfolders.
          </div>
        </div>
      </div>
    );
  }

  // --- Connected, no composite yet ---
  if (!composite) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <PageHeader
          title="Scan Viewer"
          subtitle="Interactive C-scan heatmap with B-scan and A-scan cursors"
          icon={<ViewerIcon />}
        />

        {/* Folder selection */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select scan folders ({selectedFolders.length} selected)
            </span>
            <button
              onClick={() => port && refreshIndex.mutate(port)}
              disabled={refreshIndex.isPending}
              style={{ fontSize: '0.72rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {refreshIndex.isPending ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {foldersLoading && (
            <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Loading folders...</div>
          )}

          {!foldersLoading && folders.length === 0 && (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--text-quaternary)',
            }}>
              No subfolders with .nde files found. Set the companion directory to a parent folder containing scan subfolders.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {folders.map(f => {
              const selected = selectedFolders.includes(f.name);
              return (
                <button
                  key={f.name}
                  onClick={() => toggleFolder(f.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: selected ? 'rgba(59,130,246,0.1)' : 'var(--surface-elevated)',
                    border: `1px solid ${selected ? '#3b82f6' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: selected ? '#93c5fd' : 'var(--text-secondary)' }}>
                    {f.name}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-quaternary)' }}>
                    {f.fileCount} file{f.fileCount !== 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Generate button */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            {isGenerating ? (
              <button
                onClick={handleCancel}
                style={{
                  fontSize: '0.82rem',
                  padding: '8px 24px',
                  borderRadius: 6,
                  border: '1px solid #ef4444',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f87171',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={selectedFolders.length === 0}
                style={{
                  fontSize: '0.82rem',
                  padding: '8px 24px',
                  borderRadius: 6,
                  border: '1px solid #3b82f6',
                  background: 'rgba(59,130,246,0.15)',
                  color: '#93c5fd',
                  cursor: selectedFolders.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedFolders.length === 0 ? 0.4 : 1,
                }}
              >
                Generate Composite
              </button>
            )}
            {isGenerating && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RandomMatrixSpinner size={20} />
                  <span style={{ fontSize: '0.78rem', color: '#93c5fd' }}>
                    {generationProgress
                      ? `${generationProgress.stage === 'envelope' ? 'Extracting envelopes' : 'Processing'}: ${generationProgress.file}`
                      : `Generating composite from ${selectedFolders.length} folder${selectedFolders.length !== 1 ? 's' : ''}...`}
                  </span>
                </div>
                <div style={{ width: 300, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${generationProgress?.pct ?? 0}%`,
                    background: '#3b82f6',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Composite loaded — full viewer ---
  return (
    <div className="tool-container" style={{
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      gridTemplateRows: 'auto 1fr auto',
      height: '100%',
      background: 'var(--surface-base)',
      color: 'var(--text-primary)',
    }}>
      {/* Header */}
      <div style={{
        gridColumn: '1 / -1',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setComposite(null)}
            style={{ fontSize: '0.8rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Back to folder selection
          </button>
          <span style={{ color: 'var(--text-quaternary)' }}>/</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Scan Viewer
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.72rem', color: 'var(--text-quaternary)' }}>
          {tierTwoProgress && (
            <span style={{ color: '#60a5fa' }}>
              Tier 2: {tierTwoProgress.fileIndex + 1}/{tierTwoProgress.totalFiles} files
            </span>
          )}
          {tierTwoThickness && !tierTwoProgress && hasGateOverrides && (
            <span style={{ color: '#4ade80' }}>Tier 2 active</span>
          )}
          {hasGateOverrides && !tierTwoThickness && !tierTwoProgress && (
            <span style={{ color: '#fbbf24' }}>Tier 1 (approx)</span>
          )}
          <span>{composite.width} x {composite.height} — {composite.sourceFiles.length} files — {composite.stats.coveragePct.toFixed(1)}% coverage</span>
        </div>
      </div>

      {/* Left sidebar — gate controls */}
      <div style={{ gridRow: '2', borderRight: '1px solid var(--border-subtle)', padding: 12, overflowY: 'auto' }}>
        <GateControlsSidebar
          gateSettings={gateSettings}
          onChange={updates => setGateSettings(prev => ({ ...prev, ...updates }))}
        />

        {/* Stats card */}
        <div style={{ marginTop: 16, padding: 12, background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Thickness Stats
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem' }}>
            <StatRow label="Min" value={`${composite.stats.min.toFixed(2)} mm`} />
            <StatRow label="Max" value={`${composite.stats.max.toFixed(2)} mm`} />
            <StatRow label="Mean" value={`${composite.stats.mean.toFixed(2)} mm`} />
            <StatRow label="Std Dev" value={`${composite.stats.std.toFixed(3)} mm`} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ gridRow: '2', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
        {/* C-scan heatmap — takes all remaining space */}
        <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
          <CscanHeatmap
            composite={composite}
            cursorScanMm={cursorScanMm}
            cursorIndexMm={cursorIndexMm}
            colormap={colormap}
            onCursorMove={handleCursorMove}
            thicknessMin={gateSettings.thicknessMin}
            thicknessMax={gateSettings.thicknessMax}
            amplitudeMin={amplitudeMin}
            thicknessOverride={effectiveThicknessOverride}
            onVisibleRegionChange={handleVisibleRegionChange}
          />
          {(isGenerating || isRegenerating) && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              zIndex: 10,
              pointerEvents: 'none',
              borderRadius: 'var(--radius-sm)',
            }}>
              <RandomMatrixSpinner size={40} />
              <span style={{ color: '#93c5fd', fontSize: '0.85rem' }}>
                {generationProgress
                  ? `${generationProgress.stage === 'envelope' ? 'Extracting envelopes' : 'Processing'}: ${generationProgress.file}`
                  : isGenerating ? 'Generating composite...' : 'Regenerating...'}
              </span>
              {/* Progress bar */}
              <div style={{
                width: 220, height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${generationProgress?.pct ?? 0}%`,
                  background: '#3b82f6',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              {generationProgress && (
                <span style={{ color: 'var(--text-quaternary)', fontSize: '0.7rem' }}>
                  {generationProgress.pct}%
                </span>
              )}
            </div>
          )}
          {/* Tier 2 refinement progress — small pill in top-right corner */}
          {tierTwoProgress && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 12,
              border: '1px solid rgba(59,130,246,0.3)',
              pointerEvents: 'none',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: '0.68rem', color: '#93c5fd', whiteSpace: 'nowrap' }}>
                Refining: {tierTwoProgress.fileIndex + 1}/{tierTwoProgress.totalFiles}
              </span>
              <div style={{
                width: 40, height: 3, borderRadius: 2,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${tierTwoProgress.progress * 100}%`,
                  background: '#3b82f6',
                  borderRadius: 2,
                  transition: 'width 0.2s ease',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* A-scan / B-scan / D-scan — three equal panels along the bottom */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, height: 150 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AscanCanvas
              waveform={ws.cursorData?.ascan.waveform ?? null}
              timeMinUs={ws.cursorData?.ascan.timeMinUs ?? 0}
              timeMaxUs={ws.cursorData?.ascan.timeMaxUs ?? 1}
              gates={effectiveGates}
              onGateChange={handleGateChange}
              onGateRelease={handleGateRelease}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BscanStrip
              type="bscan-index"
              port={port}
              folders={selectedFolders}
              scanMm={cursorScanMm}
              indexMm={cursorIndexMm}
              gateSettings={gateSettings}
              blobUrl={ws.cursorData?.bscanBlobUrl ?? null}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BscanStrip
              type="bscan-axial"
              port={port}
              folders={selectedFolders}
              scanMm={cursorScanMm}
              indexMm={cursorIndexMm}
              gateSettings={gateSettings}
              blobUrl={ws.cursorData?.dscanBlobUrl ?? null}
            />
          </div>
        </div>
      </div>

      {/* Footer toolbar */}
      <div style={{ gridColumn: '1 / -1', padding: '8px 16px', borderTop: '1px solid var(--border-subtle)' }}>
        <ScanViewerToolbar
          colormap={colormap}
          onColormapChange={setColormap}
          isDirty={false}
          companionConnected={connected}
          onRegenerate={handleGenerate}
          isRegenerating={isGenerating}
          canEdit={true}
        />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function ViewerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M2 12h20M12 2v20" />
    </svg>
  );
}
