/**
 * FeatureComparisonTable — per-feature Target / Achieved / Δ / Status.
 *
 * Every number arrives pre-computed from `computeComparisonRows`, the ONE row
 * source shared with the modeler stats section and the printed report, and is
 * only formatted here (by the engine's own formatters, so the three surfaces
 * round identically). Untracked features stay listed, dimmed and dashed, and the
 * engine's rollup — not this component — decides they count for nothing.
 *
 * Row click frames the feature in the viewport; the chevron expands the rects
 * guiding it (technique + note). Those rects are GUIDANCE, never a measurement:
 * achieved % is measured against the feature, never against a rect.
 */

import { ChevronRight } from 'lucide-react';
import type { CoverageRectConfig, VesselState } from '../../VesselModeler/types';
import { COVERAGE_TECHNIQUES } from '../../VesselModeler/types';
import {
  formatCoverageDelta,
  formatCoveragePct,
  type ComparisonStatus,
  type FeatureComparisonRow,
} from '../../VesselModeler/engine/coverage-comparison';
import { rectsForFeature } from '../../VesselModeler/engine/coverage-rect-features';

const STATUS_TITLE: Record<ComparisonStatus, string> = {
  met: 'Target met',
  near: 'Within 5 points of target',
  short: 'More than 5 points short of target',
  untracked: 'No target set',
};

const DASH = '—';

function techniqueLabel(rect: CoverageRectConfig): string | null {
  if (!rect.technique) return null;
  if (rect.technique === 'other') return rect.techniqueOther?.trim() || 'Other';
  return COVERAGE_TECHNIQUES.find((t) => t.id === rect.technique)?.label ?? null;
}

interface FeatureComparisonTableProps {
  vesselState: VesselState;
  rows: FeatureComparisonRow[];
  /** Feature key currently framed in the viewport, if any. */
  selectedKey: string | null;
  /** Feature keys whose guidance rects are expanded. */
  expandedKeys: ReadonlySet<string>;
  onSelect: (row: FeatureComparisonRow) => void;
  onToggleExpand: (key: string) => void;
}

export function FeatureComparisonTable({
  vesselState,
  rows,
  selectedKey,
  expandedKeys,
  onSelect,
  onToggleExpand,
}: FeatureComparisonTableProps) {
  return (
    <div className="pj-cvg-table">
      <div className="pj-cvg-row pj-cvg-row--header">
        <span className="pj-cvg-expander" />
        <span className="pj-cvg-feature">Feature</span>
        <span className="pj-cvg-num">Target</span>
        <span className="pj-cvg-num">Achieved</span>
        <span className="pj-cvg-num">&Delta;</span>
        <span className="pj-cvg-dot-col" />
      </div>

      {rows.map((row) => {
        const untracked = row.status === 'untracked';
        const expanded = expandedKeys.has(row.key);
        const rects = expanded ? rectsForFeature(vesselState, row.ref) : [];

        return (
          <div key={row.key}>
            <div
              className={`pj-cvg-row${untracked ? ' pj-cvg-row--untracked' : ''}${
                selectedKey === row.key ? ' pj-cvg-row--selected' : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(row);
                }
              }}
              title={`Frame ${row.label} in the viewer`}
            >
              <button
                type="button"
                className={`pj-cvg-expander${expanded ? ' open' : ''}`}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Hide' : 'Show'} scope guidance for ${row.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(row.key);
                }}
              >
                <ChevronRight size={12} />
              </button>
              <span className="pj-cvg-feature" title={row.label}>
                {row.label}
              </span>
              <span className="pj-cvg-num">
                {row.targetPct === undefined ? DASH : `${formatCoveragePct(row.targetPct)}%`}
              </span>
              <span className="pj-cvg-num pj-cvg-num--achieved">
                {formatCoveragePct(row.achievedPct)}%
              </span>
              <span className="pj-cvg-num">
                {row.deltaPct === undefined ? DASH : formatCoverageDelta(row.deltaPct)}
              </span>
              <span className="pj-cvg-dot-col">
                <span
                  className={`pj-cvg-dot pj-cvg-dot--${row.status}`}
                  title={STATUS_TITLE[row.status]}
                />
              </span>
            </div>

            {expanded && (
              <div className="pj-cvg-rects">
                {rects.length === 0 ? (
                  <div className="pj-cvg-rect-empty">No scope guidance drawn on this feature</div>
                ) : (
                  rects.map((rect) => {
                    const technique = techniqueLabel(rect);
                    return (
                      <div key={rect.id} className="pj-cvg-rect">
                        <span className="pj-cvg-rect-name">{rect.name}</span>
                        <span className="pj-cvg-rect-technique">{technique ?? DASH}</span>
                        {rect.note && <span className="pj-cvg-rect-note">{rect.note}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
