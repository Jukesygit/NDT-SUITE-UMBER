// =============================================================================
// Vessel Modeler — Circumferential Coordinate Conventions (single source)
// =============================================================================
// THE one place the vessel's two circumferential angle systems and the datum
// handedness math live. Every 3D-side and flattened-view module that maps a scan
// datum onto the shell consumes these helpers — no module re-derives `+ 90`,
// `- 90`, a `normAngle`, or a cw/ccw scan-offset branch inline. This is the
// root-cause fix for the twice-regressed TDC ±90 scar (see the Decision Log
// entries dated 2026-06-22, "Flattened (2D) View Circumferential Convention" —
// the scar came from call sites hand-rolling the datum→vessel conversion and
// disagreeing about whether/where the +90 was applied).
//
// ── The two angle systems ────────────────────────────────────────────────────
//
//   USER / DATUM convention  (0° = TDC)
//     • What a scan composite's `datumAngleDeg` field stores, what the datum
//       gizmo label and the sidebar datum input show, and what the user reads as
//       "12 o'clock = 0°". Increases the same way the scan is walked.
//     • Persisted on ScanCompositeConfig / DomeScanConfig.
//
//   VESSEL / CLOCK convention  (90° = TDC)
//     • What geometry `.angle` fields store (nozzle / weld / saddle / lug), the
//       angle `body-frame.ts` / `surfacePoint` consume, and the angle the
//       flattened view's `angleToCircumMm` expects. 0° = 3 o'clock, 90° = TDC
//       (12 o'clock), CCW-positive.
//
//   The ONLY difference between them is a +90° rotation. `datumToVesselAngle`
//   adds it; `vesselToDatumAngle` removes it. Nothing else may spell `+ 90` /
//   `- 90` on a datum angle.
//
// ── Scan handedness (cw / ccw) ───────────────────────────────────────────────
//
//   A scan is walked around the shell from its datum meridian either clockwise
//   (`cw`) or counter-clockwise (`ccw`). Two mutually-inverse mappings, both
//   taking the datum ALREADY in vessel convention:
//     • `scanArcDeg`        vessel angle → arc distance (deg) walked from datum,
//                           normalized into [0, 360). (sampling / overlap tests)
//     • `scanAngleFromArcDeg`  arc distance (deg) from datum → vessel angle,
//                           NOT normalized (callers wrap only where they did
//                           before). (geometry building — texture, gizmo, bins)
//
// ── Purity ───────────────────────────────────────────────────────────────────
//
//   No THREE / DOM imports. Safe for the wall-loss Web Worker bundle (which
//   imports this module directly, alongside junction-footprint.ts).
// =============================================================================

/** Circumferential scan-walk handedness around the shell from the datum. */
export type ScanDirection = 'cw' | 'ccw';

/** Normalise an angle (degrees) into the [0, 360) range. */
export function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * USER/DATUM angle (0° = TDC) → VESSEL/CLOCK angle (90° = TDC).
 *
 * This is the notorious `+ 90`. It lives HERE and nowhere else. Returned raw
 * (un-normalised) so trig callers stay byte-identical to the historical
 * `datumAngleDeg + 90`; wrap with {@link normAngle} where the call site did.
 */
export function datumToVesselAngle(datumAngleDeg: number): number {
  return datumAngleDeg + 90;
}

/**
 * VESSEL/CLOCK angle (90° = TDC) → USER/DATUM angle (0° = TDC).
 *
 * The inverse of {@link datumToVesselAngle} — the `- 90`. Returned raw; wrap
 * with {@link normAngle} where the call site did.
 */
export function vesselToDatumAngle(vesselAngleDeg: number): number {
  return vesselAngleDeg - 90;
}

/**
 * VESSEL/CLOCK angle (90° = TDC) → circumferential arc length (mm) measured from
 * TDC (y = 0), increasing clockwise, wrapped into [0, circumference).
 *
 * The arc-length primitive behind the flattened view's `angleToCircumMm`:
 *   circumMm = ((90 − angleDeg) / 360) × circumference
 * Feed a datum angle by first converting it with {@link datumToVesselAngle}.
 */
export function vesselAngleToCircumMm(vesselAngleDeg: number, circumferenceMm: number): number {
  const raw = ((90 - vesselAngleDeg) / 360) * circumferenceMm;
  return ((raw % circumferenceMm) + circumferenceMm) % circumferenceMm;
}

/**
 * VESSEL/CLOCK angle → arc distance (degrees) walked along the scan from the
 * datum, normalized into [0, 360).
 *
 * `datumVesselAngleDeg` is the datum ALREADY in vessel convention (i.e.
 * `datumToVesselAngle(datumAngleDeg)`, usually pre-normalised by the caller).
 * The handedness branch the review found duplicated across scan-sampling,
 * annotation-heatmap, wall-loss-compute, report-image-capture and
 * CompanionScanSection lives here:
 *   cw  → datum − angle,   ccw → angle − datum,   both normalized to [0, 360).
 */
export function scanArcDeg(
  datumVesselAngleDeg: number,
  vesselAngleDeg: number,
  scanDirection: ScanDirection,
): number {
  const raw =
    scanDirection === 'cw'
      ? datumVesselAngleDeg - vesselAngleDeg
      : vesselAngleDeg - datumVesselAngleDeg;
  return normAngle(raw);
}

/**
 * Arc distance (degrees) walked along the scan from the datum → VESSEL/CLOCK
 * angle. The exact inverse of {@link scanArcDeg}, returned RAW (un-normalised)
 * so geometry-building callers (texture-manager, scan-gizmo-geometry,
 * wall-loss-compute cell mapping) stay byte-identical; wrap with
 * {@link normAngle} only where the call site did.
 *   cw  → datum − arc,   ccw → datum + arc.
 */
export function scanAngleFromArcDeg(
  datumVesselAngleDeg: number,
  arcDeg: number,
  scanDirection: ScanDirection,
): number {
  return scanDirection === 'cw' ? datumVesselAngleDeg - arcDeg : datumVesselAngleDeg + arcDeg;
}
