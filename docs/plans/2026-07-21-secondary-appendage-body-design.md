# Secondary Appendage Bodies — Design

**Date:** 2026-07-21
**Status:** Draft for review
**Author:** Claude Fable 5 (coordinator/designer), from a 7-area research sweep (Sonnet agents)
**Drives:** sump/boot-style secondary vessel sections (ref: GA drawing — horizontal vessel with vertical flanged sump, own nozzles K5/N5/N7, vortex breaker)

---

## 1. Problem

The vessel modeler is single-body. Every attachable — nozzles, welds, scans, annotations, coverage rects — lives in one coordinate frame: `pos` (mm from left tangent) + `angle` (clock degrees, 90 = TDC), plus left/right dome scans in (phi, theta). Real vessels have large secondary sections (sumps, boots, risers) mounted at right angles to the shell. Today these can only be faked with visual-only pipeline segments, which accept no nozzles, no scan overlays, and contribute nothing to coverage/wall-loss stats or reports.

## 2. Goal (v1, user-approved 2026-07-21)

First-class **appendage bodies**: cylindrical sections mounted perpendicular to the main shell at any axial position + clock angle, each with its own local cylinder frame. In v1 an appendage supports:

1. **Scan composites** — full overlay pipeline (orientation gizmo, datum confirm, hover readout).
2. **Nozzles + pipelines** — nozzles placed on the appendage; pipelines hung off those nozzles.
3. **Stats + report integration** — wall-loss distribution, coverage targets/achieved, flattened 2D view, report generator.
4. **Real shell cutout** — the junction opening's area is *excluded* from main-shell coverage/area stats, and main-shell scan overlays are clipped there (user chose accuracy over the visual-only option).

## 3. Non-goals (v1)

- Dome scans on appendage end closures (deferred; end closure renders but takes no phi/theta overlay).
- Non-perpendicular mount angles; appendages on dome ends; appendages on appendages.
- Real CSG hole in the shell mesh (no CSG library exists — `package.json` has only `three ^0.164.1`; cutout is a stats/overlay masking layer, and the junction renders via interpenetration + flange ring, like nozzles do today).
- Welds / annotations / rulers / lifting lugs / saddles *on* appendages (types get no bodyId yet; add later if needed).
- Undo, and any broader VesselModeler.tsx re-architecture beyond what the feature forces.

## 4. Research constraints (what the sweep found)

Full findings in the workflow transcripts; the load-bearing facts:

| # | Fact | Consequence |
|---|------|-------------|
| C1 | `texture-manager.ts` has **4 near-identical ~90-line vertex loops**; `vessel-geometry.ts` nozzle-mount math (L436–533) duplicates `shellPoint()` (annotation-geometry.ts:22); interaction-manager drag handlers hand-write the inverse transform (L697–712 etc.) | A shared **SurfaceFrame** must land first, or appendage math is written 5+ times and drifts |
| C2 | `circumference = π × state.id` is inlined in **13+ files** (annotation-stats, annotation-heatmap, wall-loss-distribution, coverage-calculator, report-generator, report-image-capture, annotation-labels, text-sprite, …) | Every consumer must resolve dimensions via bodyId, not `vesselState.id` |
| C3 | Wall-loss math exists twice: `engine/wall-loss-distribution.ts` (reference/tests) and `workers/wall-loss-compute.ts` (runtime) | Collapse before adding per-body/cutout logic |
| C4 | **4 hand-written serializer field lists** (saveProject L1683–1811, buildSaveConfig L1814–1923, load mappers L540–719 / L2152–2340). Confirmed bug: `saveProject` omits `domeScanComposites` entirely | Consolidate to one field-spec; fix dome bug in same change; round-trip tests mandatory |
| C5 | `vessel_models.config` is a single JSONB blob; `scan_composites.section_type` is unconstrained TEXT | Appendages need **zero DB migration**; back-compat is automatic (missing keys default) |
| C6 | `structuralHash` (ThreeViewport.tsx:35–58) is a hand-maintained allowlist; documented bug class: cosmetic fields → rebuild storms, missing fields → silent no-rebuild | Include only structural appendage fields |
| C7 | `Pipeline.nozzleIndex` is a raw index into the flat `vesselState.nozzles` array; `removeNozzle` does manual index-shift cascades | Keep ONE flat nozzle array with optional bodyId — never split per body |
| C8 | Flattened view math (`angleToCircumMm`/`datumToCircumMm`) is pure and parameterized; TDC convention regressed twice historically | Reuse per-body with the appendage's own circumference; never re-add ±90 offsets |
| C9 | Hover readout is pure UV/userData; `sampleComposite()` already takes circumference as a param | These extend to appendages nearly free |
| C10 | File-size debt: VesselModeler.tsx 3,634 ln; PipingSection.tsx 756 ln; ThreeViewport.tsx 1,267 ln | New code goes in new files; split PipingSection before touching it |

## 5. Data model

```ts
// types.ts — new
export type AppendageEndClosure = 'dished' | 'flat' | 'open';

export interface AppendageConfig {
  /** Stable unique id, e.g. 'app-1'. Referenced by attachables' bodyId. NEVER an array index. */
  id: string;
  name: string;                    // e.g. "Sump"
  /** Mount point on main shell: mm from left tangent line */
  mountPos: number;
  /** Mount clock angle on main shell: degrees, 90 = top, 270 = bottom */
  mountAngle: number;
  /** Inner diameter in mm */
  diameter: number;
  /** Cylinder length in mm, from main-shell OUTER surface to end-closure tangent line */
  length: number;
  endClosure: AppendageEndClosure;
  /** Head ratio for dished closure (default 2.0), ignored otherwise */
  headRatio?: number;
  /** Render a girth-flange pair at the junction (drawing: "sump girth flanges") */
  flangeJoint?: { show: boolean; od?: number; thickness?: number };
  /** Nominal wall thickness (wall-loss); defaults to shellNominalThickness */
  nominalThickness?: number;
  visible?: boolean;
  locked?: boolean;
}

// VesselState — new field
appendages: AppendageConfig[];     // DEFAULT_VESSEL_STATE: []

// bodyId threading (v1: exactly these three)
NozzleConfig.bodyId?: string;        // undefined = main shell
ScanCompositeConfig.bodyId?: string;
CoverageRectConfig.bodyId?: string;
```

Rules:
- `bodyId === undefined` routes through the **exact existing code path unchanged** — zero regression risk for existing models (geometry agent's recommendation).
- Attachables on an appendage interpret `pos` as mm along the appendage axis **from the junction outward** and `angle` as degrees around the appendage circumference per the datum convention in §6.
- `Pipeline.nozzleIndex` semantics unchanged (flat nozzle array, C7). Nozzle stable-id migration is flagged as future work, not v1.

## 6. SurfaceFrame — the cornerstone abstraction

New `engine/body-frame.ts`:

```ts
export interface SurfaceFrame {
  bodyId: string | undefined;        // undefined = main shell
  radius: number;                    // mm
  axialLength: number;               // tan-tan (main) or cylinder length (appendage), mm
  headDepth: number;                 // ellipsoidal depth; 0 for flat/open closures
  kind: 'main' | 'appendage';
  /** (posMm, angleDeg, radialOffsetMm) -> world THREE.Vector3 (SCALE applied) */
  surfacePoint(pos: number, angleDeg: number, offset?: number): Vector3;
  /** outward surface normal at (pos, angle) */
  surfaceNormal(pos: number, angleDeg: number): Vector3;
  /** world point -> { posMm, angleDeg } — the ONE inverse used by all drag handlers */
  toLocal(world: Vector3): { pos: number; angle: number };
}

export function resolveBodyFrame(state: VesselState, bodyId?: string): SurfaceFrame;
```

- **Main-shell frame** reproduces `shellPoint()` / the vessel-geometry nozzle math exactly (locked by equivalence tests over a grid of pos/angle/orientation samples before any consumer migrates).
- **Appendage frame**: origin = main frame's `surfacePoint(mountPos, mountAngle, 0)`; axis = outward shell normal (perpendicular mount); built with the proven nozzle quaternion pattern `setFromUnitVectors((0,1,0), normal)`.
- **Appendage datum convention (proposed):** appendage local **0° = the direction of the main vessel's +axis** (toward the right tangent line) projected onto the appendage cross-section; angles increase per the same handedness as the main shell viewed from outside the end closure. For a bottom sump on a horizontal vessel this makes 0° face the right head, 90° face the viewer-side per `measurementConfig.viewFromEnd`. This lives in ONE place (`body-frame.ts`) with unit tests — never re-derived inline (C8's ±90 lesson).
- Consumers migrated to SurfaceFrame in Phase 0: `shellPoint()` (delegates), texture-manager's 4 vertex loops (collapse to 1 helper), vessel-geometry nozzle mount, interaction-manager's inline inversions (8 found, all migrated), scan-gizmo-geometry's `getVesselCenter`.

**Phase 0 implementation notes (binding on Phase 1):**
- The appendage frame is built from an explicit orthonormal basis **(N, D, E)** — axis, datum, E = D × N — NOT a raw `setFromUnitVectors((0,1,0), normal)` quaternion. A shortest-arc quaternion fixes only the axis and leaves the roll about N unspecified, so it cannot align local 0° with the datum. **Phase 1's appendage mesh must derive its roll-about-N from the frame's datum** (e.g. align the cylinder geometry's angle-0 to `frame.surfaceNormal(pos, 0)`), or mesh and scan/overlay math will diverge. Handedness: D × E = −N (clockwise viewed from outside the end closure), locked by unit test.
- Known legacy inconsistency now visible in one place: `surfacePoint` (ex-shellPoint) caps the head ratio at **0.99** while the legacy nozzle *position* math caps at **1.0** (an apex nozzle collapses onto the axis). T2 kept the nozzle position math inline/exact and migrated only the normal. If full unification is wanted later, reconcile the cap in body-frame.ts deliberately — do not fold silently.

## 7. 3D geometry & scene

- `buildVesselScene()` gains an appendage loop: for each appendage, build a self-contained `THREE.Group` (cylinder + end closure + optional flange rings + junction reinforcement look) positioned/oriented once via the mount quaternion — the `createSaddleGroup` encapsulation pattern with the nozzle rotation pattern.
- End closures: `dished` reuses the piping engine's dished-hemisphere cap approach / main-head ellipsoid code parameterized by appendage diameter + headRatio; `flat` = disc; `open` = none.
- Junction: **visual interpenetration** (nozzle `penetrationDepth` technique) + flange pair. No mesh boolean. The large-diameter seam is visually covered by the girth-flange rings — which the reference drawing shows anyway.
- Every appendage mesh gets `userData.bodyId` (+ `userData.isShell = true` on its cylinder) so `getShellMeshes()` keeps working and raycast hits resolve to a frame via one lookup (scan-overlay agent's recommendation).
- `BuildSceneResult` gains `appendageMeshes` (selectable/highlightable like `nozzleMeshes`).
- `structuralHash` gains appendages' **structural fields only**: id, mountPos, mountAngle, diameter, length, endClosure, headRatio, flangeJoint.show (C6).

## 8. Scan overlays on appendages

- `createScanCompositePlane(composite, state)` resolves `frame = resolveBodyFrame(state, composite.bodyId)` and feeds the (single, post-Phase-0) vertex loop from the frame instead of raw `vesselState` fields. Overlay meshes carry the same `userData` shape → hover readout works unchanged (C9).
- Scan gizmo builds on the frame (`surfacePoint`/`surfaceNormal`); gizmo drag raycasts only meshes whose `userData.bodyId` matches the composite's, then `frame.toLocal(hit)` — appendage-local mm/degrees fall out of the same code path.
- Orientation-confirm flow (datum sphere, ribbon arrows, confirm-to-render) is reused verbatim — same UX as main shell and dome scans.
- `sampleComposite()` callers pass the owning body's circumference; the duplicate sampler in `annotation-heatmap.ts` is deleted in favor of the shared one.

## 9. Cutout & stats (the accuracy workstream)

New `engine/junction-footprint.ts` — pure math, heavily unit-tested:

```ts
/** Footprint of a perpendicular cylinder (radius r) mounted at (mountPos, mountAngle)
 *  on a shell of radius R, expressed in main-shell developed coords. */
export interface JunctionFootprint {
  containsCell(posMm: number, angleDeg: number): boolean;  // exclusion predicate
  areaMm2: number;                                          // true excluded shell area
  boundary: Array<{ pos: number; angle: number }>;          // polyline for drawing
}
```

For a perpendicular cylinder-on-cylinder intersection the curve has a closed-form parameterization (`z = ±sqrt(r² − x²)` mapped through the shell's angular coordinate, `asin` terms); area via numeric integration over the parameter. Exact, not the ellipse approximation — it's ~40 lines of math and this workstream exists because the user chose accuracy.

Exclusion plugs into exactly five places:

1. `computeRegionTotalAreas` — subtract `areaMm2` per appendage from the cylinder term (and per-appendage totals added: lateral area + closure area).
2. `computeCoverage` sweep — cells inside any footprint don't count as coverable/covered. Appendage rects run through a **separate per-body `computeCoverage` invocation** (one shared radius per sweep — stats agent, C-risk).
3. Wall-loss `cellAreaOnVessel`/`regionCellArea` — footprint cells contribute zero area; `WallLossRequest` becomes `bodies[]` (geometry per bodyId), composites grouped by bodyId, one `compute()` per body, bins merged. Occlusion checks are bodyId-scoped so appendage scans can't spuriously occlude main-shell cells.
4. `heatmap-texture.ts` — main-shell composites overlapping a footprint get alpha=0 stamped per-pixel (the alpha channel is already per-pixel for null cells), AND the same cells are excluded from validArea aggregation so stats match visuals.
5. Flattened main panel — clip path + raster skip inside the projected boundary polyline (§10).

`CoverageTargets` extends **additively**: existing `{leftHead, cylinder, rightHead}` untouched (cylinder figures become cutout-adjusted); new optional `appendages?: Record<string, CoverageTargetEntry>`. Old saved JSON keeps loading via the existing `?? DEFAULT_TARGETS` pattern.

Stats UI: `ScanCoverageStatsSection` and `CoverageStatsSection` gain per-appendage rows (labeled by appendage name); `WallLossStatsSection` shows combined bins v1 with per-body breakdown behind a selector. `utils/coverage-calc.ts` (project-level scope %, outside the modeler) updated in the same phase or it silently under-reports.

## 10. Flattened 2D view

- **Per-appendage unrolled panel** beside/below the main panel (research recommendation over the inset option): each panel gets its own `fitScale`, `toCanvasX/Y` closures, own TDC line, own axial/circum scales, and own `ViewState` (zoom/pan) — differently-scaled panels sharing pan/zoom feels broken.
- Panel scoping = `filter(e => (e.bodyId ?? 'main') === panelBodyId)` applied once at the top of `render()`/`renderGeometry()`/`renderHeatmap()`/`findThicknessAt()` (prevents appendage scans smearing across the main projection, and hover reporting the wrong body's data).
- Cutout: `projectCutout()` in geometry-projection.ts renders the footprint boundary as a hole in the main panel's outline clip and skips heatmap pixels inside it.
- All circumference math calls the existing pure functions with the panel body's diameter. No new angle conventions.

## 11. Persistence, cloud, report

- **Phase 0 fix (independent bug, same code region):** `saveProject()` omits `domeScanComposites` — local save/reload loses dome overlays. Fix alongside.
- Consolidate the 4 field-lists into one data-driven field-spec consumed by both save paths and both load mappers; add `appendages[]` + `bodyId` there **once**. Round-trip test: save → load → deep-equal on appendages/bodyId (both local JSON and cloud config paths).
- `normalizeAppendage()` mirrors `normalizeDomeScanComposite` (dome-scan-geometry.ts:43) as the single load-time defaulting point — this is the pattern that fixed the dome "empty after reload" gap; appendage scans must not repeat it.
- DB: none required (C5). Cloud scan composites for appendages use `section_type = 'appendage:<appendageId>'`, matching the `dome_left`/`dome_right` precedent.
- Report: `buildScanLogTable` labels rows with the owning body's name; coverage/wall-loss report figures pick up the cutout-adjusted + per-body numbers from §9. Any consumer not yet appendage-aware gets the dome-scan-style defensive fallback row rather than wrong numbers.

## 12. UI

- New `sidebar/AppendageSection.tsx` mirroring NozzleSection's exact pattern (list + inline edit form + add/delete; props `{vesselState, selectedAppendageIndex, onAdd/Update/Remove/Select, isOpen, onToggle}`), exported from `sidebar/index.ts`, wired into SidebarPanel's Attachments group. Selection by index in the reducer (SELECT_APPENDAGE mirroring SELECT_NOZZLE), but cross-references (bodyId) always use the stable `AppendageConfig.id`.
- NozzleSection gains a "mount on" body picker (Main vessel / each appendage by name). Scan import flow gains the same picker before orientation confirm.
- `VesselCallbacks` gains `onAppendageSelected` / `onAppendageMoved` now, so ThreeViewport's callbacksRef pass-through stays additive when drag lands.
- Appendage drag on the shell = move mount point (same interaction as nozzle drag; snaps per attachment-angle-snap conventions).
- PipingSection: appendage nozzles appear as connection points automatically (flat nozzle array, C7) — but the file is split into sub-components first (C10).

## 13. Phasing (implementation order; all v1)

| Phase | Content | Gate |
|-------|---------|------|
| **0 — Foundations** | body-frame.ts + SurfaceFrame equivalence tests; migrate shellPoint/texture-manager loops/nozzle mount/drag inversions; collapse wall-loss duplication; serializer field-spec consolidation + dome saveProject bug fix; split PipingSection | typecheck + full test suite green; zero visual/behavioral diff on existing models |
| **1 — Appendage core** | AppendageConfig + appendages[] + normalizeAppendage; geometry build + flange joint; structuralHash; AppendageSection CRUD; serialization both paths + round-trip tests | appendage renders, saves, reloads; existing models untouched |
| **2 — Attachables** | bodyId on NozzleConfig/ScanCompositeConfig; nozzles + pipelines on appendages; scan overlays + gizmo + hover on appendages; section_type convention | scan maps onto a sump end-to-end with confirm flow |
| **3 — Cutout + stats** | junction-footprint.ts; the five exclusion plug-ins; per-body wall-loss/coverage; CoverageTargets extension; stats panels; utils/coverage-calc.ts | areas reconcile: main(cut) + appendage lateral = hand-calc within tolerance |
| **4 — Flattened + report** | per-appendage panels; cutout hole in main panel; report labeling + defensive fallbacks | flattened panels + report row labeling verified |

Each phase = one Opus implementation wave with tests, Sonnet verification (build/test/lint), Fable review against this doc.

## 14. Acceptance tests (headline)

- SurfaceFrame main-shell equivalence: `surfacePoint` ≡ legacy `shellPoint` and nozzle-mount math across orientations (grid property test).
- Round-trip: model with 1 appendage + appendage scan + appendage nozzle + pipeline survives local-JSON and cloud save/load deep-equal.
- Frame round-trip: `toLocal(surfacePoint(p, a)) ≈ (p, a)` for both bodies (kills the drag/build divergence bug class).
- Footprint: `areaMm2` matches numeric ground truth for r/R ∈ {0.1, 0.3, 0.5}; `containsCell` consistent with boundary.
- Stats reconciliation: cutout-adjusted cylinder area + footprint area = uncut cylinder area (exact); wall-loss bins for a bodyId-scoped composite unchanged when an unrelated body's scan is added.
- Flattened: appendage panel renders its scan with its own circumference; main panel excludes appendage entities; TDC convention tests still green.
- Regression: default vessel with no appendages produces byte-identical serialization and identical structuralHash behavior.

## 15. Risks

| Risk | Mitigation |
|------|-----------|
| (pos,angle)↔world divergence between build and drag paths on appendages | Single SurfaceFrame with round-trip property tests (Phase 0 gate) |
| bodyId dropped by one of the 4 serializer sites | Field-spec consolidation first; round-trip tests |
| structuralHash omission (no rebuild) or over-inclusion (rebuild storms) | Explicit structural-fields-only list + test that cosmetic edits don't change the hash |
| Appendage datum convention becomes the next ±90 regression | Convention defined once in body-frame.ts + unit tests + Decision Log entry |
| Visual interpenetration looks poor on large boots | Flange-joint rings cover the seam (drawing-accurate); revisit CSG only if users object |
| Monolith growth (VesselModeler.tsx et al.) | All new logic in new files; only wiring added to monoliths |

## 16. Review decisions (user-approved 2026-07-21)

Design signed off as written; the three open questions were decided:

1. **Appendage datum 0°** — **main-vessel +axis direction** projected onto the appendage cross-section (§6). Purely geometry-derived; lives only in `body-frame.ts` with unit tests.
2. **Junction footprint** — **exact intersection curve** (closed-form perpendicular cylinder-on-cylinder parameterization; area via numeric integration). No ellipse approximation.
3. **Wall-loss UI** — **combined bins (cutout-adjusted) + per-body selector**; report shows combined plus per-body tables.

## 17. Follow-ups (explicitly not v1)

Dome scans on appendage ends; welds/annotations on appendages; stable nozzle ids replacing `Pipeline.nozzleIndex`; real CSG junction; appendage-mounted lifting lugs; Decision Log entry to be written at merge (Decision/Reasoning/Consequences: bodyId + SurfaceFrame + cutout conventions).
