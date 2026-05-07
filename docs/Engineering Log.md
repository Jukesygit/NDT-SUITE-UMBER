---
tags:
  - engineering/log
  - ndt-suite
aliases:
  - Engineering Log
---

# Engineering Log

Use this page as the running handoff point between Obsidian notes and code work.

## Active Areas

- Vessel modeler coverage, piping, viewport rendering, and material handling.
- Industrial theme polish across admin, documents, personnel, projects, profile, demos, and layout styles.
- Project inspection workflow, report readiness, scan viewer, and companion app integration.
- Supabase migrations, storage policies, and user/account security workflows.

## Recent Handovers

- [[plans/2026-05-01-industrial-theme-handover]]
- [[plans/2026-04-30-industrial-instrument-handover]]
- [[plans/2026-04-23-vessel-overview-page-implementation]]
- [[plans/2026-04-23-scan-viewer-landing-implementation]]
- [[plans/2026-04-16-paut-report-pdf-build-plan]]

## Working Rhythm

- Capture rough ideas in [[inbox/README|Inbox]].
- Promote implementation plans to `docs/plans/YYYY-MM-DD-topic.md`.
- Capture lasting architectural choices with [[templates/Decision Record|Decision Record]].
- End substantial work with [[templates/Handover Note|Handover Note]] so the next session has a clean trail.
- For agent continuity, update [[Agent Memory]] only when a change affects future project orientation.

## Useful Code Landmarks

- App routing: `src/App.tsx`
- Vessel modeler: `src/components/VesselModeler/`
- Vessel model services: `src/services/vessel-model-service.ts`
- Project workflow: `src/pages/projects/`, `src/components/projects/`
- Scan viewer: `src/components/projects/scan-viewer/`
- C-scan visualizer: `src/components/CscanVisualizer/`
- Supabase client: `src/supabase-client.ts`
- Database scripts: `database/`, `supabase/migrations/`
