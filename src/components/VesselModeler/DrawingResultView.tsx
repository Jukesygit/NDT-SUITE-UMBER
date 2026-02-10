/**
 * DrawingResultView - Displays extracted vessel dimensions from a drawing
 * for user review before applying to the 3D model.
 */

import { Check } from 'lucide-react';
import type { ExtractionResult } from './engine/drawing-parser';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DrawingResultViewProps {
  result: ExtractionResult;
  onBack: () => void;
  onApply: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DrawingResultView({ result, onBack, onApply }: DrawingResultViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12, overflow: 'auto' }}>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)' }}>
        Review extracted dimensions. Click <strong>Apply</strong> to load into the modeler.
      </div>

      {/* Vessel dimensions */}
      <Section title="Vessel">
        <table style={{ width: '100%', fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', borderCollapse: 'collapse' }}>
          <tbody>
            <KVRow label="Inner Diameter" value={`${result.id} mm`} />
            <KVRow label="Tan-Tan Length" value={`${result.length} mm`} />
            <KVRow label="Head Ratio" value={`${result.headRatio}:1`} />
            <KVRow label="Orientation" value={result.orientation} />
          </tbody>
        </table>
      </Section>

      {/* Nozzles */}
      {result.nozzles.length > 0 && (
        <Section title={`Nozzles (${result.nozzles.length})`}>
          <table style={{ width: '100%', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Name', 'Pos (mm)', 'Proj (mm)', 'Angle', 'Size (mm)'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.nozzles.map((n, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {[n.name, n.pos, n.proj, `${n.angle}\u00B0`, n.size].map((v, j) => (
                    <td key={j} style={{ padding: '4px 8px' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Saddles */}
      {result.saddles.length > 0 && (
        <Section title={`Saddles (${result.saddles.length})`}>
          <table style={{ width: '100%', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['#', 'Position (mm)'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.saddles.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '4px 8px' }}>{i + 1}</td>
                  <td style={{ padding: '4px 8px' }}>{s.pos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Actions */}
      <div className="vm-form-buttons" style={{ marginTop: 'auto' }}>
        <button className="vm-btn" onClick={onBack}>Back</button>
        <button className="vm-btn vm-btn-success" onClick={onApply}>
          <Check size={14} /> Apply to Model
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vm-section" style={{ padding: 12, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'white' }}>{title}</h4>
      {children}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '3px 8px', color: 'rgba(255,255,255,0.5)' }}>{label}</td>
      <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-primary-400, #60a5fa)' }}>{value}</td>
    </tr>
  );
}
