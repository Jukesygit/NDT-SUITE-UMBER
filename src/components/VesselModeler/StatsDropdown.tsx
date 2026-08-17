import { useState, useRef, useEffect } from 'react';
import { BarChart3, ChevronDown, Check } from 'lucide-react';

interface StatsDropdownProps {
  showCoverage: boolean;
  showWallLoss: boolean;
  showScanCoverage: boolean;
  showComparison: boolean;
  hasCoverageData: boolean;
  hasWallLossData: boolean;
  onToggleCoverage: () => void;
  onToggleWallLoss: () => void;
  onToggleScanCoverage: () => void;
  onToggleComparison: () => void;
}

const items: { key: 'coverage' | 'wallLoss' | 'scanCoverage' | 'comparison'; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'wallLoss', label: 'Wall Loss' },
  { key: 'scanCoverage', label: 'Scan Coverage' },
  { key: 'comparison', label: 'Coverage vs Scope' },
];

export default function StatsDropdown({
  showCoverage,
  showWallLoss,
  showScanCoverage,
  showComparison,
  hasCoverageData,
  hasWallLossData,
  onToggleCoverage,
  onToggleWallLoss,
  onToggleScanCoverage,
  onToggleComparison,
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

  const anyActive = showCoverage || showWallLoss || showScanCoverage || showComparison;

  const toggleMap = {
    coverage: onToggleCoverage,
    wallLoss: onToggleWallLoss,
    scanCoverage: onToggleScanCoverage,
    comparison: onToggleComparison,
  };
  const checkedMap = {
    coverage: showCoverage,
    wallLoss: showWallLoss,
    scanCoverage: showScanCoverage,
    comparison: showComparison,
  };
  const hasDataMap = { coverage: hasCoverageData, wallLoss: hasWallLossData, scanCoverage: true, comparison: true };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''} ${anyActive ? 'vm-popout-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
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
