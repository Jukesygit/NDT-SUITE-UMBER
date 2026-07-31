import type { CscanData, CscanStats } from '../../CscanVisualizer/types';
import type { ScanCompositeConfig } from '../types';
import { DEFAULT_SURFACE_OPTIONS } from '../../TopologyViewer/types';
import type { SurfaceOptions } from '../../TopologyViewer/types';

// ---------------------------------------------------------------------------
// Relief view data adapter
//
// Maps a Vessel Modeler ScanCompositeConfig into the TopologyViewer engine's
// input shape (CscanData) so the relief/elevation surface can be built with the
// exact same processing as the standalone /topology page — no forked math.
//
// Grid orientation is a DIRECT pass-through (no transpose):
//   - rows (data.length)      = index axis  = yAxis (longitudinal, mm)
//   - columns (data[r].length) = scan axis   = xAxis (circumferential, mm)
// This is the modeler's own convention: texture-manager.ts
// (buildFootprintExcludeMask) maps row → yAxis[row], col → xAxis[col]; and it
// matches the TopologyViewer surface builder (buildTopologySurface places
// X = xAxis[col], Z = yAxis[row]). mm scaling is already baked into xAxis/yAxis
// (both are absolute mm coordinates), so the adapter never rescales — it is the
// authoritative source of physical distance for measurement truth.
// ---------------------------------------------------------------------------

/** Minimum grid size the surface builder can triangulate (decimation-safe). */
const MIN_RELIEF_DIM = 2;

/**
 * True when the composite carries a loaded thickness matrix large enough to
 * build a relief surface. Composites are always cylindrical (dome scans live in
 * a separate `domeScanComposites` array), so this is the only gate the relief
 * button needs.
 */
export function hasReliefGrid(sc: ScanCompositeConfig): boolean {
  return (
    Array.isArray(sc.data) &&
    sc.data.length >= MIN_RELIEF_DIM &&
    Array.isArray(sc.data[0]) &&
    sc.data[0].length >= MIN_RELIEF_DIM
  );
}

/**
 * Convert a placed scan composite into a CscanData for the topology engine.
 *
 * `sc.stats` is authoritative for min/max/mean/median/stdDev (the modeler
 * pre-computes them on import); the null/ND point counts are derived straight
 * from the grid so the adapter stays self-consistent and unit-testable.
 */
export function compositeToCscanData(sc: ScanCompositeConfig): CscanData {
  const rows = sc.data.length;
  const cols = rows > 0 ? sc.data[0].length : 0;

  let validPoints = 0;
  for (let r = 0; r < rows; r++) {
    const row = sc.data[r];
    for (let c = 0; c < cols; c++) {
      if (row[c] != null) validPoints++;
    }
  }
  const totalPoints = rows * cols;
  const ndCount = totalPoints - validPoints;

  const stats: CscanStats = {
    min: sc.stats.min,
    max: sc.stats.max,
    mean: sc.stats.mean,
    median: sc.stats.median,
    stdDev: sc.stats.stdDev,
    validPoints,
    totalPoints,
    totalArea: sc.stats.totalArea ?? 0,
    validArea: sc.stats.validArea ?? 0,
    ndPercent: totalPoints > 0 ? (ndCount / totalPoints) * 100 : 0,
    ndCount,
    ndArea: 0,
  };

  return {
    id: sc.id,
    filename: sc.name,
    width: cols, // scan-axis samples (xAxis)
    height: rows, // index-axis samples (yAxis)
    data: sc.data, // pass-through, no transpose
    xAxis: sc.xAxis, // scan axis, mm
    yAxis: sc.yAxis, // index axis, mm
    stats,
    isComposite: true,
  };
}

/**
 * Seed SurfaceOptions for the relief view.
 *
 * Palette (colorScale + range) is carried over from the composite so the relief
 * coloring matches the flat scan overlay the modeler already renders. Every
 * geometry-affecting option (denoise, gap fill, decimation, exaggeration,
 * nominal) stays at the TopologyViewer defaults — OFF / true-scale — so the
 * relief agrees byte-for-byte with the standalone page and applies no silent
 * smoothing.
 */
export function reliefSurfaceOptions(sc: ScanCompositeConfig): SurfaceOptions {
  return {
    ...DEFAULT_SURFACE_OPTIONS,
    colorScale: sc.colorScale || DEFAULT_SURFACE_OPTIONS.colorScale,
    rangeMin: sc.rangeMin,
    rangeMax: sc.rangeMax,
  };
}
