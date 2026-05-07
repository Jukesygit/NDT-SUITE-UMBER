---
tags:
  - agent-memory/brief
  - ndt-suite
aliases:
  - Project Brief
---

# Project Brief

NDT Suite is a web-based non-destructive testing platform for managing inspection projects, vessel models, ultrasonic scan data, personnel competencies, document control, and compliance workflows.

## Product Shape

- Operational app, not a marketing site. Screens should be dense, calm, and work-focused.
- Core domains: NDT inspection projects, vessel modelling, C-scan/PAUT data, report generation, competency management, document control, admin/security.
- Users include inspectors, managers, admins, and organizations with separated data access.
- The companion app handles local scan/file workflows and feeds data into the web app.

## Stack

- Frontend: React 18, TypeScript, Vite.
- UI styling: CSS files under `src/styles/` plus feature/page CSS.
- Server/data: Supabase Postgres, Auth, Storage, Edge Functions, Row-Level Security.
- Client state: TanStack React Query.
- 3D and inspection visualization: Three.js, canvas, Plotly where already used.
- Tests: Vitest and Testing Library.

## Architecture Pattern

```text
Page -> Hook -> Service -> Supabase Client -> RLS-protected database/storage
```

- Pages compose data and feature components.
- Query hooks live in `src/hooks/queries/`.
- Mutation hooks live in `src/hooks/mutations/`.
- Services live in `src/services/`.
- Shared types live in `src/types/` or feature-local `types.ts`.

## Common Constraints

- Respect organization boundaries and role-based access.
- Avoid caching or logging PII unless a note or service explicitly says it is safe.
- Database behavior may be controlled by RLS as much as by frontend code.
- Preserve existing user work in the working tree; do not revert unrelated changes.
- For UI work, follow the industrial operational design direction and avoid decorative card-heavy layouts.
- For vessel/scan work, verify math and coordinate assumptions against the relevant engine files before changing rendering.

## Useful Entrypoints

- `README.md` - project setup and commands.
- `VAULT.md` - root Obsidian vault entry.
- `docs/Home.md` - docs-only vault entry.
- `docs/Engineering Log.md` - active work areas.
- `docs/Project Atlas.md` - broader documentation map.
