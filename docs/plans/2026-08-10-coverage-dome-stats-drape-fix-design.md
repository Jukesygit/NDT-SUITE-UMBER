# Coverage Stats: Dome-End Drape Fix — Design

**Date:** 2026-08-10
**Status:** Approved (bug fix)
**Owner:** Fable (design) / opus agent (implementation)

## Bug

Coverage rects that touch a dome head are drawn as rigid geodesic drapes
(`annotation-geometry.ts` → `surface-drape.ts`), but the Coverage stats
(`engine/coverage-calculator.ts` `computeCoverage`) still model every rect as an
axis-aligned box in unwrapped `(axial pos × equator angle-span)` space. Two
compounding under-counts on the head:

1. **Axial vs arc:** the drape maps rect-width overhang past the tangent line as
   *meridian arc length* (reaching the apex at arc ≈ 1.2·R for a 2:1 head), while
   the stats treat it as *axial z* — cells past head depth `D` clamp to
   `ratio 0.999` and contribute ~zero area.
2. **Fixed angle-span:** the drape keeps the rect's *physical* lateral height on
   the surface (near the apex it wraps a large angular fraction,
   `h / 2πr(s)`), while the stats use the equator span `h/(π·ID)·360` everywhere.

Observed: a rect visually covering ~most of the right head reports 24.6%.
The small Shell increase is the rect legitimately straddling the tangent line
(the drape's cylinder branch is byte-identical to the box) — not a bug, but it
must stay exactly consistent after the fix.

## Fix — mirror the drape (project-wide rule: sampling must always mirror the overlay projection)

### New pure module: `engine/head-coverage.ts`

Overlap-aware covered area (mm²) on ONE head from a set of drape-routed rects.

- **Raster:** equal-physical-size cells over the head in `(s, θ)` space, where
  `s` = meridian arc from the tangent line (`0..apexArc`, from
  `buildMeridianProfile` / `arcFromAxial` in `dome-arc.ts`). Rows: fixed count
  along `s` (cell height `dsCell ≈ apexArc/96`, tune). Per row, θ cell count
  `nTheta = max(8, ceil(2π·r(s_mid)/dsCell))` — cells stay ~square in physical
  mm all the way to the pole.
- **Cell area (exact):** `dA = r(s_mid) · dθ · ds` (meridian-arc metric of a
  surface of revolution; summing a full row ≈ band area `∫2πr ds`).
- **Membership by splatting:** for each rect, build its drape grid via
  `buildDrapeGrid` (the SAME builder the visual uses) with cols/rows chosen so
  vertex spacing ≤ `dsCell/2` in both directions (cap segments, e.g. ≤ 512; the
  guarantee is "no holes at the raster resolution"). Every vertex whose `pos`
  lies on this head (classified via `arcFromAxial`: `s < 0` → left head,
  `s > L` → right head) marks its raster cell. Union across rects is automatic
  (a marked cell counts once) → overlap-aware.
- Pole crossing/reflection is inherited from `buildDrapeGrid` (vertices come
  back as valid `(pos, angleDeg)` surface coords).
- Pure, THREE-free, worker-safe (imports only `dome-arc.ts` + `surface-drape.ts`).

### `coverage-calculator.ts` changes

In `computeCoverage`, partition `mainRects` with **the exact geometry routing
predicate** `rectIsPureCylinder` (reuse from `engine/scan-sampling.ts`;
generalize its parameter type to the structural subset `{pos, width, bodyId}`
so `CoverageRectConfig` passes — do NOT re-derive the predicate):

- **Pure-cylinder rects:** existing compressed sweep, unchanged →
  models with only pure-cylinder rects stay byte-identical.
- **Head-touching rects:** their unwrapped boxes enter the SAME sweep but
  clamped to `pos ∈ [0, L]` (the drape's cylinder portion IS the box there, so
  Shell numbers are exact and overlap with pure-cylinder rects is handled by the
  one sweep). Their head contribution comes exclusively from
  `head-coverage.ts` — one raster per head, fed all head-touching rects.
  The old `ellipsoidCellArea` head branches never see drape-routed rects
  (no double count; regions are disjoint at the tangent line).

`ellipsoidCellArea` stays for region totals; head *totals* are unchanged.
`computeRegionTotalAreas` unchanged. Appendage end-closure coverage stays out of
scope (v1 rule: lateral cylinder only). Head-mounted nozzle/junction cutouts on
heads remain deferred (no footprint predicate on head cells — consistent with
the rest of the codebase).

### Consumers (no signature changes)

`stats/CoverageStatsSection.tsx` (settled snapshot, 250 ms — perf budget OK) and
`src/utils/coverage-calc.ts` (project page) pick the fix up automatically.

## Tests (engine/__tests__/head-coverage.test.ts + extend existing coverage tests)

1. **Full-cover oracle (corrected during implementation):** a POLE-CENTRED rect
   (centre meridian through the apex, width = 2·apexArc, full-wrap height) →
   head covered ∈ [97%, 100.5%] of the head total from
   `computeRegionTotalAreas`. A tangent-centred full-wrap rect is NOT a valid
   full-cover oracle: drape lateral edges are geodesics, and Clairaut's relation
   (r·sinψ = const) means they bounce away from the pole and dive onto the
   cylinder — such a rect genuinely covers only ~50% of a head, in stats and in
   the drawn drape alike (verified empirically: coverage grows smoothly with
   meridian overhang 8.7% → 20.7% → 35.1% → 50.3%; pole-centred = 100.0%).
2. **Union:** two identical head-touching rects ⇒ same covered area as one.
3. **Byte-identity:** a pure-cylinder rect set ⇒ results identical to the
   pre-change implementation (assert exact equality against the analytic
   cylinder value; existing coverage tests must pass unchanged).
4. **Seam consistency:** a straddling rect's Shell contribution equals the
   clamped-box sweep value exactly; no head/shell double count.
5. **Regression scenario:** rect covering the majority of a head (e.g. width
   overhang ≈ apexArc, height ≈ half circumference) reports far above the old
   box model — assert covered > 2× the old-model value and > 40% of head.
6. Apex-wrap sanity: covered is monotonic in rect height and never exceeds head
   total.

## Verification

`npx vitest run src/components/VesselModeler/engine` (all engine tests),
`npm run build`, `npm run lint` — evidence required before close.
