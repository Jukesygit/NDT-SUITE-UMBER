/**
 * DrawingReviewPanel - Editable review of a voted GA-drawing extraction.
 *
 * Every vessel scalar and every nozzle/saddle field is an inline input seeded
 * from the voted ExtractionReview, carrying a per-field confidence badge. A
 * user-edited field is authoritative (clears its missing/flag styling). Apply is
 * gated until no field is still missing; on apply the edited state is converted
 * to the legacy ExtractionResult via toExtractionResult (see design doc
 * 2026-07-30-ga-drawing-import-hardening-design.md, Phase B).
 */
import { useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import {
  toExtractionResult,
  type ExtractedValue, type ExtractionResult, type ExtractionReview, type FieldConfidence,
} from './engine/drawing-parser';
import type { Orientation } from './types';

interface DrawingReviewPanelProps {
  review: ExtractionReview;
  onApply: (result: ExtractionResult) => void;
  onBack: () => void;
  onError?: (message: string) => void;
}

/** Human-readable text for verifier flag codes (rendered as badge tooltip). */
const FLAG_LABELS: Record<string, string> = {
  'out-of-range': 'Value is outside the plausible range',
  'non-standard-size': 'Not a standard nozzle bore size',
  'duplicate-tag': 'Duplicate nozzle tag',
  'unmatched-tag': 'Tag appears in only one view',
};

type FieldKind = 'number' | 'text' | 'orientation';
interface Cell { text: string; confidence: FieldConfidence; flags: string[]; edited: boolean; }
interface NozzleCells { name: Cell; pos: Cell; proj: Cell; angle: Cell; size: Cell; }
interface EditState {
  id: Cell; length: Cell; headRatio: Cell; orientation: Cell;
  nozzles: NozzleCells[]; saddles: Cell[];
}
type ScalarKey = 'id' | 'length' | 'headRatio' | 'orientation';

// --- State seeding + conversion (no value is ever invented) ----------------

const toCell = <T,>(ev: ExtractedValue<T>): Cell => ({
  text: ev.value === null || ev.value === undefined ? '' : String(ev.value),
  confidence: ev.confidence, flags: ev.flags, edited: false,
});

function initState(r: ExtractionReview): EditState {
  return {
    id: toCell(r.id), length: toCell(r.length), headRatio: toCell(r.headRatio), orientation: toCell(r.orientation),
    nozzles: r.nozzles.map((n) => ({
      name: toCell(n.name), pos: toCell(n.pos), proj: toCell(n.proj), angle: toCell(n.angle), size: toCell(n.size),
    })),
    saddles: r.saddles.map((s) => toCell(s.pos)),
  };
}

/** A user edit makes the field authoritative and clears its flag styling. */
const editCell = (c: Cell, text: string): Cell => ({ ...c, text, edited: true, flags: [] });

const parseNum = (t: string): number | null => {
  const n = Number(t);
  return t.trim() !== '' && Number.isFinite(n) ? n : null;
};
const numResolved = (c: Cell) => parseNum(c.text) !== null;
const nameResolved = (c: Cell) => c.text.trim() !== '';
const orientResolved = (c: Cell) => c.text === 'horizontal' || c.text === 'vertical';
const isResolved = (c: Cell, kind: FieldKind) =>
  kind === 'orientation' ? orientResolved(c) : kind === 'text' ? nameResolved(c) : numResolved(c);

const evNum = (c: Cell): ExtractedValue<number> =>
  ({ value: parseNum(c.text), confidence: numResolved(c) ? 'high' : 'missing', flags: [] });
const evName = (c: Cell): ExtractedValue<string> =>
  ({ value: nameResolved(c) ? c.text.trim() : null, confidence: nameResolved(c) ? 'high' : 'missing', flags: [] });
const evOrient = (c: Cell): ExtractedValue<Orientation> =>
  ({ value: orientResolved(c) ? (c.text as Orientation) : null, confidence: orientResolved(c) ? 'high' : 'missing', flags: [] });

const buildReview = (s: EditState): ExtractionReview => ({
  id: evNum(s.id), length: evNum(s.length), headRatio: evNum(s.headRatio), orientation: evOrient(s.orientation),
  nozzles: s.nozzles.map((n) => ({ name: evName(n.name), pos: evNum(n.pos), proj: evNum(n.proj), angle: evNum(n.angle), size: evNum(n.size) })),
  saddles: s.saddles.map((p) => ({ pos: evNum(p) })),
});

function unresolvedCount(s: EditState): number {
  let n = 0;
  for (const c of [s.id, s.length, s.headRatio]) if (!numResolved(c)) n++;
  if (!orientResolved(s.orientation)) n++;
  for (const nz of s.nozzles) { if (!nameResolved(nz.name)) n++; for (const c of [nz.pos, nz.proj, nz.angle, nz.size]) if (!numResolved(c)) n++; }
  for (const c of s.saddles) if (!numResolved(c)) n++;
  return n;
}

// --- Presentational sub-components ------------------------------------------

function ConfidenceBadge({ cell, resolved }: { cell: Cell; resolved: boolean }) {
  if (!resolved) return <span className="badge badge--warning">not read</span>;
  if (cell.edited) return <span className="badge badge--success">edited</span>;
  if (cell.confidence === 'high') return <span className="badge badge--neutral">high</span>;
  if (cell.confidence === 'medium') return <span className="badge badge--warning">medium</span>;
  const title = cell.flags.length ? cell.flags.map((f) => FLAG_LABELS[f] ?? f).join('; ') : 'Low agreement between extraction passes';
  return <span className="badge badge--danger" title={title}>low</span>;
}

function ScalarField({ label, cell, kind, onChange }: { label: string; cell: Cell; kind: FieldKind; onChange: (t: string) => void }) {
  const resolved = isResolved(cell, kind);
  const warn = resolved ? undefined : { borderColor: 'var(--color-warning)' };
  return (
    <div className="flex flex-col">
      <div className="vm-label"><span>{label}</span><ConfidenceBadge cell={cell} resolved={resolved} /></div>
      {kind === 'orientation' ? (
        <select className="vm-select" value={cell.text} style={warn} onChange={(e) => onChange(e.target.value)}>
          <option value="">not read from drawing</option>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      ) : (
        <input className="vm-input" type={kind === 'number' ? 'number' : 'text'} value={cell.text} style={warn}
          placeholder={resolved ? undefined : 'not read from drawing'} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'var(--glass-bg-secondary)' }}>
      <h4 className="text-[0.85rem] font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{title}</h4>
      {children}
    </div>
  );
}

const EmptyNote = ({ text }: { text: string }) => (
  <div className="text-[0.75rem]" style={{ color: 'var(--text-tertiary)' }}>{text}</div>
);

// --- Component --------------------------------------------------------------

export default function DrawingReviewPanel({ review, onApply, onBack, onError }: DrawingReviewPanelProps) {
  const [state, setState] = useState<EditState>(() => initState(review));
  const unresolved = useMemo(() => unresolvedCount(state), [state]);
  const canApply = unresolved === 0;

  const setScalar = (key: ScalarKey, text: string) => setState((s) => ({ ...s, [key]: editCell(s[key], text) }));
  const setNozzle = (i: number, key: keyof NozzleCells, text: string) =>
    setState((s) => ({ ...s, nozzles: s.nozzles.map((n, j) => (j === i ? { ...n, [key]: editCell(n[key], text) } : n)) }));
  const removeNozzle = (i: number) => setState((s) => ({ ...s, nozzles: s.nozzles.filter((_, j) => j !== i) }));
  const setSaddle = (i: number, text: string) => setState((s) => ({ ...s, saddles: s.saddles.map((p, j) => (j === i ? editCell(p, text) : p)) }));
  const removeSaddle = (i: number) => setState((s) => ({ ...s, saddles: s.saddles.filter((_, j) => j !== i) }));

  const handleApply = () => {
    try { onApply(toExtractionResult(buildReview(state))); }
    catch (err) { onError?.(err instanceof Error ? err.message : 'Could not build result'); }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto p-4 gap-3">
      <div className="text-[0.8rem]" style={{ color: 'var(--text-tertiary)' }}>
        Review and edit the extracted values. Fields marked{' '}
        <span className="badge badge--warning">not read</span> were not found on the drawing and must be
        filled before applying. Edited values are authoritative.
      </div>

      <ReviewSection title="Vessel">
        <ScalarField label="Inner Diameter (mm)" cell={state.id} kind="number" onChange={(t) => setScalar('id', t)} />
        <ScalarField label="Tan-Tan Length (mm)" cell={state.length} kind="number" onChange={(t) => setScalar('length', t)} />
        <ScalarField label="Head Ratio" cell={state.headRatio} kind="number" onChange={(t) => setScalar('headRatio', t)} />
        <ScalarField label="Orientation" cell={state.orientation} kind="orientation" onChange={(t) => setScalar('orientation', t)} />
      </ReviewSection>

      <ReviewSection title={`Nozzles (${state.nozzles.length})`}>
        {state.nozzles.length === 0 ? <EmptyNote text="No nozzles were read from the drawing." /> : state.nozzles.map((n, i) => (
          <div key={i} className="rounded p-2 flex flex-col gap-2" style={{ background: 'var(--glass-bg-primary)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[0.7rem] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Nozzle {i + 1}</span>
              <button className="vm-btn-icon" style={{ color: 'var(--color-danger)' }} title="Remove nozzle" onClick={() => removeNozzle(i)}><Trash2 size={14} /></button>
            </div>
            <ScalarField label="Tag" cell={n.name} kind="text" onChange={(t) => setNozzle(i, 'name', t)} />
            <div className="grid grid-cols-2 gap-2">
              <ScalarField label="Position (mm)" cell={n.pos} kind="number" onChange={(t) => setNozzle(i, 'pos', t)} />
              <ScalarField label="Projection (mm)" cell={n.proj} kind="number" onChange={(t) => setNozzle(i, 'proj', t)} />
              <ScalarField label="Angle (deg)" cell={n.angle} kind="number" onChange={(t) => setNozzle(i, 'angle', t)} />
              <ScalarField label="Size (mm)" cell={n.size} kind="number" onChange={(t) => setNozzle(i, 'size', t)} />
            </div>
          </div>
        ))}
      </ReviewSection>

      <ReviewSection title={`Saddles (${state.saddles.length})`}>
        {state.saddles.length === 0 ? <EmptyNote text="No saddles were read from the drawing." /> : state.saddles.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1"><ScalarField label={`Saddle ${i + 1} position (mm)`} cell={s} kind="number" onChange={(t) => setSaddle(i, t)} /></div>
            <button className="vm-btn-icon" style={{ color: 'var(--color-danger)' }} title="Remove saddle" onClick={() => removeSaddle(i)}><Trash2 size={14} /></button>
          </div>
        ))}
      </ReviewSection>

      <div className="mt-auto pt-3 border-t border-white/[0.06] flex flex-col gap-2">
        {!canApply && (
          <span className="text-[0.72rem]" style={{ color: 'var(--text-tertiary)' }}>
            {unresolved} field{unresolved === 1 ? '' : 's'} still need a value before you can apply.
          </span>
        )}
        <div className="flex gap-2">
          <button className="vm-btn flex-1" onClick={onBack}>Back</button>
          <button className="vm-btn vm-btn-success flex-1" disabled={!canApply} style={{ opacity: canApply ? 1 : 0.4 }}
            title={canApply ? undefined : 'Fill every missing field to enable apply'} onClick={handleApply}>
            <Check size={14} /> Apply to Model
          </button>
        </div>
      </div>
    </div>
  );
}
