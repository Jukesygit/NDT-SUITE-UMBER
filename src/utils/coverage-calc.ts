// =============================================================================
// Coverage Calculation Utility
// =============================================================================
// Shared coverage calculation logic used by ScopeSection and ScopeProgressCard.
// Extracts the coverage computation pipeline from ScopeSection so multiple
// consumers can compute coverage from vessel models and scan composites.
// =============================================================================

import { computeCoverage } from '../components/VesselModeler/engine/coverage-calculator';
import type { CoverageResult as EngineCoverageResult } from '../components/VesselModeler/engine/coverage-calculator';
import type {
  AppendageConfig,
  CoverageRectConfig,
  VesselState,
} from '../components/VesselModeler/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelGeometry {
  id: number;        // inner diameter mm
  length: number;    // tan-tan length mm
  headRatio: number;
  /** Appendage bodies (sumps/boots). Optional — legacy geometry omits it, in
   *  which case the calc behaves exactly as before (no cutout, no extra area). */
  appendages?: AppendageConfig[];
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
  // Pass appendages through so computeCoverage subtracts the junction cutout from
  // the main-shell area exactly as the modeler does (design §9.1). Absent → [].
  return {
    id: geo.id,
    length: geo.length,
    headRatio: geo.headRatio,
    appendages: geo.appendages ?? [],
  } as VesselState;
}

/** Total appendage lateral (coverable) area in m² for a model geometry. */
function appendageLateralAreaSqm(geo: ModelGeometry | null): number {
  if (!geo?.appendages) return 0;
  return geo.appendages.reduce(
    (sum, a) => sum + (2 * Math.PI * (a.diameter / 2) * a.length) / 1_000_000,
    0
  );
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

  // Coverable total = cutout-adjusted main shell + every appendage's lateral area
  // (design §9). Appendage scans already contribute to scanAreaSqm below, so the
  // denominator must include their surface or achieved % would overstate.
  const appendageArea = appendageLateralAreaSqm(coverageModel?.geometry ?? null);
  const shellAreaSqm =
    regionBreakdown != null ? regionBreakdown.total.total + appendageArea : null;
  const scopedAreaSqm = regionBreakdown?.total.covered ?? 0;
  const scopedPct =
    shellAreaSqm && shellAreaSqm > 0 ? (scopedAreaSqm / shellAreaSqm) * 100 : 0;

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
