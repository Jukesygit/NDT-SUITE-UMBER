---
tags:
  - vault/home
  - ndt-suite
aliases:
  - Vault Home
---

# NDT Suite Vault

Use this page when opening the whole repository as an Obsidian vault. For a quieter documentation-only vault, open the `docs` folder in Obsidian and start at [[docs/Home|Docs Home]].

## Start Here

- [[README|README]] - setup, scripts, architecture, and role model
- [[PRODUCT|Product Notes]] - product framing and domain context
- [[DESIGN|Design Direction]] - current visual and UX direction
- [[docs/Project Atlas|Project Atlas]] - map of the documentation set
- [[docs/Agent Memory|Agent Memory]] - compact context layer for coding agents
- [[docs/Engineering Log|Engineering Log]] - current engineering threads and handovers
- [[docs/Obsidian Setup|Obsidian Setup]] - how this vault is configured

## Current Work Areas

- Vessel modeler: `src/components/VesselModeler/`
- Project and inspection workflow: `src/pages/projects/`, `src/components/projects/`
- Personnel and competency management: `src/pages/personnel/`, `src/services/competency-*`
- Document control: `src/pages/documents/`, `src/services/document-control-service.ts`
- Supabase schema and policies: `database/`, `supabase/`
- Companion app: `companion/`

## Useful Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

## Capture Workflow

- Quick notes go in [[docs/inbox/README|Inbox]].
- Daily working notes go in `docs/journal/daily`.
- Feature planning notes go in `docs/plans` using [[docs/templates/Feature Plan|Feature Plan]].
- Durable decisions use [[docs/templates/Decision Record|Decision Record]].
- End-of-thread summaries use [[docs/templates/Handover Note|Handover Note]].
- Agent handoffs use [[docs/templates/Agent Task Handoff|Agent Task Handoff]].
