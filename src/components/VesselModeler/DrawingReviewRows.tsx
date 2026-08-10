/**
 * DrawingReviewRows - presentational cells + dense tables for the compact GA
 * extraction review (design doc 2026-07-30, Phase E). Quiet-by-default: a cell
 * the model read cleanly looks normal; a missing cell gets a warning border +
 * "not read" placeholder; a low/flagged cell gets a danger border + flag
 * tooltip; a user-edited cell gets a success border. No per-field badges — the
 * confidence surfaces only where it matters, via a token-tinted cell border.
 */
import type { CSSProperties } from 'react';
import { Trash2 } from 'lucide-react';
import type { ExtractedValue, NozzleMount, NozzleOrientation } from './engine/drawing-parser';

export interface Cell {
  text: string;
  confidence: string;
  flags: string[];
  edited: boolean;
}
export type FieldKind = 'number' | 'text' | 'orientation' | 'mount' | 'nozzleOrientation';
export type CellStatus = 'ok' | 'missing' | 'flagged' | 'edited';
export interface NozzleCells {
  name: Cell;
  mount: Cell;
  orientation: Cell;
  pos: Cell;
  offset: Cell;
  elevation: Cell;
  proj: Cell;
  angle: Cell;
  size: Cell;
}
export type NozzleKey = keyof NozzleCells;

/** Human-readable text for verifier flag codes (rendered as a cell tooltip). */
export const FLAG_LABELS: Record<string, string> = {
  'out-of-range': 'Value is outside the plausible range',
  'non-standard-size': 'Not a standard nozzle bore size',
  'duplicate-tag': 'Duplicate nozzle tag',
  'unmatched-tag': 'Tag appears in only one view',
  'single-pass': 'Seen in only 1 of 3 extraction passes — verify against the drawing',
};

export const MOUNT_OPTIONS: { value: NozzleMount; label: string }[] = [
  { value: 'shell', label: 'Shell' },
  { value: 'head-left', label: 'Left head' },
  { value: 'head-right', label: 'Right head' },
];

export const ORIENT_OPTIONS: { value: NozzleOrientation; label: string }[] = [
  { value: 'radial', label: 'Radial' },
  { value: 'horizontal', label: 'Horizontal' },
];

// --- Cell seeding + resolution (no value is ever invented) ------------------

export const toCell = <T,>(ev: ExtractedValue<T>): Cell => ({
  text: ev.value === null || ev.value === undefined ? '' : String(ev.value),
  confidence: ev.confidence,
  flags: ev.flags,
  edited: false,
});
/** A user edit makes the field authoritative and clears its flag styling. */
export const editCell = (c: Cell, text: string): Cell => ({ ...c, text, edited: true, flags: [] });

export const parseNum = (t: string): number | null => {
  const n = Number(t);
  return t.trim() !== '' && Number.isFinite(n) ? n : null;
};
export const numResolved = (c: Cell) => parseNum(c.text) !== null;
export const nameResolved = (c: Cell) => c.text.trim() !== '';
export const orientResolved = (c: Cell) => c.text === 'horizontal' || c.text === 'vertical';
export const mountResolved = (c: Cell) =>
  c.text === 'shell' || c.text === 'head-left' || c.text === 'head-right';
export const isHeadMount = (c: Cell) => c.text === 'head-left' || c.text === 'head-right';
export const nozzleOrientResolved = (c: Cell) => c.text === 'radial' || c.text === 'horizontal';
export const isHorizontal = (c: Cell) => c.text === 'horizontal';
export const isResolved = (c: Cell, kind: FieldKind): boolean =>
  kind === 'orientation'
    ? orientResolved(c)
    : kind === 'nozzleOrientation'
      ? nozzleOrientResolved(c)
      : kind === 'mount'
        ? mountResolved(c)
        : kind === 'text'
          ? nameResolved(c)
          : numResolved(c);

export function cellStatus(c: Cell, resolved: boolean): CellStatus {
  if (!resolved) return 'missing';
  if (c.edited) return 'edited';
  if (c.confidence === 'low' || c.flags.length > 0) return 'flagged';
  return 'ok'; // high / medium read cleanly -> visually quiet
}
export const statusOf = (c: Cell, kind: FieldKind): CellStatus =>
  cellStatus(c, isResolved(c, kind));

const COMPACT: CSSProperties = { padding: '5px 7px', fontSize: '0.8rem' };
const TINT: Record<CellStatus, string | undefined> = {
  ok: undefined,
  missing: 'var(--color-warning)',
  flagged: 'var(--color-danger)',
  edited: 'var(--color-success)',
};
const cellStyle = (s: CellStatus): CSSProperties =>
  TINT[s] ? { ...COMPACT, borderColor: TINT[s] } : COMPACT;

// --- Cell field -------------------------------------------------------------

export function CellField({
  cell,
  kind,
  options,
  title,
  onChange,
}: {
  cell: Cell;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  title?: string;
  onChange: (t: string) => void;
}) {
  const resolved = isResolved(cell, kind);
  const status = cellStatus(cell, resolved);
  const flagTitle =
    status === 'flagged'
      ? cell.flags.length
        ? cell.flags.map((f) => FLAG_LABELS[f] ?? f).join('; ')
        : 'Low agreement between extraction passes'
      : undefined;
  const style = cellStyle(status);
  if (options) {
    return (
      <select
        className="vm-select"
        value={cell.text}
        style={style}
        title={flagTitle ?? title}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">not read from drawing</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="vm-input"
      type={kind === 'number' ? 'number' : 'text'}
      value={cell.text}
      style={style}
      title={flagTitle ?? title}
      placeholder={resolved ? undefined : 'not read from drawing'}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// --- Dense tables -----------------------------------------------------------

const TH = 'text-left font-medium px-1 pb-1';
const thStyle: CSSProperties = { color: 'var(--text-tertiary)', fontSize: '0.66rem' };
const RemoveBtn = ({ title, onClick }: { title: string; onClick: () => void }) => (
  <button
    className="vm-btn-icon"
    title={title}
    style={{ color: 'var(--color-danger)' }}
    onClick={onClick}
  >
    <Trash2 size={13} />
  </button>
);

export function NozzleTable({
  rows,
  onCell,
  onRemove,
}: {
  rows: { n: NozzleCells; i: number }[];
  onCell: (i: number, key: NozzleKey, text: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={TH} style={thStyle}>
            Tag
          </th>
          <th className={TH} style={thStyle}>
            Mount
          </th>
          <th
            className={TH}
            style={thStyle}
            title="Radial nozzle or side-facing horizontal (EL cluster)"
          >
            Orient
          </th>
          <th className={TH} style={thStyle}>
            Pos / Off (mm)
          </th>
          <th className={TH} style={thStyle}>
            Proj (mm)
          </th>
          <th
            className={TH}
            style={thStyle}
            title="Radial: degrees from top dead center (12 o'clock), increasing clockwise, as labelled in the end view. Horizontal: the side it faces (90 = right, 270 = left)."
          >
            Angle (° from top, CW)
          </th>
          <th
            className={TH}
            style={thStyle}
            title="Elevation from vessel centerline (signed mm) — horizontal nozzles only"
          >
            EL (mm)
          </th>
          <th className={TH} style={thStyle}>
            Size (mm)
          </th>
          <th className={TH} style={thStyle} />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ n, i }) => {
          const head = isHeadMount(n.mount);
          const horizontal = isHorizontal(n.orientation);
          const posKey: NozzleKey = head ? 'offset' : 'pos';
          const posTitle = head ? 'Offset from centerline (mm)' : 'Position from tan-line (mm)';
          return (
            <tr key={i}>
              <td className="p-0.5">
                <CellField cell={n.name} kind="text" onChange={(t) => onCell(i, 'name', t)} />
              </td>
              <td className="p-0.5">
                <CellField
                  cell={n.mount}
                  kind="mount"
                  options={MOUNT_OPTIONS}
                  onChange={(t) => onCell(i, 'mount', t)}
                />
              </td>
              <td className="p-0.5">
                <CellField
                  cell={n.orientation}
                  kind="nozzleOrientation"
                  options={ORIENT_OPTIONS}
                  onChange={(t) => onCell(i, 'orientation', t)}
                />
              </td>
              <td className="p-0.5">
                <CellField
                  cell={head ? n.offset : n.pos}
                  kind="number"
                  title={posTitle}
                  onChange={(t) => onCell(i, posKey, t)}
                />
              </td>
              <td className="p-0.5">
                <CellField cell={n.proj} kind="number" onChange={(t) => onCell(i, 'proj', t)} />
              </td>
              <td className="p-0.5">
                <CellField
                  cell={n.angle}
                  kind="number"
                  title={horizontal ? 'Facing side (90 = right, 270 = left)' : undefined}
                  onChange={(t) => onCell(i, 'angle', t)}
                />
              </td>
              <td className="p-0.5">
                {horizontal ? (
                  <CellField
                    cell={n.elevation}
                    kind="number"
                    title="EL from CL (signed mm)"
                    onChange={(t) => onCell(i, 'elevation', t)}
                  />
                ) : (
                  <span
                    style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}
                    title="Elevation applies to horizontal nozzles only"
                  >
                    —
                  </span>
                )}
              </td>
              <td className="p-0.5">
                <CellField cell={n.size} kind="number" onChange={(t) => onCell(i, 'size', t)} />
              </td>
              <td className="p-0.5 text-center">
                <RemoveBtn title="Remove nozzle" onClick={() => onRemove(i)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// --- Bulk angle rotation ----------------------------------------------------
// Escape hatch for drawings whose end view is taken from the opposite end or
// uses a non-standard zero. Values stay drawing-native (0 = top, clockwise);
// the single drawing→engine conversion still happens later in placeExtractedNozzle.
// A horizontal nozzle's angle is a FACING SIDE (90 = right / 270 = left), not a
// position, so the panel only lets 'mirror' touch it (90↔270 via 360−v) and
// skips +90/−90/180 for horizontal rows — those would corrupt the facing into a
// diagonal. This helper is facing-agnostic; the skip lives in the panel.

export type RotateAction = 90 | -90 | 180 | 'mirror';

/**
 * Bulk-adjust one drawing-native angle. +90/-90/180 add the delta; 'mirror'
 * reflects via (360 - v) (flips clockwise↔counter-clockwise for an opposite-end
 * view). Result is normalized to [0, 360).
 */
export function rotateAngleValue(v: number, action: RotateAction): number {
  const raw = action === 'mirror' ? 360 - v : v + action;
  return ((raw % 360) + 360) % 360;
}

export function RotateAllControl({ onRotate }: { onRotate: (a: RotateAction) => void }) {
  const Btn = ({
    label,
    action,
    title,
  }: {
    label: string;
    action: RotateAction;
    title: string;
  }) => (
    <button
      className="vm-toggle-btn"
      style={{ flex: 'none', width: 'auto', padding: '3px 8px', fontSize: '0.7rem' }}
      title={title}
      onClick={() => onRotate(action)}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.66rem' }}>Rotate all</span>
      <Btn label="+90°" action={90} title="Add 90° clockwise to every nozzle angle" />
      <Btn label="−90°" action={-90} title="Subtract 90° from every nozzle angle" />
      <Btn label="180°" action={180} title="Rotate every nozzle angle by 180°" />
      <Btn
        label="Mirror"
        action="mirror"
        title="Mirror every nozzle angle (flip clockwise/counter-clockwise for an opposite-end view)"
      />
    </div>
  );
}

export function SaddleTable({
  rows,
  onCell,
  onRemove,
}: {
  rows: { c: Cell; i: number }[];
  onCell: (i: number, text: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={TH} style={thStyle}>
            Saddle
          </th>
          <th className={TH} style={thStyle}>
            Position (mm)
          </th>
          <th className={TH} style={thStyle} />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ c, i }) => (
          <tr key={i}>
            <td
              className="p-0.5 whitespace-nowrap"
              style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}
            >
              Saddle {i + 1}
            </td>
            <td className="p-0.5">
              <CellField cell={c} kind="number" onChange={(t) => onCell(i, t)} />
            </td>
            <td className="p-0.5 text-center">
              <RemoveBtn title="Remove saddle" onClick={() => onRemove(i)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
