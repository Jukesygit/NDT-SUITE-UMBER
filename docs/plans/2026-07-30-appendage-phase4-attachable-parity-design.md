# Appendage Bodies — Phase 4: Attachable Parity (Design Addendum)

**Date:** 2026-07-30
**Parent design:** `2026-07-21-secondary-appendage-body-design.md` (§17 named these follow-ups)
**Prereqs landed:** Phase 2 (bodyId on nozzles/scans), Phase 3 (`3d099a5` cutouts, `80401d1` per-body stats), T1b unified sampler (in flight — its body parameter is the sampling seam this phase plugs into).
**Goal:** every attachable that works on the main shell works on an appendage body: welds, annotations, lifting lugs, coverage rects, and dome scans on the appendage end closure.

## Shared mechanics (all attachables)

- **`bodyId?: string`** added to `WeldConfig`, `AnnotationShapeConfig`, `LiftingLugConfig`, `CoverageRectConfig`, `DomeScanConfig` — `undefined` = main shell, value = `AppendageConfig.id`. The Phase-2 invariant holds: `bodyId === undefined` routes through byte-identical legacy paths (golden-regression per attachable).
- **Frames:** all placement/drag/label math resolves through `resolveBodyFrame(state, bodyId)` (`engine/body-frame.ts`). Positions are mm along the appendage axis measured from the main-shell outer surface (same convention as appendage nozzles); angles use the appendage datum (0° = main +axis projection) with the uniform +90° TDC offset rule applied via the existing helpers — never hand-rolled.
- **UI:** each sidebar section (Weld, Annotation, Lifting Lug, Coverage) gains the same "Mount on" picker `NozzleSection.tsx:116-132` established. Position/angle field labels adapt to the mounted body's dimensions (clamp pos to appendage length).
- **Cascade:** `engine/appendage-cascade.ts` extends to strip welds/annotations/lugs/coverage rects/dome scans carrying the deleted appendage's `bodyId` (tests per type).
- **Serialization:** every new field is declared ONLY in `engine/vessel-serialization-spec.ts`; round-trip tests extend the existing spec-driven suite. Appendage dome scans persist to cloud with the Phase-2 convention `section_type = 'appendage:<id>'` (dome scans already carry `cloudId`; the section derivation must include the bodyId branch).

## Per-attachable notes

1. **Welds** — circ welds render as rings at `pos` along the appendage axis; long welds run axially at `angle` in the appendage datum. Geometry mirrors the main-shell weld builder with frame-transformed placement.
   *Stretch (separate toggleable item, may defer):* a `'junction'` weld type auto-derived per appendage, rendered along the `junction-footprint.ts` boundary polyline — the attachment weld is inspection-critical (analog of nozzle-to-shell welds). Flag OPTIONAL; do not block parity on it.
2. **Annotations** — on the appendage cylinder the existing pure-cylinder annotation path applies with appendage radius/length; on the end closure the surface-drape/dome-arc machinery applies with appendage dims. Stats/heatmap flow through the T1b sampler's body parameter (annotation `bodyId` → sample only that body's composites/dome scans). Junction-spanning annotations (main↔appendage) are OUT of scope.
3. **Lifting lugs** — placement/drag parity via frame; snap HUD already covers lugs on main — extend the same snapping to appendage-mounted lugs.
4. **Coverage rects** — `bodyId` addition resolves the P3-T3 deferral (appendage rows in `CoverageStatsSection` currently read Covered = 0 because rects cannot target a body). Achieved-area math reuses the per-body wrapper from `80401d1`.
5. **Dome scans on appendage ends** — `DomeScanConfig.head` union extends with `'end'`, valid ONLY with `bodyId` set (an appendage has one closure). `centerPhi`/`centerTheta` keep their apex-relative meaning with the appendage axis as the dome axis and the appendage datum as θ reference. Grid (row,col) conventions are UNCHANGED — texture/gizmo/sampling reuse the existing dome pipeline parameterized by appendage dims. Gate: only offered in UI when the appendage's `endClosure` is a dished type.

## Out of scope (unchanged deferrals)

Junction-spanning annotations; flattened-view rendering of appendage attachables (T1c owns the flattened appendage story); real CSG; stable nozzle ids (T2 ride-along).

## Implementation split (for dispatch)

- **4A (opus):** welds + lugs + coverage rects — bodyId threading, geometry, drag, pickers, cascade, serialization spec, goldens. Mostly pattern-replication of Phase 2's nozzle work.
- **4B (opus, after T1b lands):** annotations on appendages — geometry drape on appendage cylinder/closure + T1b sampler body parameter wiring + stats.
- **4C (opus):** dome scans on appendage ends — config/union extension, gizmo, texture path, cloud section derivation, sampling.
- **4V (sonnet):** full verification sweep vs baseline; report-only.

Each task inherits the live-parallel-session exclusion list (VesselModeler.tsx may need integration edits — those route through the orchestrator if the GA session is still active at dispatch time, else the agent takes them with file-scoped commits).

## Test gates

Per attachable: legacy byte-identical golden (no bodyId); placement math vs `resolveBodyFrame` fixtures; cascade removal; spec round-trip both paths. Dome-on-end: synthetic grid hot-cell agreement between texture and sampler (same convention test as T1b's). Suite baseline from dispatch-time counts; no new failures.
