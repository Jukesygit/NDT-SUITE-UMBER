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
- `src/components/VesselModeler/VesselModeler.tsx` - main modeler component.
- `src/components/VesselModeler/SidebarPanel.tsx` - modeler side panel composition.
- `src/components/VesselModeler/CoveragePanel.tsx` - coverage panel UI.
- `src/components/VesselModeler/ThreeViewport.tsx` - 3D viewport.
- `src/components/VesselModeler/sidebar/` - sidebar sections for vessel parts, coverage, scans, report export, annotations.
- `src/components/VesselModeler/engine/` - geometry, materials, reporting, screenshots, texture, and interaction logic.
- `src/components/VesselModeler/vessel-modeler.css` - modeler styles.
- Stats overlay: `UnifiedStatsPanel.tsx` hosts `stats/CoverageStatsSection`, `stats/WallLossStatsSection`, `stats/ScanCoverageStatsSection`.
- Wall-loss math: production path is the worker `src/workers/wall-loss.worker.ts` (thin) → `src/workers/wall-loss-compute.ts` (pure `compute`, unit-tested). `engine/wall-loss-distribution.ts` is a tested reference, NOT used by the UI. Dome scans are folded in via flat grid-cell area (point-based, like the C-scan distribution engine).
- Scan-coverage achieved area: `engine/coverage-calculator.ts` (`computeRegionTotalAreas`, `validAreaFromGrid`). Dome/shell achieved coverage prefers persisted `stats.validArea`, falling back to `validAreaFromGrid` so dome ends still register. Composite stats are normalized via `engine/composite-stats.ts` (`toConfigStats`) on import.
- `src/services/vessel-model-service.ts` - persistence.
- `src/hooks/queries/useVesselModels.ts` and `src/hooks/mutations/useVesselModelMutations.ts` - data hooks.
- Appendage bodies (sump/boot secondary vessels, design `plans/2026-07-21-secondary-appendage-body-design.md`): `engine/body-frame.ts` is the SINGLE source for (pos,angle)↔world math on any body (`resolveBodyFrame(state, bodyId)`; appendage datum 0° = main +axis projection — never re-derive inline); `engine/appendage-geometry.ts` (mesh roll MUST come from the frame datum basis, not a shortest-arc quaternion); `engine/appendage-config.ts` (normalize/create), `engine/appendage-cascade.ts` (delete cascade), `sidebar/AppendageSection.tsx` (CRUD).
- Serialization: `engine/vessel-serialization.ts` + `engine/vessel-serialization-spec.ts` — the ONLY place attachable save/load fields are declared; all four VesselModeler save/load paths consume it. Appendage cloud scans use `section_type = 'appendage:<id>'`. Pipelines are the exception to the spec system: their single load site is `deserializePipeline` (in vessel-serialization.ts), save passes `state.pipelines` whole — there are NO pipeline import whitelists in VesselModeler.tsx anymore (the old piping-dome-end note about "TWO cloud-import maps" predates spec unification; ignore it).
- Stable nozzle ids (T2-C): `NozzleConfig.id` (`noz-<n>`) is the stable handle; `Pipeline.nozzleId` references it (never array position). `engine/nozzle-id.ts` is the SINGLE home for the id vocabulary — `nextNozzleId`/`backfillNozzleIds`/`findNozzleById`/`migratePipelineNozzleRefs`/`removeNozzleById`. Ids are minted store-side in `VesselModeler.addNozzle` (onAddNozzle callbacks take `Omit<NozzleConfig,'id'>`); backfilled deterministically at load (`deserializeVesselState` runs backfill then `migratePipelineNozzleRefs`, resolving the deprecated `Pipeline.nozzleIndex` → `nozzleId` ONCE; saves write `nozzleId` only). Free-standing pipes = no `nozzleId` (carry `freeOrigin`). `appendage-cascade.ts` and `removeNozzle` filter by id (NO index-shifting); `nozzle-ref-remap.ts` (GA import) rewrites `nozzleId` by name. ThreeViewport/pipeline-geometry resolve `nozzleId` → live array index for the nozzle mesh groups (keyed by `nozzleIdx` userData).
- GA drawing import (design `plans/2026-07-30-ga-drawing-import-hardening-design.md`): `DrawingImportModal.tsx` (upload/crop/extract phases + PDF page selector) → `engine/drawing-parser.ts` (3-call Gemini ensemble, enforced responseSchema, `MODEL_CANDIDATES` fallback — NO silent defaults, unreadable fields are `missing`) → `engine/drawing-extraction-voting.ts` (pure per-field voting, agreement→confidence) → `engine/drawing-verifier.ts` (pure rules: ranges, NPS flag-only, tag checks; also `toExtractionResult`) → `DrawingReviewPanel.tsx` + `DrawingReviewRows.tsx` (dense editable grid, quiet-by-default tints, issues-only filter; apply gated on no missing fields incl. `mount`, and `radialOffset` for head mounts) → `engine/head-nozzle-placement.ts` (head-mounted manways: ellipsoid pos from CL offset, axial orientation — ignores extracted pos for head mounts; ALSO the single angle-conversion site: extraction/review angles are drawing-native 0=TDC-clockwise, `drawingClockToVesselAngle` converts to engine 90=top at apply — never convert in the prompt or UI) → `handleDrawingApply` (remaps `pipelines[].nozzleIndex` by name via `engine/nozzle-ref-remap.ts`, unmatched removals are user-confirmed). Gemini key via `services/gemini-proxy.ts` + `supabase/functions/gemini-proxy`.
- Appendage attachable parity (2026-07-31, phases 3+4 complete): junction cutouts consume `engine/junction-footprint.ts` — ONE `containsCell` predicate drives coverage/wall-loss exclusion AND the heatmap alpha mask (never re-derive); per-body wall-loss/coverage (`src/workers/wall-loss-compute.ts` `bodies[]`, Combined = summed shared-template bins, occlusion body-scoped); welds/lugs/annotations/coverage-rects/dome-scans all carry optional `bodyId` (spec-declared only; `appendage-cascade.ts` strips by body, identity-preserving); appendage closure dome math in `engine/dome-tangent.ts` (pure inverse of `createDomeScanPlane` — sampling must mirror the overlay projection, not dome-arc); annotation sampling unified in `engine/scan-sampling.ts` (`sampleAnnotationFootprint`, dome+body aware, feeds stats AND heatmap); flattened view: `FlattenedView/scan-surface.ts` (shared cell path + body routing) and `FlattenedView/appendage-panels.ts` (stacked per-appendage strips, one shared pxPerMm), junction footprints project via `angleToCircumMm` (vessel 90=TDC convention).
- Relief view (F27 absorb step 1, 2026-07-31): per-composite elevation-surface modal — `ReliefViewModal.tsx` + `ReliefViewport.tsx` (lazy-loaded from `sidebar/ScanCompositeSection.tsx`, NO VesselModeler.tsx involvement), pure adapter `engine/composite-relief-adapter.ts` (rows=yAxis/cols=xAxis verbatim, no rescaling); reuses TopologyViewer engine as-is (raycast grid helpers extracted to `TopologyViewer/engine/topology-raycast.ts`, page untouched). Standalone /topology page's deprecation is still an open decision.
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
