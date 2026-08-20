/**
 * useVesselPlanningSummary — the three planning facts a project vessel row
 * shows: model linked · targets set N/M · achieved %
 * (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §3).
 *
 * CHUNKING: the numbers come from the coverage engine, whose chunk group also
 * carries three.js, so the derivation happens INSIDE the query function behind a
 * dynamic import. That keeps the projects page chunk free of the 3D engine —
 * components import this hook, never `coverage-comparison` — while a vessel that
 * actually has a linked model still pays only a lazy fetch of a chunk the
 * Coverage section would load anyway.
 *
 * It layers on `useLinkedVesselModel`'s cache entry rather than fetching again,
 * so a row strip and the Coverage section share one model read, and it never
 * asks for textures: the comparison is texture-blind.
 */

import { useQuery } from '@tanstack/react-query';
import type { VesselState } from '../../components/VesselModeler/types';
import type { VesselPlanningDescription } from '../../components/projects/vessel-planning-summary';
import { useLinkedVesselModel } from './useLinkedVesselModel';

const STALE_TIME_MS = 5 * 60 * 1000;

export interface UseVesselPlanningSummaryResult {
  /** null until the model resolves, or when the vessel has no linked model. */
  summary: VesselPlanningDescription | null;
  /** True while the model or its summary is still resolving. */
  isLoading: boolean;
  /** True once we know this vessel has no usable linked model. */
  hasModel: boolean;
}

async function summarize(vesselState: VesselState): Promise<VesselPlanningDescription> {
  const [{ computeComparisonRows }, { describePlanning }] = await Promise.all([
    import('../../components/VesselModeler/engine/coverage-comparison'),
    import('../../components/projects/vessel-planning-summary'),
  ]);
  return describePlanning(computeComparisonRows(vesselState));
}

export function useVesselPlanningSummary(
  projectVesselId: string | null | undefined
): UseVesselPlanningSummaryResult {
  const { record, vesselState, isLoading: modelLoading } = useLinkedVesselModel(projectVesselId);

  const summaryQuery = useQuery({
    // Keyed on the model row's identity + mtime: a re-saved model recomputes,
    // an unchanged one is served from cache across every row that shows it.
    queryKey: [
      'linkedVesselModel',
      projectVesselId,
      'planningSummary',
      record?.id,
      record?.updated_at,
    ],
    queryFn: () => summarize(vesselState!),
    enabled: !!vesselState,
    staleTime: STALE_TIME_MS,
  });

  return {
    summary: summaryQuery.data ?? null,
    isLoading: modelLoading || (!!vesselState && summaryQuery.isLoading),
    hasModel: !!vesselState,
  };
}
