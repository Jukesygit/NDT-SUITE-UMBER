// =============================================================================
// ReportExportSection — Sidebar panel for PAUT report generation
// =============================================================================

import { useState } from 'react';
import { FileDown, Check, Loader2 } from 'lucide-react';
import type { VesselState } from '../types';
import { SubSection } from './SliderRow';

export interface ReportExportSectionProps {
  vesselState: VesselState;
  onUpdateAnnotation: (id: number, updates: { includeInReport?: boolean }) => void;
  onGenerateReport: () => Promise<void>;
}

type GenerationPhase =
  | 'idle'
  | 'capturing-overviews'
  | 'capturing-annotations'
  | 'fetching-scans'
  | 'building-document'
  | 'done'
  | 'error';

const PHASE_LABELS: Record<GenerationPhase, string> = {
  idle: '',
  'capturing-overviews': 'Capturing vessel views...',
  'capturing-annotations': 'Capturing annotation images...',
  'fetching-scans': 'Fetching scan data from companion...',
  'building-document': 'Building Word document...',
  done: 'Report downloaded!',
  error: 'Error generating report',
};

export function ReportExportSection({
  vesselState,
  onUpdateAnnotation,
  onGenerateReport,
}: ReportExportSectionProps) {
  const [phase, setPhase] = useState<GenerationPhase>('idle');

  const scanAnnotations = vesselState.annotations.filter(a => a.type === 'scan');
  const reportAnnotations = scanAnnotations.filter(a => a.includeInReport);

  const selectAll = () => {
    for (const a of scanAnnotations) {
      if (!a.includeInReport) onUpdateAnnotation(a.id, { includeInReport: true });
    }
  };

  const selectNone = () => {
    for (const a of scanAnnotations) {
      if (a.includeInReport) onUpdateAnnotation(a.id, { includeInReport: false });
    }
  };

  const handleGenerate = async () => {
    if (reportAnnotations.length === 0 && vesselState.scanComposites.length === 0) return;
    try {
      setPhase('building-document');
      await onGenerateReport();
      setPhase('done');
      setTimeout(() => setPhase('idle'), 3000);
    } catch {
      setPhase('error');
      setTimeout(() => setPhase('idle'), 5000);
    }
  };

  const isGenerating = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  return (
    <SubSection title="Report Export" count={reportAnnotations.length}>
      {/* Annotation selection */}
      {scanAnnotations.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="vm-btn" onClick={selectAll} style={{ flex: 1, fontSize: '0.75rem' }}>
              Select All
            </button>
            <button className="vm-btn" onClick={selectNone} style={{ flex: 1, fontSize: '0.75rem' }}>
              Select None
            </button>
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
            {scanAnnotations.map(a => (
              <label
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  fontSize: '0.8rem',
                  color: '#ccc',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={a.includeInReport ?? false}
                  onChange={e => onUpdateAnnotation(a.id, { includeInReport: e.target.checked })}
                />
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.thicknessStats && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888' }}>
                    {a.thicknessStats.min.toFixed(1)}mm
                  </span>
                )}
              </label>
            ))}
          </div>
        </>
      )}

      {/* Summary */}
      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
        <div>{reportAnnotations.length} scan annotation{reportAnnotations.length !== 1 ? 's' : ''} selected</div>
        <div>{vesselState.annotations.filter(a => a.type === 'restriction').length} restriction{vesselState.annotations.filter(a => a.type === 'restriction').length !== 1 ? 's' : ''}</div>
        <div>{vesselState.scanComposites.filter(s => s.orientationConfirmed).length} scan composite{vesselState.scanComposites.length !== 1 ? 's' : ''} in log</div>
        <div>{vesselState.inspectionImages.length} photograph{vesselState.inspectionImages.length !== 1 ? 's' : ''}</div>
        <div>{(vesselState.referenceDrawings ?? []).length} reference drawing{(vesselState.referenceDrawings ?? []).length !== 1 ? 's' : ''}</div>
      </div>

      {/* Status */}
      {phase !== 'idle' && (
        <div style={{
          padding: '6px 10px',
          marginBottom: 8,
          borderRadius: 4,
          fontSize: '0.75rem',
          background: phase === 'error' ? 'rgba(239,68,68,0.15)' : phase === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
          color: phase === 'error' ? '#ef4444' : phase === 'done' ? '#22c55e' : '#ccc',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {isGenerating && <Loader2 size={14} className="animate-spin" />}
          {phase === 'done' && <Check size={14} />}
          {PHASE_LABELS[phase]}
        </div>
      )}

      {/* Generate button */}
      <button
        className="vm-btn vm-btn-primary"
        onClick={handleGenerate}
        disabled={isGenerating || (reportAnnotations.length === 0 && vesselState.scanComposites.length === 0)}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <FileDown size={14} />
        {isGenerating ? 'Generating...' : 'Generate PAUT Report'}
      </button>
    </SubSection>
  );
}
