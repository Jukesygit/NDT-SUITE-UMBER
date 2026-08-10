import { useState, useRef, useEffect } from 'react';
import { Scissors, ChevronDown, Check, ArrowLeftRight } from 'lucide-react';
import type { ClipConfig, ClipMode } from './engine/clip-planes';

interface ClipPlanesControlProps {
  clip: ClipConfig;
  /** Tan-tan length in mm. */
  lengthMm: number;
  /** Inner diameter in mm. */
  diameterMm: number;
  /** Ellipsoidal head depth in mm (0 for flat/open ends). */
  headDepthMm: number;
  /** Merge a partial change into ui.clip (SET_CLIP). */
  onChange: (patch: Partial<ClipConfig>) => void;
}

const MODES: { mode: ClipMode; label: string; title: string }[] = [
  {
    mode: 'transverse',
    label: 'Transverse',
    title: 'Cut across the vessel, sliding along its axis',
  },
  {
    mode: 'longitudinal-h',
    label: 'Length-H',
    title: 'Lengthwise cut through the axis, offset toward the top',
  },
  {
    mode: 'longitudinal-v',
    label: 'Length-V',
    title: 'Lengthwise cut through the axis, offset sideways',
  },
];

/** Never let the slider collapse to a zero-width range on a degenerate vessel. */
const MIN_RANGE_MM = 100;

/**
 * Offset limit (mm, symmetric) for a mode: a transverse cut travels the whole
 * vessel including both heads; a lengthwise cut only needs to clear the radius,
 * plus a small margin so the plane can be parked fully outside the shell.
 */
function offsetLimit(mode: ClipMode, lengthMm: number, diameterMm: number, headDepthMm: number) {
  const limit = mode === 'transverse' ? lengthMm / 2 + headDepthMm : (diameterMm / 2) * 1.2;
  return Math.max(Math.round(limit), MIN_RANGE_MM);
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Section-cut dropdown for the actions cluster (BookmarksDropdown pattern):
 * enable toggle, cut mode, offset slider + mm input, flip, and an optional plane
 * helper. All state lives in `ui.clip` (transient — never serialized, no history);
 * this component only emits partial patches.
 */
export default function ClipPlanesControl({
  clip,
  lengthMm,
  diameterMm,
  headDepthMm,
  onChange,
}: ClipPlanesControlProps) {
  const [open, setOpen] = useState(false);
  // Draft keeps a half-typed value (e.g. "-") in the mm box instead of snapping back.
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const limit = offsetLimit(clip.mode, lengthMm, diameterMm, headDepthMm);

  const setOffset = (value: number) => {
    if (!Number.isFinite(value)) return;
    onChange({ offsetMm: clamp(value, limit) });
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''} ${clip.enabled ? 'vm-popout-trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={clip.enabled ? `Section cut on — ${clip.offsetMm} mm` : 'Section cut'}
      >
        <Scissors size={14} />
        Section
        <ChevronDown size={12} className={`vm-popout-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="vm-popout-panel">
          <button
            className="vm-stats-toggle-item"
            onClick={() => onChange({ enabled: !clip.enabled })}
            role="switch"
            aria-checked={clip.enabled}
          >
            <span className={`vm-stats-toggle-check ${clip.enabled ? 'checked' : ''}`}>
              {clip.enabled && <Check size={10} />}
            </span>
            Enable section cut
          </button>

          <div className="vm-toolbar-segmented" style={{ margin: '6px 0' }}>
            {MODES.map(({ mode, label, title }) => (
              <button
                key={mode}
                className={`vm-toolbar-segmented__btn ${clip.mode === mode ? 'active' : ''}`}
                onClick={() => {
                  const nextLimit = offsetLimit(mode, lengthMm, diameterMm, headDepthMm);
                  setDraft(null);
                  onChange({ mode, offsetMm: clamp(clip.offsetMm, nextLimit) });
                }}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="vm-snap-slider">
            <div className="vm-snap-slider-head">
              <span>Offset</span>
              <span className="vm-snap-value">{clip.offsetMm} mm</span>
            </div>
            <div className="vm-slider-input-row">
              <input
                type="range"
                className="vm-slider"
                min={-limit}
                max={limit}
                step={1}
                value={clip.offsetMm}
                onChange={(e) => {
                  setDraft(null);
                  setOffset(Number(e.target.value));
                }}
                aria-label="Section offset"
                aria-valuetext={`${clip.offsetMm} mm`}
              />
              <input
                type="number"
                className="vm-input"
                min={-limit}
                max={limit}
                step={1}
                value={draft ?? String(clip.offsetMm)}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setOffset(Number(e.target.value));
                }}
                onBlur={() => setDraft(null)}
                aria-label="Section offset in mm"
              />
            </div>
          </div>

          <button className="vm-popout-item" onClick={() => onChange({ flip: !clip.flip })}>
            <ArrowLeftRight size={13} />
            {clip.flip ? 'Keep near half' : 'Keep far half'}
          </button>

          <button
            className="vm-stats-toggle-item"
            onClick={() => onChange({ showHelper: !clip.showHelper })}
            role="switch"
            aria-checked={clip.showHelper}
          >
            <span className={`vm-stats-toggle-check ${clip.showHelper ? 'checked' : ''}`}>
              {clip.showHelper && <Check size={10} />}
            </span>
            Show cut plane
          </button>
        </div>
      )}
    </div>
  );
}
