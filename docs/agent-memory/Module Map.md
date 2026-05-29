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
- `src/services/vessel-model-service.ts` - persistence.
- `src/hooks/queries/useVesselModels.ts` and `src/hooks/mutations/useVesselModelMutations.ts` - data hooks.

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
