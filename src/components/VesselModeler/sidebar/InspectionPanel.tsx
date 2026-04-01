// =============================================================================
// InspectionPanel - Right-side overlay for annotation inspection mode
// =============================================================================
// Displays detailed annotation metadata, thickness stats, and navigation
// when the user enters inspection mode on an annotation shape.
// =============================================================================

import { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AnnotationShapeConfig, ThicknessThresholds, VesselState } from '../types';
import {
  createAnnotationHeatmapCanvas,
  findOverlappingComposite,
} from '../engine/annotation-heatmap';
import { ThresholdSection } from './ThresholdSection';

interface InspectionPanelProps {
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  onClose: () => void;
  onCycleToAnnotation: (id: number) => void;
  onStatHover: (stat: 'min' | 'max' | null) => void;
  thicknessThresholds?: ThicknessThresholds;
  onUpdateThicknessThresholds: (thresholds: ThicknessThresholds) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
};

function formatMm(value: number): string {
  return value.toFixed(1);
}

/** Circumferential position in mm from angle and inner diameter */
function scanPositionMm(angleDeg: number, innerDiameter: number): number {
  return (angleDeg / 360) * Math.PI * innerDiameter;
}

/** Area in m² */
function computeArea(type: 'circle' | 'rectangle', width: number, height: number): number {
  if (type === 'circle') {
    return (Math.PI * (width / 2) ** 2) / 1_000_000;
  }
  return (width * height) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InspectionPanel({
  annotation,
  vesselState,
  onClose,
  onCycleToAnnotation,
  onStatHover,
  thicknessThresholds,
  onUpdateThicknessThresholds,
}: InspectionPanelProps) {
  const stats = annotation.thicknessStats;
  const scanMm = scanPositionMm(annotation.angle, vesselState.id);
  const area = computeArea(annotation.type, annotation.width, annotation.height);
  const severityColor = annotation.severityLevel
    ? SEVERITY_COLORS[annotation.severityLevel]
    : 'rgba(255,255,255,0.3)';

  const otherAnnotations = vesselState.annotations.filter(a => a.id !== annotation.id);

  // --- Mini heatmap ---
  const heatmapContainerRef = useRef<HTMLDivElement>(null);
  const overlappingComposite = findOverlappingComposite(annotation, vesselState);
  const heatmapColorScale = overlappingComposite?.colorScale ?? null;

  useEffect(() => {
    const container = heatmapContainerRef.current;
    if (!container) return;

    // Clear previous canvas
    container.innerHTML = '';

    const canvas = createAnnotationHeatmapCanvas(
      annotation,
      vesselState,
      heatmapColorScale ?? 'Jet',
    );

    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'contain';
      canvas.style.borderRadius = '4px';
      canvas.style.imageRendering = 'pixelated';
      container.appendChild(canvas);
    }
  }, [annotation, vesselState, heatmapColorScale]);

  return (
    <div className="vm-inspection-panel">
      {/* Header */}
      <div className="vm-inspection-panel-header">
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#e0e0e0',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          title="Exit inspection mode"
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}>
          {annotation.name}
        </span>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: severityColor,
            flexShrink: 0,
          }}
          title={annotation.severityLevel ?? 'No severity'}
        />
      </div>

      {/* Metadata */}
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">Position &amp; Size</div>
        <div className="vm-inspection-stat-row">
          <span>Scan</span>
          <span>{formatMm(scanMm)} mm</span>
        </div>
        <div className="vm-inspection-stat-row">
          <span>Index</span>
          <span>{formatMm(annotation.pos)} mm</span>
        </div>
        <div className="vm-inspection-stat-row">
          <span>Size</span>
          <span>
            {formatMm(annotation.width)} &times; {formatMm(annotation.height)} mm
          </span>
        </div>
        <div className="vm-inspection-stat-row">
          <span>Area</span>
          <span>{area.toFixed(4)} m&sup2;</span>
        </div>
        <div className="vm-inspection-stat-row">
          <span>Type</span>
          <span style={{ textTransform: 'capitalize' }}>{annotation.type}</span>
        </div>
      </div>

      {/* Thickness Stats */}
      {stats && (
        <div className="vm-inspection-section">
          <div className="vm-inspection-section-title">Thickness Statistics</div>
          <div
            className="vm-inspection-stat-row hoverable"
            onMouseEnter={() => onStatHover('min')}
            onMouseLeave={() => onStatHover(null)}
          >
            <span>Min</span>
            <span>{stats.min.toFixed(2)} mm</span>
          </div>
          <div
            className="vm-inspection-stat-row hoverable"
            onMouseEnter={() => onStatHover('max')}
            onMouseLeave={() => onStatHover(null)}
          >
            <span>Max</span>
            <span>{stats.max.toFixed(2)} mm</span>
          </div>
          <div className="vm-inspection-stat-row">
            <span>Avg</span>
            <span>{stats.avg.toFixed(2)} mm</span>
          </div>
          <div className="vm-inspection-stat-row">
            <span>StdDev</span>
            <span>{stats.stdDev.toFixed(3)} mm</span>
          </div>
          <div className="vm-inspection-stat-row">
            <span>Samples</span>
            <span>{stats.sampleCount.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Mini Heatmap */}
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">
          Heatmap Preview
          {heatmapColorScale && (
            <span
              style={{
                fontWeight: 400,
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.4)',
                marginLeft: 6,
              }}
            >
              ({heatmapColorScale})
            </span>
          )}
        </div>
        {overlappingComposite ? (
          <div
            ref={heatmapContainerRef}
            style={{
              height: 80,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          />
        ) : (
          <div
            style={{
              height: 80,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            No scan data
          </div>
        )}
      </div>

      {/* Placeholder: Attachments */}
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">Attachments</div>
        <div
          style={{
            height: 48,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.25)',
          }}
        >
          Coming soon
        </div>
      </div>

      {/* Navigation: Other annotations */}
      {otherAnnotations.length > 0 && (
        <div className="vm-inspection-section">
          <div className="vm-inspection-section-title">
            Other Annotations ({otherAnnotations.length})
          </div>
          {otherAnnotations.map(a => {
            const aColor = a.severityLevel
              ? SEVERITY_COLORS[a.severityLevel]
              : 'rgba(255,255,255,0.3)';
            return (
              <button
                key={a.id}
                onClick={() => onCycleToAnnotation(a.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'none';
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: aColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.thicknessStats && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#888' }}>
                    {a.thicknessStats.min.toFixed(1)} mm
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Threshold Controls */}
      <div className="vm-inspection-section" style={{ borderBottom: 'none' }}>
        <div className="vm-inspection-section-title">Thresholds</div>
        <ThresholdSection
          thresholds={thicknessThresholds}
          onUpdate={onUpdateThicknessThresholds}
        />
      </div>
    </div>
  );
}
