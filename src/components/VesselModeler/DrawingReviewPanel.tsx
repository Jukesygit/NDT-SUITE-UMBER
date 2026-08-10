/**
 * DrawingReviewPanel - Compact, editable review of a voted GA-drawing extraction
 * (design doc 2026-07-30, Phase E). Vessel scalars are one dense row; nozzles and
 * saddles are one row each in dense tables (see DrawingReviewRows). Confidence is
 * quiet-by-default — only missing/low/flagged/edited cells are tinted. An
 * aggregate header ("X of Y read cleanly — N need attention") plus a "show issues
 * only" filter keep 20+-nozzle drawings scannable.
 *
 * Apply is gated until every gate-relevant field has a value: mount always
 * counts; radialOffset counts only when that row's mount is a head (the shell
 * sentinel never gates). Switching a mount re-evaluates gating. On apply the
 * edited state (user edits authoritative) converts via toExtractionResult.
 */
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  toExtractionResult,
  type ExtractedValue,
  type ExtractionResult,
  type ExtractionReview,
  type NozzleMount,
  type NozzleOrientation,
} from './engine/drawing-parser';
import type { Orientation } from './types';
import {
  CellField,
  NozzleTable,
  SaddleTable,
  RotateAllControl,
  rotateAngleValue,
  toCell,
  editCell,
  parseNum,
  numResolved,
  nameResolved,
  orientResolved,
  mountResolved,
  isHeadMount,
  nozzleOrientResolved,
  isHorizontal,
  statusOf,
  type Cell,
  type FieldKind,
  type NozzleCells,
  type NozzleKey,
  type RotateAction,
} from './DrawingReviewRows';

interface DrawingReviewPanelProps {
  review: ExtractionReview;
  onApply: (result: ExtractionResult) => void;
  onBack: () => void;
  onError?: (message: string) => void;
}

type ScalarKey = 'id' | 'length' | 'headRatio' | 'orientation';
interface EditState {
  id: Cell;
  length: Cell;
  headRatio: Cell;
  orientation: Cell;
  nozzles: NozzleCells[];
  saddles: Cell[];
}

const ORIENT_OPTIONS = [
  { value: 'horizontal', label: 'horizontal' },
  { value: 'vertical', label: 'vertical' },
];

// --- State seeding + conversion (no value is ever invented) ----------------

function initState(r: ExtractionReview): EditState {
  return {
    id: toCell(r.id),
    length: toCell(r.length),
    headRatio: toCell(r.headRatio),
    orientation: toCell(r.orientation),
    nozzles: r.nozzles.map((n) => ({
      name: toCell(n.name),
      mount: toCell(n.mount),
      orientation: toCell(n.nozzleOrientation),
      pos: toCell(n.pos),
      offset: toCell(n.radialOffset),
      elevation: toCell(n.elevation),
      proj: toCell(n.proj),
      angle: toCell(n.angle),
      size: toCell(n.size),
    })),
    saddles: r.saddles.map((s) => toCell(s.pos)),
  };
}

const evNum = (c: Cell): ExtractedValue<number> => ({
  value: parseNum(c.text),
  confidence: numResolved(c) ? 'high' : 'missing',
  flags: [],
});
const evName = (c: Cell): ExtractedValue<string> => ({
  value: nameResolved(c) ? c.text.trim() : null,
  confidence: nameResolved(c) ? 'high' : 'missing',
  flags: [],
});
const evOrient = (c: Cell): ExtractedValue<Orientation> => ({
  value: orientResolved(c) ? (c.text as Orientation) : null,
  confidence: orientResolved(c) ? 'high' : 'missing',
  flags: [],
});
const evMount = (c: Cell): ExtractedValue<NozzleMount> => ({
  value: mountResolved(c) ? (c.text as NozzleMount) : null,
  confidence: mountResolved(c) ? 'high' : 'missing',
  flags: [],
});
const evNozzleOrient = (c: Cell): ExtractedValue<NozzleOrientation> => ({
  value: nozzleOrientResolved(c) ? (c.text as NozzleOrientation) : null,
  confidence: nozzleOrientResolved(c) ? 'high' : 'missing',
  flags: [],
});
/** Non-gating sentinel for a shell nozzle's (absent) centerline offset. */
const noOffset = (): ExtractedValue<number> => ({ value: null, confidence: 'high', flags: [] });
/** Non-gating sentinel for a radial nozzle's (absent) elevation. */
const noElevation = (): ExtractedValue<number> => ({ value: null, confidence: 'high', flags: [] });

function buildReview(s: EditState): ExtractionReview {
  return {
    id: evNum(s.id),
    length: evNum(s.length),
    headRatio: evNum(s.headRatio),
    orientation: evOrient(s.orientation),
    nozzles: s.nozzles.map((n) => {
      const head = isHeadMount(n.mount);
      const horizontal = isHorizontal(n.orientation);
      // toExtractionResult requires pos for every nozzle, but placement computes a
      // head nozzle's pos from its offset and discards any extracted pos. So a head
      // mount passes its read pos if present, else the offset as a non-null
      // placeholder (never shown, discarded downstream). Shell mounts (radial or
      // horizontal) keep pos — a horizontal shell nozzle's axial pos is used.
      const pos: ExtractedValue<number> =
        head && !numResolved(n.pos)
          ? { value: parseNum(n.offset.text), confidence: 'high', flags: [] }
          : evNum(n.pos);
      return {
        name: evName(n.name),
        pos,
        proj: evNum(n.proj),
        angle: evNum(n.angle),
        size: evNum(n.size),
        mount: evMount(n.mount),
        radialOffset: head ? evNum(n.offset) : noOffset(),
        nozzleOrientation: evNozzleOrient(n.orientation),
        elevation: horizontal ? evNum(n.elevation) : noElevation(),
      };
    }),
    saddles: s.saddles.map((p) => ({ pos: evNum(p) })),
  };
}

/** The gate-relevant position family for a nozzle: offset for a head mount, pos otherwise. */
const posCellOf = (n: NozzleCells): Cell => (isHeadMount(n.mount) ? n.offset : n.pos);

function unresolvedCount(s: EditState): number {
  let n = 0;
  for (const c of [s.id, s.length, s.headRatio]) if (!numResolved(c)) n++;
  if (!orientResolved(s.orientation)) n++;
  for (const nz of s.nozzles) {
    if (!nameResolved(nz.name)) n++;
    if (!mountResolved(nz.mount)) n++;
    if (!nozzleOrientResolved(nz.orientation)) n++;
    if (!numResolved(posCellOf(nz))) n++;
    // Elevation gates only for a horizontal nozzle (mirrors the head/offset rule).
    if (isHorizontal(nz.orientation) && !numResolved(nz.elevation)) n++;
    for (const c of [nz.proj, nz.angle, nz.size]) if (!numResolved(c)) n++;
  }
  for (const c of s.saddles) if (!numResolved(c)) n++;
  return n;
}

// --- Aggregate + issue filtering --------------------------------------------

interface Summary {
  total: number;
  clean: number;
  attention: number;
}
function summarize(s: EditState): Summary {
  let total = 0,
    clean = 0,
    attention = 0;
  const acc = (c: Cell, kind: FieldKind) => {
    total++;
    const st = statusOf(c, kind);
    if (st === 'missing' || st === 'flagged') attention++;
    else if (st === 'ok') clean++;
  };
  acc(s.id, 'number');
  acc(s.length, 'number');
  acc(s.headRatio, 'number');
  acc(s.orientation, 'orientation');
  for (const n of s.nozzles) {
    acc(n.name, 'text');
    acc(n.mount, 'mount');
    acc(n.orientation, 'nozzleOrientation');
    acc(posCellOf(n), 'number');
    if (isHorizontal(n.orientation)) acc(n.elevation, 'number');
    acc(n.proj, 'number');
    acc(n.angle, 'number');
    acc(n.size, 'number');
  }
  for (const c of s.saddles) acc(c, 'number');
  return { total, clean, attention };
}

/** A row needs review when any of its gate cells is not a clean read. */
function nozzleNeedsReview(n: NozzleCells): boolean {
  const cells: [Cell, FieldKind][] = [
    [n.name, 'text'],
    [n.mount, 'mount'],
    [n.orientation, 'nozzleOrientation'],
    [posCellOf(n), 'number'],
    [n.proj, 'number'],
    [n.angle, 'number'],
    [n.size, 'number'],
  ];
  if (isHorizontal(n.orientation)) cells.push([n.elevation, 'number']);
  return cells.some(([c, k]) => statusOf(c, k) !== 'ok');
}

// --- Local presentational bits ----------------------------------------------

function ScalarCell({
  label,
  cell,
  kind,
  options,
  onChange,
}: {
  label: string;
  cell: Cell;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  onChange: (t: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span
        className="uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)', fontSize: '0.64rem' }}
      >
        {label}
      </span>
      <CellField cell={cell} kind={kind} options={options} onChange={onChange} />
    </label>
  );
}

const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1">
    <span
      className="inline-block w-2.5 h-2.5 rounded-sm"
      style={{ border: `1px solid ${color}`, background: color }}
    />
    {label}
  </span>
);

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded p-2.5 flex flex-col gap-2"
      style={{ background: 'var(--glass-bg-secondary)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.8rem] font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
          {title} <span style={{ color: 'var(--text-tertiary)' }}>({count})</span>
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

const EmptyNote = ({ text }: { text: string }) => (
  <div className="text-[0.75rem]" style={{ color: 'var(--text-tertiary)' }}>
    {text}
  </div>
);

// --- Component --------------------------------------------------------------

export default function DrawingReviewPanel({
  review,
  onApply,
  onBack,
  onError,
}: DrawingReviewPanelProps) {
  const [state, setState] = useState<EditState>(() => initState(review));
  const [issuesOnly, setIssuesOnly] = useState(false);
  const unresolved = useMemo(() => unresolvedCount(state), [state]);
  const summary = useMemo(() => summarize(state), [state]);
  const canApply = unresolved === 0;
  const showToggle = summary.attention > 0;
  const filterOn = issuesOnly && showToggle;

  const setScalar = (key: ScalarKey, text: string) =>
    setState((s) => ({ ...s, [key]: editCell(s[key], text) }));
  const setNozzle = (i: number, key: NozzleKey, text: string) =>
    setState((s) => ({
      ...s,
      nozzles: s.nozzles.map((n, j) => (j === i ? { ...n, [key]: editCell(n[key], text) } : n)),
    }));
  const removeNozzle = (i: number) =>
    setState((s) => ({ ...s, nozzles: s.nozzles.filter((_, j) => j !== i) }));
  // Bulk-rotate every parseable angle cell (drawing-native), marking each edited.
  // Missing/unparseable angles are skipped (stay missing). A horizontal nozzle's
  // angle is a facing side (90/270), not a position: only 'mirror' may touch it
  // (swaps 90↔270 via 360−v); +90/−90/180 skip it so the facing is never
  // corrupted into a diagonal.
  const rotateAllAngles = (action: RotateAction) =>
    setState((s) => ({
      ...s,
      nozzles: s.nozzles.map((n) => {
        if (isHorizontal(n.orientation) && action !== 'mirror') return n;
        const v = parseNum(n.angle.text);
        return v === null
          ? n
          : { ...n, angle: editCell(n.angle, String(rotateAngleValue(v, action))) };
      }),
    }));
  const setSaddle = (i: number, text: string) =>
    setState((s) => ({
      ...s,
      saddles: s.saddles.map((p, j) => (j === i ? editCell(p, text) : p)),
    }));
  const removeSaddle = (i: number) =>
    setState((s) => ({ ...s, saddles: s.saddles.filter((_, j) => j !== i) }));

  const handleApply = () => {
    try {
      onApply(toExtractionResult(buildReview(state)));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not build result');
    }
  };

  const nozzleRows = state.nozzles
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !filterOn || nozzleNeedsReview(n));
  const saddleRows = state.saddles
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !filterOn || statusOf(c, 'number') !== 'ok');

  return (
    <div className="flex flex-col flex-1 overflow-auto p-4 gap-3">
      {/* Aggregate header + issue filter */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.8rem]" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)' }}>
            {summary.clean} of {summary.total}
          </span>{' '}
          fields read cleanly
          {summary.attention > 0 && (
            <>
              {' '}
              &mdash;{' '}
              <span style={{ color: 'var(--color-warning)' }}>
                {summary.attention} need attention
              </span>
            </>
          )}
        </div>
        {showToggle && (
          <button
            className={`vm-toggle-btn ${issuesOnly ? 'active' : ''}`}
            style={{ flex: 'none', width: 'auto', padding: '4px 10px' }}
            aria-pressed={issuesOnly}
            onClick={() => setIssuesOnly((v) => !v)}
          >
            Show issues only
          </button>
        )}
      </div>

      {/* Tint legend */}
      <div
        className="flex items-center gap-3 flex-wrap"
        style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem' }}
      >
        <Swatch color="var(--color-warning)" label="not read" />
        <Swatch color="var(--color-danger)" label="check value" />
        <Swatch color="var(--color-success)" label="your edit" />
      </div>

      {/* Vessel scalars (always visible) */}
      <div
        className="rounded p-2.5 grid grid-cols-4 gap-2"
        style={{ background: 'var(--glass-bg-secondary)' }}
      >
        <ScalarCell
          label="Inner O (mm)"
          cell={state.id}
          kind="number"
          onChange={(t) => setScalar('id', t)}
        />
        <ScalarCell
          label="Tan-Tan (mm)"
          cell={state.length}
          kind="number"
          onChange={(t) => setScalar('length', t)}
        />
        <ScalarCell
          label="Head ratio"
          cell={state.headRatio}
          kind="number"
          onChange={(t) => setScalar('headRatio', t)}
        />
        <ScalarCell
          label="Orientation"
          cell={state.orientation}
          kind="orientation"
          options={ORIENT_OPTIONS}
          onChange={(t) => setScalar('orientation', t)}
        />
      </div>

      {/* Nozzles */}
      <Section
        title="Nozzles"
        count={state.nozzles.length}
        action={
          state.nozzles.length > 0 ? <RotateAllControl onRotate={rotateAllAngles} /> : undefined
        }
      >
        {state.nozzles.length === 0 ? (
          <EmptyNote text="No nozzles were read from the drawing." />
        ) : nozzleRows.length === 0 ? (
          <EmptyNote text="No nozzles need attention." />
        ) : (
          <div className="overflow-x-auto">
            <NozzleTable rows={nozzleRows} onCell={setNozzle} onRemove={removeNozzle} />
          </div>
        )}
      </Section>

      {/* Saddles */}
      <Section title="Saddles" count={state.saddles.length}>
        {state.saddles.length === 0 ? (
          <EmptyNote text="No saddles were read from the drawing." />
        ) : saddleRows.length === 0 ? (
          <EmptyNote text="No saddles need attention." />
        ) : (
          <SaddleTable rows={saddleRows} onCell={setSaddle} onRemove={removeSaddle} />
        )}
      </Section>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-white/[0.06] flex flex-col gap-2">
        {!canApply && (
          <span className="text-[0.72rem]" style={{ color: 'var(--text-tertiary)' }}>
            {unresolved} field{unresolved === 1 ? '' : 's'} still need a value before you can apply.
          </span>
        )}
        <div className="flex gap-2">
          <button className="vm-btn flex-1" onClick={onBack}>
            Back
          </button>
          <button
            className="vm-btn vm-btn-success flex-1"
            disabled={!canApply}
            style={{ opacity: canApply ? 1 : 0.4 }}
            title={canApply ? undefined : 'Fill every missing field to enable apply'}
            onClick={handleApply}
          >
            <Check size={14} /> Apply to Model
          </button>
        </div>
      </div>
    </div>
  );
}
