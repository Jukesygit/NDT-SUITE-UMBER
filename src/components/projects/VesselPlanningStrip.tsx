/**
 * VesselPlanningStrip — a project vessel's planning status, inline:
 * model linked ✓/– · targets set N/M · achieved %
 * (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §3).
 *
 * The numbers are the Coverage section's numbers — `computeComparisonRows` via
 * `useVesselPlanningSummary` — so a list row and the section it links to can
 * never disagree. Untracked reads as a dash, never a 0% that would look like a
 * miss. This module deliberately imports NO coverage engine of its own: the hook
 * keeps that (and three.js with it) behind a dynamic import.
 */

import { useVesselPlanningSummary } from '../../hooks/queries/useVesselPlanningSummary';

interface VesselPlanningStripProps {
  projectVesselId: string;
}

export function VesselPlanningStrip({ projectVesselId }: VesselPlanningStripProps) {
  const { summary, isLoading, hasModel } = useVesselPlanningSummary(projectVesselId);

  if (isLoading) {
    return <span className="pj-plan-strip pj-plan-strip--loading">…</span>;
  }

  if (!hasModel || !summary) {
    return (
      <span className="pj-plan-strip">
        <span className="pj-plan-item pj-plan-item--muted" title="No 3D model is linked yet">
          No model
        </span>
      </span>
    );
  }

  return (
    <span className="pj-plan-strip">
      <span className="pj-plan-item pj-plan-item--ok" title="A 3D model is linked to this vessel">
        Model ✓
      </span>
      <span className="pj-plan-item" title="Feature instances carrying a target percentage">
        Targets {summary.tracked}/{summary.total}
      </span>
      <span
        className={`pj-plan-item${summary.short > 0 ? ' pj-plan-item--short' : ''}`}
        title={
          summary.achievedPct === null
            ? 'No targets set — nothing to measure against'
            : `Area-weighted achieved coverage over targeted features · ${summary.short} short of target`
        }
      >
        {summary.achievedText} achieved
      </span>
    </span>
  );
}
