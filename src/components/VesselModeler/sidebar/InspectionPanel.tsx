// =============================================================================
// InspectionPanel - Right-side overlay for annotation inspection mode
// =============================================================================
// Displays detailed annotation metadata, thickness stats, and navigation
// when the user enters inspection mode on an annotation shape.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronLeft, Upload, X } from 'lucide-react';
import type { AnnotationShapeConfig, AnnotationShapeType, ThicknessThresholds, VesselState } from '../types';
import {
  createAnnotationHeatmapCanvas,
  findOverlappingComposite,
} from '../engine/annotation-heatmap';
import { ThresholdSection } from './ThresholdSection';
import CompanionScanSection from './CompanionScanSection';

interface InspectionPanelProps {
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  onClose: () => void;
  onCycleToAnnotation: (id: number) => void;
  onToggleStatLine: (stat: 'min' | 'max') => void;
  visibleStatLines: { min: boolean; max: boolean };
  thicknessThresholds?: ThicknessThresholds;
  onUpdateThicknessThresholds: (thresholds: ThicknessThresholds) => void;
  onCaptureViewport: () => void;
  onUploadImage: (file: File) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  getImageUrl: (storagePath: string) => string;
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
function computeArea(_type: AnnotationShapeType, width: number, height: number): number {
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
  onToggleStatLine,
  visibleStatLines,
  thicknessThresholds,
  onUpdateThicknessThresholds,
  onCaptureViewport,
  onUploadImage,
  onDeleteAttachment,
  getImageUrl,
}: InspectionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
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
            onClick={() => onToggleStatLine('min')}
            style={{ opacity: visibleStatLines.min ? 1 : 0.5, borderLeft: visibleStatLines.min ? '3px solid #ef4444' : '3px solid transparent' }}
          >
            <span>Min</span>
            <span>{stats.min.toFixed(2)} mm</span>
          </div>
          <div
            className="vm-inspection-stat-row hoverable"
            onClick={() => onToggleStatLine('max')}
            style={{ opacity: visibleStatLines.max ? 1 : 0.5, borderLeft: visibleStatLines.max ? '3px solid #22c55e' : '3px solid transparent' }}
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

      {/* Detailed Scan Data (Companion App) */}
      <CompanionScanSection
        annotation={annotation}
        composite={overlappingComposite}
        vesselState={vesselState}
        onViewImage={setViewingImageUrl}
      />

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

      {/* Attachments */}
      <div className="vm-inspection-section">
        <div className="vm-inspection-section-title">
          Attachments
          {annotation.attachments && annotation.attachments.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
              ({annotation.attachments.length})
            </span>
          )}
        </div>

        {/* Thumbnail grid */}
        {annotation.attachments && annotation.attachments.length > 0 && (
          <div className="vm-inspection-attachments-grid">
            {annotation.attachments.map(att => (
              <div
                key={att.id}
                className="vm-inspection-thumbnail"
                onClick={() => setViewingImageUrl(getImageUrl(att.storagePath))}
                title={att.type === 'viewport-capture' ? 'Viewport capture' : 'Uploaded image'}
              >
                <img src={getImageUrl(att.storagePath)} alt={att.type} />
                <button
                  className="vm-inspection-thumbnail-delete"
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteAttachment(att.id);
                  }}
                  title="Delete attachment"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCaptureViewport}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
            title="Capture current viewport as image"
          >
            <Camera size={14} /> Capture
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
            title="Upload an image file"
          >
            <Upload size={14} /> Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUploadImage(file);
              e.target.value = '';
            }}
          />
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
      {/* Image lightbox — rendered via portal to escape backdrop-filter containing block */}
      {viewingImageUrl && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.85)', cursor: 'pointer' }}
          onClick={() => setViewingImageUrl(null)}
        >
          <img
            src={viewingImageUrl}
            alt="Attachment"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 6, objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setViewingImageUrl(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
