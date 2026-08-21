import { useState, useRef, useEffect } from 'react';
import { BarChart3, ChevronDown, Check } from 'lucide-react';

interface StatsDropdownProps {
  /** The ONE merged coverage section (RBA · Scoped · Achieved · Δ). */
  showCoverage: boolean;
  showWallLoss: boolean;
  hasWallLossData: boolean;
  onToggleCoverage: () => void;
  onToggleWallLoss: () => void;
}

// Coverage has no data gate: the merged section reports achieved coverage and
// manual targets too, so it is meaningful on a vessel with no rects drawn yet.
const items: { key: 'coverage' | 'wallLoss'; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'wallLoss', label: 'Wall Loss' },
];

export default function StatsDropdown({
  showCoverage,
  showWallLoss,
  hasWallLossData,
  onToggleCoverage,
  onToggleWallLoss,
}: StatsDropdownProps) {
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

  const anyActive = showCoverage || showWallLoss;

  const toggleMap = {
    coverage: onToggleCoverage,
    wallLoss: onToggleWallLoss,
  };
  const checkedMap = {
    coverage: showCoverage,
    wallLoss: showWallLoss,
  };
  const hasDataMap = { coverage: true, wallLoss: hasWallLossData };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''} ${anyActive ? 'vm-popout-trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <BarChart3 size={14} />
        Stats
        <ChevronDown size={12} className={`vm-popout-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="vm-popout-panel">
          {items.map(({ key, label }) => (
            <button
              key={key}
              className={`vm-stats-toggle-item ${!hasDataMap[key] ? 'vm-stats-toggle-item--no-data' : ''}`}
              onClick={() => toggleMap[key]()}
            >
              <span className={`vm-stats-toggle-check ${checkedMap[key] ? 'checked' : ''}`}>
                {checkedMap[key] && <Check size={10} />}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
