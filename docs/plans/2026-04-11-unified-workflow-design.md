# Unified Workflow Design — NDT Suite

**Date:** 2026-04-11
**Status:** Design Exploration
**Branch:** `claude/unified-workflow-design-0pqz8`

---

## Context

The NDT Suite currently has three main tools that techs use sequentially:

1. **Companion App** (Python desktop) — reads NDE files (500-700MB HDF5), batch-exports C-scan CSVs, serves B/A-scan images via localhost FastAPI
2. **C-Scan Processor** (web, `/cscan`) — imports CSVs, repairs coordinates, creates composites, saves to cloud
3. **Vessel Modeler** (web, `/vessel-modeler`) — 3D vessel with scan overlays, annotations, thickness stats, photo attachments, Word report generation

The current workflow requires the tech to manually navigate between these, knowing what to do at each step. Report generation exists in the vessel modeler but feels tacked on rather than being a first-class destination.

**Key architectural insight:** The C-scan processor and vessel modeler are already routes in a single React SPA (Vite + React 18 + React Router 6 + Tailwind + Three.js). They share auth (Supabase), state management (React Query + Context), UI components, and services. The separation is UX, not architecture. The companion app is correctly separated (huge binary files require native Python/numpy processing).

---

## Two Avenues Explored

### Avenue 1: Guided Workflow on Current Architecture (Recommended First)

Add a **"Job"** concept and a workflow stepper that guides techs through the existing tools in sequence. Each step still uses the existing page/route, but a persistent workflow header shows progress and handles data handoff automatically.

**What this looks like:**
- Tech creates a "Job" (vessel name, client, date)
- Workflow stepper appears: Setup → Import Scans → Composite → 3D Model → Annotate → Report
- Each step routes to the existing tool but with context (the job auto-loads relevant data)
- Completing a step (e.g., saving a composite) automatically makes it available in the next step
- Report becomes the explicit final destination, not a hidden feature
- Job is persistent and reopenable — tech can leave and come back

**Why this is the right first move:**
- Low risk — builds on existing architecture, no rewrites
- Immediate UX improvement for non-technical techs
- The "Job" concept is the single biggest missing piece (every comparable professional tool — GOM Inspect, Pix4D, DRIVE NDT, Bluebeam — uses a project/job/case as the unifying entity)
- Can be shipped incrementally (start with just the job container + stepper, progressively add automation)

### Avenue 2: Full Unified Workspace (North Star Vision)

Since it's already one SPA, this becomes: embed C-scan processing and reporting as panels/tabs within a single workspace view, rather than separate routes. Think of it like a CAD application with dockable panels.

**What this looks like:**
- Single workspace page with a panel layout
- Left: job tree / navigation
- Center: active view (3D vessel, C-scan heatmap, or report preview)
- Right: properties/inspector panel
- Scan import, compositing, annotation, and report all happen within the same page context
- No page transitions — just panel/tab switches

**Why this is the north star but not the first move:**
- Avenue 1 is a prerequisite anyway (need the Job concept and data flow)
- Higher complexity — panel layout, state management across views
- Risk of scope creep
- But: would be a genuine differentiator in NDT software

---

## Industry Research Summary

Studied: 3D Slicer (medical imaging), GOM Inspect / ZEISS INSPECT (manufacturing QA), Pix4D (surveying), Bluebeam (construction), DRIVE NDT.

**Key patterns that apply:**
1. **Hub-and-spoke, not strict wizard** — Linear wizard for setup/import only. Working phase uses a dashboard where stages can be revisited freely. Expert users hate being locked into a sequence.
2. **Template/preset systems** — Separate "configure once" (engineer role) from "execute many times" (tech role). GOM Inspect's parametric inspection templates are the gold standard here.
3. **Annotations as workflow actions** — A markup should automatically become a finding that flows into the report. Don't make the tech re-enter data.
4. **Report as structured data, PDF as one view** — Living reports that update when data changes. Word/PDF as export formats, not the source of truth.
5. **Sensible defaults with progressive disclosure** — Simple flow visible, advanced settings behind expandable panels.

---

## Honest Assessment

**Good ideas:**
- The Job/project concept is essential and obviously correct
- Guided workflow stepper is high-value, low-risk
- Making report generation a first-class workflow step (not hidden)
- Automatic data handoff between stages (composite → modeler)

**Ideas to be careful with:**
- Full panel-based workspace (Avenue 2) is genuinely good but premature — ship Avenue 1 first, learn from real tech usage, then evolve
- "Next-generation reporting" beyond Word docs — be cautious. Word is actually a strength (clients can edit, techs are familiar). Innovate on the *input* side (auto-populated, structured data, preview) not necessarily the *output* format yet
- Combining everything into one page risks bloat and cognitive overload for the exact non-technical users you're designing for. The current route separation actually helps focus attention — it just needs a guide connecting the dots

**Bad ideas (being honest):**
- Trying to move companion app processing into the browser — NDE files are 500-700MB HDF5, numpy is essential. The current architecture is correct
- Building a full drag-and-drop panel/docking system — over-engineering for the user base. Techs want clarity, not flexibility
- Abandoning Word reports for a custom format — clients expect Word/PDF, and editability is a feature

---

## Recommended Implementation Plan

### Phase 1: Job Container + Workflow Stepper
- New `Job` data model in Supabase (name, client, vessel, date, status, stage)
- Job dashboard page (`/jobs`) — list/create/resume jobs
- Persistent workflow stepper component (header bar showing: Setup → Scans → Composite → Model → Annotate → Report)
- Job context provider that tracks current job and makes data available across routes
- Auto-association: composites and vessel models saved during a job get linked to that job

### Phase 2: Smart Data Handoff
- When a composite is saved during a job, it auto-appears in the vessel modeler's "load composite" list (filtered to current job)
- When annotations are created, they auto-populate the report section list
- Companion app status indicator in the workflow stepper (connected/disconnected)
- Pre-flight checklist before report generation (missing data warnings)

### Phase 3: Report as First-Class Step
- Report preview panel (see what the Word doc will look like before generating)
- Checklist UI for selecting which annotations/sections to include
- Report template selection (different clients/standards)
- One-click generate + download

### Phase 4 (Future): Workspace Evolution
- Evaluate whether techs actually want fewer page transitions (user research)
- If yes: side-by-side views (C-scan + 3D model), embedded compositing in vessel modeler
- If no: keep the guided multi-page flow but continue improving handoff automation

---

## Technical Notes

- **Existing patterns to reuse:** `UniversalImportModal` already implements a 4-stage wizard (upload → preview → importing → complete). Same pattern applies to the job workflow stepper.
- **State management:** Job state fits naturally into React Query + Supabase (same pattern as vessel models and scan composites)
- **Code splitting:** Already using lazy routes — adding `/jobs` route won't increase initial bundle
- **No new heavy dependencies needed** for Phase 1-3
- **Database:** New `jobs` table with RLS policies matching existing org-scoped pattern

---

## Files Referenced

| File | What it does |
|------|-------------|
| `src/App.tsx` | Router + lazy routes — where `/jobs` route would go |
| `src/components/CscanVisualizer/` | C-scan processor — Phase 2 data handoff target |
| `src/components/VesselModeler/` | 3D modeler — Phase 2 data handoff target |
| `src/components/VesselModeler/engine/report-generator.ts` | Word report generation (docx lib) |
| `src/components/VesselModeler/engine/report-image-capture.ts` | Screenshot pipeline for reports |
| `src/components/VesselModeler/engine/annotation-stats.ts` | Thickness stat computation |
| `src/components/import/UniversalImportModal.tsx` | Existing 4-stage wizard pattern to replicate |
| `src/services/vessel-model-service.ts` | Vessel model CRUD — pattern for job service |
| `src/services/scan-composite-service.ts` | Composite CRUD — needs job_id foreign key |
| `src/contexts/AuthContext.tsx` | Auth context — pattern for JobContext |
| `src/hooks/queries/` | React Query hooks — pattern for useJob, useJobs |
| `docs/plans/2026-04-08-ndt-companion-app-design.md` | Companion app design |
| `docs/plans/2026-04-09-paut-report-generation.md` | Report generation plan |
