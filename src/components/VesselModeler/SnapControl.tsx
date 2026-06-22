import { useState, useRef, useEffect } from 'react';
import { Magnet, ChevronDown, Check } from 'lucide-react';

interface SnapControlProps {
  /** Whether angle snapping is currently enabled */
  enabled: boolean;
  /** Current snap increment in degrees */
  snapDeg: number;
  /** Toggle snapping on/off */
  onToggle: () => void;
  /** Change the snap increment (always one of PRESETS) */
  onChangeDeg: (deg: number) => void;
}

/**
 * Preset snap increments. All divide 360 evenly so there is no uneven step
 * across the 0°/360° seam.
 */
const PRESETS = [1, 5, 10, 15, 30, 45, 90];

/**
 * Top-right HUD control for angle snapping. Clicking the trigger opens a popout
 * with an enable toggle and a slider that steps through the preset increments.
 * Snapping applies to dragged nozzles and lifting lugs only.
 */
export default function SnapControl({ enabled, snapDeg, onToggle, onChangeDeg }: SnapControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const idx = Math.max(0, PRESETS.indexOf(snapDeg));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''} ${enabled ? 'vm-popout-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={enabled ? `Angle snap on — ${snapDeg}°` : 'Angle snap off'}
      >
        <Magnet size={14} />
        {enabled ? `Snap · ${snapDeg}°` : 'Snap'}
        <ChevronDown size={12} className={`vm-popout-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="vm-popout-panel">
          <button
            className="vm-stats-toggle-item"
            onClick={onToggle}
            role="switch"
            aria-checked={enabled}
          >
            <span className={`vm-stats-toggle-check ${enabled ? 'checked' : ''}`}>
              {enabled && <Check size={10} />}
            </span>
            Enable angle snap
          </button>
          <div className="vm-snap-slider">
            <div className="vm-snap-slider-head">
              <span>Increment</span>
              <span className="vm-snap-value">{snapDeg}°</span>
            </div>
            <input
              type="range"
              className="vm-slider"
              min={0}
              max={PRESETS.length - 1}
              step={1}
              value={idx}
              onChange={e => onChangeDeg(PRESETS[Number(e.target.value)])}
              aria-label="Snap increment"
              aria-valuetext={`${snapDeg}°`}
            />
            <div className="vm-snap-ticks">
              {PRESETS.map(p => (
                <span key={p} className={p === snapDeg ? 'active' : ''}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
