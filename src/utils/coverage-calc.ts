// =============================================================================
// Coverage Calculation Utility
// =============================================================================
// Shared coverage calculation logic used by ScopeSection and ScopeProgressCard.
// Extracts the coverage computation pipeline from ScopeSection so multiple
// consumers can compute coverage from vessel models and scan composites.
// =============================================================================

import { computeCoverage } from '../components/VesselModeler/engine/coverage-calculator';
import type { CoverageResult as EngineCoverageResult } from '../components/VesselModeler/engine/coverage-calculator';
import type { CoverageRectConfig, VesselState } from '../components/VesselModeler/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelGeometry {
  id: number;        // inner diameter mm
  length: number;    // tan-tan length mm
  headRatio: number;
}

export interface VesselModelWithGeometry {
  id: string;
  name: string;
  model_type?: string | null;
  updated_at: string;
  project_vessel_id: string | null;
  geometry: ModelGeometry | null;
  coverageRects: CoverageRectConfig[];
}

export interface CoverageCalcResult {
  shellAreaSqm: number | null;
  scopedAreaSqm: number;
  scopedPct: number;
  scanAreaSqm: number;
  achievedPct: number | null;
  regionBreakdown: EngineCoverageResult | null;
}

// Re-export for convenience
export type { CoverageRectConfig, EngineCoverageResult };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toVesselState(geo: ModelGeometry): VesselState {
  return { id: geo.id, length: geo.length, headRatio: geo.headRatio } as VesselState;
}

// ---------------------------------------------------------------------------
// Main calculation function
// ---------------------------------------------------------------------------

/**
 * Calculate coverage metrics from vessel models and scan composites.
 *
 * @param vesselModels - All vessel models available
 * @param vesselId - The vessel ID to filter models for
 * @param composites - Scan composites with stats (validArea in mm²)
 * @returns Coverage metrics including shell area, scoped area, achieved area, and region breakdown
 */
export function calculateCoverage(
  vesselModels: VesselModelWithGeometry[],
  vesselId: string,
  composites: { id: string; stats: any }[],
): CoverageCalcResult {
  // Find the coverage-tagged model for scoped coverage calculations
  const linkedModels = vesselModels.filter(
    m => m.project_vessel_id === vesselId && m.geometry != null,
  );
  const coverageModel =
    linkedModels.find(m => m.model_type === 'coverage') ?? linkedModels[0] ?? null;

  // Compute coverage from model geometry
  const regionBreakdown: EngineCoverageResult | null =
    coverageModel?.geometry
      ? computeCoverage(coverageModel.coverageRects ?? [], toVesselState(coverageModel.geometry))
      : null;

  const shellAreaSqm = regionBreakdown?.total.total ?? null;
  const scopedAreaSqm = regionBreakdown?.total.covered ?? 0;
  const scopedPct = regionBreakdown?.total.percent ?? 0;

  // Achieved scan area from composites — validArea = area with real thickness data
  let scanAreaSqm = 0;
  for (const comp of composites) {
    const s = comp.stats;
    if (s && typeof s === 'object' && typeof s.validArea === 'number' && s.validArea > 0) {
      scanAreaSqm += s.validArea / 1_000_000;
    }
  }

  const achievedPct =
    shellAreaSqm && shellAreaSqm > 0 && scanAreaSqm > 0
      ? (scanAreaSqm / shellAreaSqm) * 100
      : null;

  return {
    shellAreaSqm,
    scopedAreaSqm,
    scopedPct,
    scanAreaSqm,
    achievedPct,
    regionBreakdown,
  };
}
