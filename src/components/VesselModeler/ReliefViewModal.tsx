import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Move3d, Ruler, X } from 'lucide-react';
import type { ScanCompositeConfig } from './types';
import type { SurfaceOptions, MeasurementPoint, MeasurementState } from '../TopologyViewer/types';
import { resolveNominal } from '../TopologyViewer/types';
import { computeMeasurement } from '../TopologyViewer/engine/topology-measurement';
import { compositeToCscanData, reliefSurfaceOptions } from './engine/composite-relief-adapter';
import ReliefViewport, { type ReliefHoverInfo } from './ReliefViewport';

type ReliefTool = 'orbit' | 'measure';

export interface ReliefViewModalProps {
  composite: ScanCompositeConfig;
  onClose: () => void;
}

const LABEL: CSSProperties = { fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' };

/**
 * Self-contained relief/elevation view of a scan composite's thickness grid.
 * Pits render as valleys; measurement reports true physical mm (never
 * exaggerated). All heavy processing is the shared TopologyViewer engine, so
 * this surface agrees with the standalone /topology page.
 */
export default function ReliefViewModal({ composite, onClose }: ReliefViewModalProps) {
  const cscan = useMemo(() => compositeToCscanData(composite), [composite]);

  const [surfaceOptions, setSurfaceOptions] = useState<SurfaceOptions>(() =>
    reliefSurfaceOptions(composite),
  );
  const [activeTool, setActiveTool] = useState<ReliefTool>('orbit');
  const [measurement, setMeasurement] = useState<MeasurementState>({ pointA: null, pointB: null });
  const [hover, setHover] = useState<ReliefHoverInfo | null>(null);

  const nominal = useMemo(
    () => resolveNominal(surfaceOptions.nominalThickness, cscan.data),
    [cscan, surfaceOptions.nominalThickness],
  );

  const isDecimated =
    cscan.width > surfaceOptions.maxDisplayResolution ||
    cscan.height > surfaceOptions.maxDisplayResolution;

  const measurementResult = useMemo(() => {
    if (!measurement.pointA || !measurement.pointB) return null;
    return computeMeasurement(measurement.pointA, measurement.pointB, nominal);
  }, [measurement, nominal]);

  const handleMeasurementPoint = useCallback((point: MeasurementPoint) => {
    setMeasurement((prev) => {
      if (!prev.pointA) return { pointA: point, pointB: null };
      if (!prev.pointB) return { ...prev, pointB: point };
      return { pointA: point, pointB: null }; // reset cycle
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setOpt = (updates: Partial<SurfaceOptions>) =>
    setSurfaceOptions((prev) => ({ ...prev, ...updates }));

  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div
        className="vm-modal"
        style={{ width: 'min(1120px, 94vw)', height: '86vh', maxHeight: '86vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vm-modal-header">
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'white' }}>
            Relief view &mdash; {composite.name}
          </h3>
          <button className="vm-btn-icon" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 14,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="vm-toggle-group">
            <button
              className={`vm-toggle-btn ${activeTool === 'orbit' ? 'active' : ''}`}
              onClick={() => setActiveTool('orbit')}
              title="Orbit / hover to read thickness"
            >
              <Move3d size={13} /> Orbit
            </button>
            <button
              className={`vm-toggle-btn ${activeTool === 'measure' ? 'active' : ''}`}
              onClick={() => setActiveTool('measure')}
              title="Click two points for true physical distance"
            >
              <Ruler size={13} /> Measure
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={LABEL}>Exaggeration</span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={surfaceOptions.exaggeration}
              onChange={(e) => setOpt({ exaggeration: parseInt(e.target.value, 10) })}
            />
            <span style={{ ...LABEL, width: 26 }}>{surfaceOptions.exaggeration}&times;</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={LABEL}>Denoise</span>
            <select
              className="vm-select"
              value={surfaceOptions.denoiseRadius ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setOpt({ denoiseRadius: v === 0 ? null : v });
              }}
              title="Median filter — smooths the surface. OFF preserves raw measurement."
            >
              <option value={0}>Off</option>
              <option value={1}>3&times;3</option>
              <option value={2}>5&times;5</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={LABEL}>Gap fill</span>
            <select
              className="vm-select"
              value={surfaceOptions.gapFillRadius}
              onChange={(e) => setOpt({ gapFillRadius: parseInt(e.target.value, 10) })}
              title="Fill small ND holes by averaging neighbors. OFF leaves genuine holes."
            >
              <option value={0}>Off</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>

          {isDecimated && (
            <span
              style={{ ...LABEL, color: '#facc15' }}
              title="Display mesh is decimated (min-preserving); measurement still reads the full-resolution grid."
            >
              &#9679; Decimated display
            </span>
          )}
        </div>

        {/* Viewport */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <ReliefViewport
            cscan={cscan}
            surfaceOptions={surfaceOptions}
            activeTool={activeTool}
            nominal={nominal}
            measurement={measurement}
            onMeasurementPoint={handleMeasurementPoint}
            onHover={setHover}
          />

          {/* Hover tooltip */}
          {hover && (
            <div
              style={{
                position: 'fixed',
                left: hover.screenX + 14,
                top: hover.screenY + 14,
                background: 'rgba(20,25,35,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'rgba(255,255,255,0.85)',
                pointerEvents: 'none',
                zIndex: 60,
                whiteSpace: 'nowrap',
              }}
            >
              {hover.thickness != null ? (
                <strong>{hover.thickness.toFixed(2)} mm</strong>
              ) : (
                <span style={{ color: '#ff6666' }}>ND</span>
              )}
              <span style={{ opacity: 0.6 }}>
                {' '}
                &middot; S {hover.scanMm.toFixed(1)} &middot; I {hover.indexMm.toFixed(1)}
              </span>
            </div>
          )}

          {/* Readout panel */}
          <div
            style={{
              position: 'absolute',
              left: 12,
              bottom: 12,
              background: 'rgba(20,25,35,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'rgba(255,255,255,0.8)',
              maxWidth: 320,
            }}
          >
            {measurementResult ? (
              <>
                <div>
                  Distance: <strong>{measurementResult.horizontalDistance.toFixed(2)} mm</strong>
                </div>
                <div>
                  &Delta; thickness:{' '}
                  {measurementResult.depthDifference != null
                    ? `${measurementResult.depthDifference.toFixed(2)} mm`
                    : 'ND'}
                </div>
                <div style={{ opacity: 0.7 }}>
                  Wall loss A/B:{' '}
                  {measurementResult.wallLossA != null ? measurementResult.wallLossA.toFixed(2) : 'ND'}
                  {' / '}
                  {measurementResult.wallLossB != null ? measurementResult.wallLossB.toFixed(2) : 'ND'} mm
                </div>
              </>
            ) : activeTool === 'measure' ? (
              <span style={{ opacity: 0.65 }}>
                {measurement.pointA ? 'Click the second point…' : 'Click two points to measure.'}
              </span>
            ) : (
              <span style={{ opacity: 0.65 }}>
                Nominal {nominal.toFixed(1)} mm &middot; hover to read thickness.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
