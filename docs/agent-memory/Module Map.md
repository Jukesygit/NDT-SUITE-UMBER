---
tags:
  - agent-memory/module-map
  - ndt-suite
aliases:
  - Module Map
---

# Module Map

Use this before searching. Pick the relevant area, read the nearby files, then search within that area first.

## App Shell And Routing

- `src/App.tsx` - main routing.
- `src/main.tsx` - app bootstrap.
- `src/components/LayoutNew.tsx` - primary layout shell.
- `src/styles/layout.css` - layout styling.

## Auth, Roles, And Security

- `src/contexts/AuthContext.tsx` - auth context.
- `src/pages/LoginPageNew.tsx` + `src/pages/login.css` - login page (clean design, `lg-` prefix; input rules must stay scoped under `.lg-page` to beat main.css global `input[type=...]` rules).
- `src/auth/` - auth managers, Supabase auth helpers, password reset flow.
- `src/components/auth/` - route-level auth requirements.
- `src/components/RequireAccess.tsx`, `src/components/RequireTabVisible.tsx` - access gating.
- `src/config/security.ts` - security configuration.
- `supabase/functions/` - edge functions for account, email, password, and admin workflows.

## Projects And Inspection Workflow

- `src/pages/projects/` - project list/detail/report/scan pages.
- `src/components/projects/` - project tabs, vessel cards, inspection detail sections.
- `src/services/inspection-project-service.ts` - project data layer.
- `src/types/inspection-project.ts` - project domain types.
- `database/migrations/enhance-project-vessels-inspection-detail.sql` - inspection detail schema history.

## Vessel Modeler

- `src/pages/VesselModelerPage.tsx` - page entry.
- `src/components/VesselModeler/VesselModeler.tsx` - main modeler component; decomposed T2-D (design `plans/2026-08-04-vesselmodeler-decomposition-design.md`, `4ff0538` 4356 → 1624 lines) to reducer-wiring + JSX. Zero behavior change: bodies moved verbatim, history/camera semantics and callback identities preserved. The reducer (`engine/vessel-reducer.ts` — six slices `vessel`/`selection`/`locks`/`drawMode`/`previews`/`ui` + `historyFor`/`INITIAL_STATE`/`UpdateVessel`, unit-tested) is pure and re-imported. Concern-seam hooks in `hooks/`: `useNozzleActions`/`useAppendageActions`/`usePipingActions`/`useAttachableActions` (saddle/lug/weld)/`useOverlayActions` (texture/coverage/ruler/inspection-image)/`useAnnotationActions`/`useScanActions` = D1 entity CRUD (verbatim callbacks, ids minted store-side via threaded refs); `useVesselPersistence` = D2 save/load/picker/GLB/linked-model bootstrap + sole serializer call site; `useViewportCallbacks` = D3 ThreeViewport callback object (fresh literal per render — never memoize) + `useViewportDnD` = D3 drag/drop; `useInspectionMode` = D4 enter/exit/cycle + sidebar annotation click + `visibleStatLines` overlay state; `useReportGeneration` = D4 `handleGenerateReport` + `captureReportAssets` (threaded into persistence); `useDrawingApply` = D4 GA-import apply. `validateVesselState` stays in the component (shared by persistence + drawing-apply). Config one-off handlers + pipe-part popup state stay inline by design. SidebarPanel's ~85-prop interface untouched (context refactor is T3, not attempted).
- `src/components/VesselModeler/SidebarPanel.tsx` - modeler side panel composition.
- `src/components/VesselModeler/CoveragePanel.tsx` - coverage panel UI.
- `src/components/VesselModeler/ThreeViewport.tsx` - 3D viewport.
- `src/components/VesselModeler/sidebar/` - sidebar sections for vessel parts, coverage, scans, report export, annotations.
- `src/components/VesselModeler/engine/` - geometry, materials, reporting, screenshots, texture, and interaction logic.
- `src/components/VesselModeler/vessel-modeler.css` - modeler styles.
- Stats overlay: `UnifiedStatsPanel.tsx` hosts `stats/CoverageStatsSection`, `stats/WallLossStatsSection`, `stats/ScanCoverageStatsSection`.
- Wall-loss math: production path is the worker `src/workers/wall-loss.worker.ts` (thin) → `src/workers/wall-loss-compute.ts` (pure `compute`, unit-tested). `engine/wall-loss-distribution.ts` is a tested reference, NOT used by the UI. Dome scans are folded in via flat grid-cell area (point-based, like the C-scan distribution engine).
- Scan-coverage achieved area: `engine/coverage-calculator.ts` (`computeRegionTotalAreas`, `validAreaFromGrid`). Dome/shell achieved coverage prefers persisted `stats.validArea`, falling back to `validAreaFromGrid` so dome ends still register. Composite stats are normalized via `engine/composite-stats.ts` (`toConfigStats`) on import.
- Coverage-rect covered area (2026-08-10 dome fix): `computeCoverage` routes rects with scan-sampling's `rectIsPureCylinder` (structural param — the ONE geometry-routing predicate, never re-derive). Pure-cylinder rects → legacy compressed sweep, byte-identical; head-touching rects → shell part = their box clamped to [0,L] in the same sweep (drape ≡ box on the cylinder) + head part from `engine/head-coverage.ts` (pure drape-splat raster in meridian-arc (s,θ) space using the SAME `buildDrapeGrid` as the visual; overlap-aware union; exact r·dθ·ds cell areas). CLAIRAUT SCAR: a tangent-centred full-wrap rect genuinely covers only ~50% of a head (drape lateral geodesics bounce away from the pole) — matches the drawn drape, not a bug; pole-centred rects are the ~100% case. Head-side nozzle/junction cutouts remain deferred everywhere.
- `src/services/vessel-model-service.ts` - persistence.
- `src/hooks/queries/useVesselModels.ts` and `src/hooks/mutations/useVesselModelMutations.ts` - data hooks.
- Appendage bodies (sump/boot secondary vessels, design `plans/2026-07-21-secondary-appendage-body-design.md`): `engine/body-frame.ts` is the SINGLE source for (pos,angle)↔world math on any body (`resolveBodyFrame(state, bodyId)`; appendage datum 0° = main +axis projection — never re-derive inline); `engine/appendage-geometry.ts` (mesh roll MUST come from the frame datum basis, not a shortest-arc quaternion); `engine/appendage-config.ts` (normalize/create), `engine/appendage-cascade.ts` (delete cascade), `sidebar/AppendageSection.tsx` (CRUD).
- Serialization: `engine/vessel-serialization.ts` + `engine/vessel-serialization-spec.ts` — the ONLY place attachable save/load fields are declared; all four VesselModeler save/load paths consume it. Appendage cloud scans use `section_type = 'appendage:<id>'`. Pipelines are the exception to the spec system: their single load site is `deserializePipeline` (in vessel-serialization.ts), save passes `state.pipelines` whole — there are NO pipeline import whitelists in VesselModeler.tsx anymore (the old piping-dome-end note about "TWO cloud-import maps" predates spec unification; ignore it).
- Stable nozzle ids (T2-C): `NozzleConfig.id` (`noz-<n>`) is the stable handle; `Pipeline.nozzleId` references it (never array position). `engine/nozzle-id.ts` is the SINGLE home for the id vocabulary — `nextNozzleId`/`backfillNozzleIds`/`findNozzleById`/`migratePipelineNozzleRefs`/`removeNozzleById`. Ids are minted store-side in `VesselModeler.addNozzle` (onAddNozzle callbacks take `Omit<NozzleConfig,'id'>`); backfilled deterministically at load (`deserializeVesselState` runs backfill then `migratePipelineNozzleRefs`, resolving the deprecated `Pipeline.nozzleIndex` → `nozzleId` ONCE; saves write `nozzleId` only). Free-standing pipes = no `nozzleId` (carry `freeOrigin`). `appendage-cascade.ts` and `removeNozzle` filter by id (NO index-shifting); `nozzle-ref-remap.ts` (GA import) rewrites `nozzleId` by name. ThreeViewport/pipeline-geometry resolve `nozzleId` → live array index for the nozzle mesh groups (keyed by `nozzleIdx` userData).
- GA drawing import (design `plans/2026-07-30-ga-drawing-import-hardening-design.md`): `DrawingImportModal.tsx` (upload/crop/extract phases + PDF page selector) → `engine/drawing-parser.ts` (3-call Gemini ensemble, enforced responseSchema, `MODEL_CANDIDATES` fallback — NO silent defaults, unreadable fields are `missing`) → `engine/drawing-extraction-voting.ts` (pure per-field voting, agreement→confidence) → `engine/drawing-verifier.ts` (pure rules: ranges, NPS flag-only, tag checks; also `toExtractionResult`) → `DrawingReviewPanel.tsx` + `DrawingReviewRows.tsx` (dense editable grid, quiet-by-default tints, issues-only filter; apply gated on no missing fields incl. `mount`, and `radialOffset` for head mounts) → `engine/head-nozzle-placement.ts` (head-mounted manways: ellipsoid pos from CL offset, axial orientation — ignores extracted pos for head mounts; ALSO the single angle-conversion site: extraction/review angles are drawing-native 0=TDC-clockwise, `drawingClockToVesselAngle` converts to engine 90=top at apply — never convert in the prompt or UI) → `handleDrawingApply` (remaps `pipelines[].nozzleIndex` by name via `engine/nozzle-ref-remap.ts`, unmatched removals are user-confirmed). Gemini key via `services/gemini-proxy.ts` + `supabase/functions/gemini-proxy`.
- Appendage attachable parity (2026-07-31, phases 3+4 complete): junction cutouts consume `engine/junction-footprint.ts` — ONE `containsCell` predicate drives coverage/wall-loss exclusion AND the heatmap alpha mask (never re-derive); per-body wall-loss/coverage (`src/workers/wall-loss-compute.ts` `bodies[]`, Combined = summed shared-template bins, occlusion body-scoped); welds/lugs/annotations/coverage-rects/dome-scans all carry optional `bodyId` (spec-declared only; `appendage-cascade.ts` strips by body, identity-preserving); appendage closure dome math in `engine/dome-tangent.ts` (pure inverse of `createDomeScanPlane` — sampling must mirror the overlay projection, not dome-arc); annotation sampling unified in `engine/scan-sampling.ts` (`sampleAnnotationFootprint`, dome+body aware, feeds stats AND heatmap); flattened view: `FlattenedView/scan-surface.ts` (shared cell path + body routing) and `FlattenedView/appendage-panels.ts` (stacked per-appendage strips, one shared pxPerMm), junction footprints project via `angleToCircumMm` (vessel 90=TDC convention).
- Relief view = the **Topo** viewport mode (R4, 2026-08-05): `ui.viewMode` is `'3d' | 'flattened' | 'topo'` (buttons 3D/2D/Topo in VesselModeler.tsx's `vm-toolbar-segmented`; Topo disabled when no composite has a thickness grid). Topo takes over the main viewport pane like 2D via `ReliefViewportPane.tsx` (lazy) — the modal-guts re-housed with a compact top-center overlay toolbar (orbit/measure/exaggeration/denoise/gap-fill), keyed on the ACTIVE composite so sidebar selection switches the surface live. Active-composite resolution lives in VesselModeler.tsx (`activeTopoComposite` memo): selected composite if it has a relief grid, else first confirmed-with-grid, else any-with-grid. `ReliefViewport.tsx` (THREE pane) reused as-is; pure adapter `engine/composite-relief-adapter.ts` (`hasReliefGrid`, rows=yAxis/cols=xAxis verbatim, no rescaling); reuses TopologyViewer engine (raycast helpers in `TopologyViewer/engine/topology-raycast.ts`). `viewMode` is transient UI — NOT serialized (not in vessel-serialization*, no localStorage) and preserved across undo/redo (`withRestoredVessel`); `SET_VIEW_MODE` records no history. `ReliefViewModal.tsx` retired (2026-08-05); ScanCompositeSection's "Relief view" button removed. Standalone /topology page's deprecation is still an open decision.
- Nozzle-bore stat cutouts (R1, 2026-08-05): `engine/nozzle-footprint.ts` (pure) maps `NozzleConfig` → footprint params — opening = penetrating stub OD exactly as `createFlangedNozzle` (`pipeOD ?? findClosestPipeSize(size).od`); radial = exact cyl-cyl via `junction-footprint.ts`, non-radial = projected bore ellipse (`buildEllipseFootprint`, 1/cosα clamp 75°) dispatched by `buildFootprintFromParams`. Same ONE-containsCell mechanism as boot junctions: `coverage-calculator.ts` `footprintsFor` = junctions + main nozzles, boots subtract their own; per-body footprints cross the worker boundary (`FootprintParamsSlim = FootprintParams`); main-shell heatmap holes via texture-manager (nozzle-aware cache suffix). Deferred: head/dome-mounted nozzle footprints; boot-composite VISUAL holes (`buildFootprintExcludeMask` returns undefined for boots — stats fully handled). Stats memos + wall-loss effect deps must include `nozzles` (live-update gap fixed here). **PERF RULE (2026-08-06, `14cd5d3`):** heavy derived work (heatmap footprint cache-suffix, coverage stats sweeps) reads a SETTLED snapshot via `src/hooks/useSettledValue.ts` (250ms trailing debounce, tested trailing-edge guarantee), never live per-frame state — a nozzle drag dispatches per pointer-move and live wiring caused per-frame texture repaints (cache key embedded exact pos/angle). Mesh geometry stays live (item tracks cursor); `footprintCacheSuffix` is quantized (1mm/0.5°, key only); wall-loss already has its own 300ms debounce; `getAllSurfaceMeshes` memoized per vesselGroup identity. Never wire footprint params or stats sweeps back to unsettled `vesselState`. **TRAILING-REBUILD GUARD (2026-08-06 regression fix):** ThreeViewport's settle effect that bakes the final bore hole is NOT structural-hash-guarded, so it must depend ONLY on `settledFootprintState` and must no-op unless the footprint fingerprint actually moved. `texture-manager.ts` exports pure `footprintFingerprint(state)` (quantized shell-nozzle+appendage inputs — the SAME string `footprintCacheSuffix` builds its cache key from, so guard and cache never disagree); the effect compares it against a baked ref. `rebuildScene`/`updatePreviews` are read through refs, NEVER dep-listed: their `useCallback` identity churns every render (`onInspectionImageThumbnailClick` is passed to ThreeViewport as an inline arrow → `rebuildScene` new identity each render), and orbiting a vessel WITH scans re-renders VesselModeler on every pointer-move (scan-hover → `SET_HOVER_DATA`), so an identity-dep here rebuilt the whole scene per pointer-move (the orbit-stutter regression). Never re-add `rebuildScene`/`updatePreviews` to that effect's deps, and never make the settle rebuild unconditional.
- FlattenedView orientation (R5, 2026-08-05): the 2D view is orientation-aware via `geometry-projection.ts` `makeDevelopedFrame()` — THE single (axial,circ)↔canvas mapping. horizontal = legacy arithmetic byte-for-byte; vertical = pure transpose (axial→screen-Y top-of-vessel-up, circ→screen-X, TDC = left seam edge). `scan-surface.ts` `SurfaceProjector` carries `orientation` + `axialScreen`/`circScreen`; `appendage-panels.ts` `computeStackLayout` + strip transforms transpose (vertical boot strips stack along circ/X). All content (geometry/heatmap/footprints/hover/scales/export) routes through the frame — never hand-roll an axis mapping in FlattenedViewport. Report export = canvas snapshot, inherits automatically.
- Cursor-first cross-body mounting (R2, 2026-08-06): `engine/body-crossing.ts` (pure) = `resolveCrossingHit` seam hysteresis (incumbent holds unless a competitor beats its camera-ray distance by `SEAM_HYSTERESIS_MM = 6`; incumbent tracked in interaction-manager `dragBodyId`, off React state) + `reprojectBetweenBodies` frame-conversion invariant. interaction-manager raycasts ALL body surfaces (`getAllSurfaceMeshes`; boot meshes identified by `userData.type='appendage'`) and live-reassigns `bodyId` mid-drag — (pos,angle) = winning body's `resolveBodyFrame().toLocal(hit.point)`, world hit point is the invariant. Draw-start resolves the body under cursor (`resolveDrawTarget`, replaced `activeDrawBodyId`); palette drops use `resolveDropPlacement`. Coalesce keys stay stable: callbacks write `bodyId` only when `appendages.length>0` (single-body byte-identical, legacy keys). Mount-on selects → `sidebar/MountedOnChip.tsx` ("On: Vessel"/"On: Boot 1", gated on boots existing); dome-scan import target picker kept. Excluded from crossing: dome scans/gizmos (apex-relative), textures + saddles (no bodyId), pipe-part drop (main-only, deferred); confirmed composites have no gizmo → remount = re-enter orientation.
- Terminology (R3, 2026-08-05): user-facing strings say "Boot"/"Boots" (default names "Boot N" minted in `appendage-config.ts` — the single source). Code identifiers (`AppendageConfig`, `appendage-*` files, props) and serialization/cloud values (`section_type 'appendage:<id>'`) deliberately UNCHANGED; nothing parses default names back. Persisted names in saved models keep whatever they were saved as.
- T3 UX batch (2026-08-06/07, design `plans/2026-08-06-t3-ux-batch-design.md`, all five phases landed): **A3** labeled undo — `vessel-history.ts` entries are `{vessel,label,at}` (coalescing keeps FIRST label; `undoTo`/`redoTo` fold N steps into one `UNDO_TO`/`REDO_TO` dispatch), labels minted dispatcher-side in `historyFor` (Move/Edit verb table, "Boot" display word — coalesce key keeps raw `entity`), `HistoryDropdown.tsx`. **C12** — `engine/canonical-views.ts` (canonicalPose iso/N/E/S/W/top/bottom/tdc honouring `cardinalRotation`+orientation, `nozzleNormalPose`, shared `fitDistance`), `ViewCube.tsx` (CSS-3D, rAF-synced via ref writes — NO per-frame React state), `VesselState.cameraBookmarks` top-level field (both paths, absent ⇒ byte-identical; CRUD undoable), `BookmarksDropdown.tsx`; report captures append bookmark poses. **C13** — uniform `visible?` on ALL entity types (annotations/images stay on the rebuild path — their `visible` gates separately-built CSS2D labels), stripped from wholesale hash via `{...x, visible: undefined}` projections (legacy byte-identity regression-tested), applied build-time + tier-2 in-place effect (entity-array deps only), hidden entities excluded from raycast (`isEntityVisible` walk-up; `getAllSurfaceMeshes` filters on return) but NEVER from stats; `outliner-tree.ts` (pure) + `OutlinerPanel.tsx` (sidebar-aware `left: 354/14`). **C14** — `engine/palette-registry.ts` (pure item build + ranked filter) + `engine/frame-entity.ts` (poses via `resolveBodyFrame` uniformly, `datumToVesselAngle`, dome head-apex fallback; framing distance = `framingDistanceForCamera` extracted from camera-animation, inspection byte-identical) + `CommandPalette.tsx` (Ctrl+K/Ctrl+P). **C15** — `engine/clip-planes.ts` (one world-space plane per mode, normal = KEPT half) applied scene-wide by `scene-manager.setClippingPlanes` + `reapplyClippingPlanes()` at rebuildScene end; ThreeViewport clip effect deps `[clipConfig, orientation]` ONLY; persistent highlight materials synced explicitly; `ui.clip` transient via SET_CLIP; `ClipPlanesControl.tsx`. **VIEWPORT-OVERLAY RULE (view-cube scar, 2026-08-07):** `.vm-sidebar` overlays the viewport's LEFT 340px — never anchor viewport UI at left without a sidebar-aware offset (UnifiedStatsPanel/OutlinerPanel `left: sidebarOpen ? 354 : 14` precedent); the view cube lives top-RIGHT below the actions cluster. All of `outlinerOpen`/`paletteOpen`/`clip` are transient ui — never serialized, no history.
- Weld labels: `engine/weld-label-anchor.ts` is the single anchor source for appendage-weld labels (BOTH ThreeViewport CSS2D pass and text-sprite GLB export consume it); main-shell label math stays inline/byte-identical.
- `engine/structural-hash.ts` - pure scene-rebuild hash (re-exported by ThreeViewport); structural fields only, cosmetic fields cause rebuild storms. NOTE: dome scans are FIELD-LISTED here (bodyId added 4C after being found missing); welds/lugs/rects/annotations hash wholesale. Scan/dome heatmap visual params (opacity/colorScale/rangeMin/rangeMax) are EXCLUDED since T2-B (`82de1ee`) — they bake into the heatmap texture (opacity = per-texel alpha) and repaint via ThreeViewport's tier-2 signature effect + cache-keyed texture swap; never re-add them to the hash.
- `engine/vessel-coords.ts` (T2-A, `2586d34`) - THE single source for circumferential angle conventions (user/datum 0=TDC vs vessel/clock 90=TDC, normAngle, cw/ccw arc helpers); the +/-90 conversion lives here ONLY — never hand-roll it at call sites (Decision Log 2026-06-22 scar).
- Undo/redo (design `plans/2026-07-29-vessel-modeler-undo-redo-design.md`): `engine/vessel-history.ts` is the pure snapshot-history core (past/future stacks over the `vessel` reducer slice, coalesce same-key <1s, cap 50; timestamps come from dispatchers, NEVER Date.now() in the reducer). Domain wrappers in `VesselModeler.tsx` auto-derive coalesce keys (`entity:id:sortedFields`); `onDragEnd` → `HISTORY_BREAK`; rehydration dispatches are `skip`-tagged; `SET_VESSEL` clears history. `useTextureRehydration.ts` rebuilds disposed THREE textures on undo — it must assign a NEW `textureObjectsRef` object (ThreeViewport change detection is by identity). `modelMode` is synced FROM `vesselShape` by effect; never dispatch vessel updates on redundant mode-toggle clicks.
- Attachables carry optional `bodyId` (undefined = main shell, byte-identical legacy paths, regression-tested). Scan build/gizmo/drag share a uniform +90° TDC offset on BOTH bodies — change all three sites together or not at all.

## Scan Viewer And C-Scan

- `src/pages/projects/ScanViewerPage.tsx` - project scan viewer page.
- `src/components/projects/scan-viewer/` - heatmap, waveform, B-scan, gates, toolbar.
- `src/pages/CscanVisualizerPage.tsx` - standalone C-scan visualizer page.
- `src/components/CscanVisualizer/` - visualizer UI and processing utilities.
- `src/components/CscanVisualizer/utils/annotatedExport.ts` - annotated graph export with stats, thickness distribution, notes, and report background styling.
- `src/components/CscanVisualizer/utils/sessionStore.ts` - browser-local IndexedDB save/load for C-scan sessions.
- `src/workers/heatmap-renderer.worker.ts`, `src/workers/thickness-engine.worker.ts` - worker logic.
- `src/hooks/useHeatmapRenderer.ts`, `src/hooks/useThicknessEngine.ts` - worker-facing hooks.

## Companion App

- `companion/` - Python companion application.
- `companion/api/` - local API server and auth/cache routes.
- `companion/engine/` - scan parsing, C-scan export, rendering, calibration, conversion.
- `companion/ui/` - tray and batch window UI.
- `src/services/companion-service.ts` - web app companion service.
- `src/hooks/queries/useCompanion*.ts` and `src/hooks/mutations/useCompanionMutations.ts` - web companion hooks.
- `src/components/companion/` - setup, status, directory browser, toast UI.

## Personnel And Competency

- `src/pages/personnel/` - personnel screens, filters, table, detail, competency modals.
- `src/pages/profile/` - personal profile and competency sections.
- `src/services/personnel-service.ts` - personnel data.
- `src/services/competency-*` - competency queries, mutations, definitions, comments.
- `src/hooks/queries/usePersonnel.ts`, `src/hooks/queries/useCompetencies.ts` - query hooks.
- `src/hooks/mutations/usePersonnelMutations.ts`, `src/hooks/mutations/useCompetency*.ts` - mutation hooks.
- Multi-document certifications (design `plans/2026-07-28-competency-multi-documents-design.md`): child table `competency_documents` (migration `20260728120000`) is the source of truth; parent `employee_competencies.document_url/document_name` scalars stay MIRRORED to the position-first doc via `setCompetencyDocuments` in `competency-mutations.ts` (the ONLY writer). Pure rules live in `src/utils/competency-documents.ts` (`normalizeCompetencyDocuments` — legacy-scalar tolerant; `documentsRequireReview` — re-review on any set change leaving ≥1 doc). Upload UI: `src/pages/profile/CompetencyDocumentsField.tsx` (multi-file, on-select upload). Shared review preview: `src/pages/personnel/DocumentViewerColumn.tsx`. Signed URLs batched via `getDocumentUrls`. Deletion: `deleteCompetency` (competency-mutations.ts) is the single path — row delete + cascade + best-effort storage cleanup; `setCompetencyDocuments` storage-removes dropped pages; admin delete UI = trash icon on personnel cards + modal Delete via `useDeletePersonCompetency`.
- Attribution (design `plans/2026-07-28-competency-attribution-and-session-hardening-design.md`): `employee_competencies.created_by` / `competency_documents.created_by` are server-set by the `set_created_by()` trigger (migration `20260728130000` — never client-supplied; FK → profiles for name embeds). `audit_row_change()` appends `details.on_behalf_of` when actor ≠ row `user_id`; surfaced in `src/pages/admin/tabs/ActivityLogTab.tsx` ("for {name}" + on-behalf filter) and as "Added by {name}" on competency cards. Session hardening lives in `src/auth/active-user-guard.ts` (`assertActiveUser`, called by ProfilePage self-service writes), the identity-change guard in `src/auth/auth-supabase.ts`, and the header identity + restored-session banner in `src/components/LayoutNew.tsx`.

## Document Control

- `src/pages/documents/` - document control page, tabs, components, modals.
- `src/services/document-control-service.ts` - document data layer.
- `src/hooks/queries/useDocuments.ts`, `src/hooks/mutations/useDocumentMutations.ts` - document hooks.
- `src/types/document-control.ts` - document domain types.

## Admin

- `src/pages/admin/` - admin page, tabs, components, modals.
- `src/services/admin-*` - users, organizations, config, service helpers.
- `src/hooks/queries/useAdmin*.ts`, `src/hooks/mutations/use*Mutations.ts` - admin hooks.
- `src/admin-config.ts`, `src/config/admin.ts` - admin configuration.

## Design And Styling

- `src/styles/industrial-theme.css` - industrial theme layer.
- `src/styles/design-tokens.css` - design tokens.
- `src/styles/components-new.css` - shared component styling.
- `src/styles/main.css`, `src/index.css` - global imports.
- `docs/DESIGN_SYSTEM.md`, `docs/DESIGN_TOKENS_REFERENCE.md`, `DESIGN.md` - design references.

## Database And Supabase

- `database/` - schema scripts, migration helpers, setup SQL, security scripts.
- `database/migrations/` - local migration history.
- `supabase/migrations/` - Supabase migration files.
- `supabase/functions/` - edge functions.
- `src/supabase-client.ts` - client setup.
- `src/types/database.types.ts` - generated or maintained database types.

## Reports

- `src/components/report/` - report document pages, header, CSS.
- `src/pages/projects/ReportPage.tsx`, `src/pages/projects/ReportBuilderPage.tsx` - report pages.
- `src/components/VesselModeler/engine/report-generator.ts` - vessel report generation logic.
- `docs/REPORT_GENERATOR_README.md` - report workflow reference.
