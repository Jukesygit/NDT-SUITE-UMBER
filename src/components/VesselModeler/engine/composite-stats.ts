// =============================================================================
// Vessel Modeler - Composite Stats Mapping
// =============================================================================
// Maps the stats object returned for a cloud/companion scan composite into the
// modeller's ScanCompositeConfig['stats'] shape.
//
// Why this exists: the persisted stats (scan_composites.stats) use the CScan
// shape (`stdDev`, plus `validArea`/`totalArea` in mm²), while the companion
// CompositeStats type uses `std` and omits area metrics. Earlier import code
// hand-mapped only {min,max,mean,median,stdDev} and dropped the area metrics,
// so the Scan Coverage "Achieved" column always read 0. This helper normalizes
// both shapes and preserves the area metrics that drive achieved coverage.
// =============================================================================

import type { ScanCompositeConfig } from '../types';

/** Superset of the two stats shapes a composite can arrive in. */
export interface RawCompositeStats {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  /** CScan / persisted shape */
  stdDev?: number;
  /** Companion shape */
  std?: number;
  /** Area with real thickness data, mm² */
  validArea?: number;
  /** Total scanned area, mm² */
  totalArea?: number;
}

export function toConfigStats(raw: RawCompositeStats): ScanCompositeConfig['stats'] {
  return {
    min: raw.min ?? 0,
    max: raw.max ?? 0,
    mean: raw.mean ?? 0,
    median: raw.median ?? raw.mean ?? 0,
    stdDev: raw.stdDev ?? raw.std ?? 0,
    validArea: raw.validArea,
    totalArea: raw.totalArea,
  };
}
