# Tools & Projects — Comprehensive Review and Pivot Analysis

**Date:** 2026-07-12
**Scope:** C-Scan Visualizer (`/cscan`), Scan Viewer (`/scan-viewer` + project viewer), Vessel Modeler, Projects & inspection workflow, Companion engine, and the data flow that (should) connect them.
**Driving question (owner, verbatim):** "the app feels like a lot of ideas cobbled together that kind of work but not really."

## How this review was produced

Multi-agent review orchestrated under Fable: 9 analysis agents (5 Opus deep dives per area, 2 Sonnet inventory sweeps, 1 Opus standards researcher; 7 succeeded, research re-run separately), followed by **32 adversarial verification runs across 18 high-stakes claims** — each verifier instructed to *refute* the claim against the actual code — plus 5 orchestrator spot-checks of measurement-truth claims. Every finding below carries a verdict:

- **CONFIRMED** — an adversarial verifier (or direct spot-check) reproduced the evidence in code.
- **PARTIAL** — the underlying defect is real but the original claim was overstated or mis-attributed; the corrected version is what appears here.
- **REFUTED** — the claim was wrong. Refuted claims are listed in Part 5 so nobody "fixes" them later.

Verdict tally: 8 CONFIRMED, 8 PARTIAL (corrected), 2 REFUTED, +5 spot-checks confirmed.

---

## The core diagnosis

The "cobbled together" feeling has a precise engineering shape. It is **not** that the individual tools are bad — several contain genuinely strong engineering (typed-array streaming composites, immutable snapshot caching in the companion, content-based HDF5 format resolvers, a correct binary interchange path). It is that:

1. **There is no canonical scan record.** A scan exists in 6–8 incompatible representations (.nde HDF5 → companion numpy → browser CompositeData → CSV → IndexedDB session → Supabase composite+blob → vessel_models.config JSON → report PNG) with no provenance-bearing record binding them. Velocity is literally hardcoded to 5900 m/s on reload; gates and waveform context are never persisted. Each tool owns a private copy.
2. **Thickness — the product's core number — is computed by three different algorithms that disagree.** The instrument's sub-sample crossing (export), a non-interpolated full-res re-detection (interactive Tier-2), and a 30-sample-envelope re-detection (web worker). What the inspector tunes on screen is not what exports.
3. **Projects has the wrong domain model for its regulatory purpose.** No durable asset entity (assets are string-matched at render time), no CMLs/measurement history, therefore corrosion rate and remaining life — the reason API 510/570/653 inspection data management software exists — are structurally impossible to compute.
4. **Several display defaults silently violate the measurement-truth non-negotiable.** Mean-merge of overlapping passes, bilinear smoothing on screen and in the 3D overlay, fabricated gap-fill cells entering stats as "valid."

Fixing tools one at a time will not fix this. The pivot is a **data backbone + domain model**, with the existing tools re-anchored onto it.

## What is genuinely good (keep and build on)

- Leaf scan-viewer components (`CscanHeatmap`, `BscanStrip`, `AscanCanvas`, `GateControlsSidebar`) are genuinely shared between the two waveform viewer pages.
- Binary Float32+gzip composite storage with SHA-256 content hash on the companion side (`routes.py:1174`) — the right interchange design; the problem is the metadata that *doesn't* travel with it.
- Companion `FileCache` (immutable snapshots, monotonic versions, stale-write guard) and cooperative-cancel composite generation are clean concurrency engineering.
- `nde_format.py` resolves NDE 4.x vs legacy 3.0.1 by content existence, not version sniffing — honors the "no hardcoded HDF5 paths" rule.
- React Query wiring and org-scoped RLS are applied uniformly across the projects data layer.
- The flattened view's `geometry-projection.ts` is a correct single-source of the 2D conventions (the problem is that the 3D side has no equivalent).
- Design docs in `docs/plans/` are unusually thorough — several "duplications" turned out to be documented, intentional migrations (see Part 5).

---

# Part 1 — Measurement truth (non-negotiable violations)

These directly contradict "scan visualization must preserve measurement truth."

### 1.1 Three divergent thickness engines yield different numbers for the same wall — **CONFIRMED, critical**
- CSV export uses the instrument's float32 `crossing_time` (`companion/engine/cscan_export.py:70,97`).
- Interactive Tier-2 re-detects first-sample-≥-threshold on raw int16, **no sub-sample interpolation** (`companion/engine/waveform_thickness.py:81-104`).
- The web worker re-detects on a 30-bin max-pooled uint8 envelope (`src/workers/thickness-engine.worker.ts:139-155`).
- Only `extract_cscan` is validated against OmniPC (`companion/tests/test_cscan_accuracy.py`); no cross-test reconciles the three.
- **Verifier's sharpened point:** the export ignores the interactive gate state entirely — the exported CSV can differ from the on-screen refined C-scan the inspector chose.

**Fix:** designate `extract_cscan` (OmniPC-validated) as the authoritative TOF algorithm. Tier-1/Tier-2 must provably approximate it (shared fixture, fixed tolerance, cross-language test vectors). Export must honor active gate state. Add sub-sample linear interpolation to `waveform_thickness.py` (standard UT gauging — without it "full-res refinement" is *coarser* than the instrument data it overrides; quantum = sample_period·v/2).

### 1.2 Composite mean-merges overlapping passes — masks deepest corrosion — **CONFIRMED (spot-check), critical**
`cscanProcessor.worker.ts:680-700`: `compositeGrid[idx]+=val; weightGrid[idx]+=1` then divide = mean. Where passes overlap, a thin pit reading is averaged up by a thicker neighbouring pass. The minimum remaining wall is the safety-critical value in corrosion mapping; commercial merge tools use minimum (most conservative) as the default rule.
**Fix:** min-merge by default; make the merge rule explicit and recorded on the composite.

### 1.3 Gap-fill promotes fabricated cells to "valid" — **CONFIRMED (spot-check), major**
`cscanProcessor.worker.ts:704-742` fills 1-pixel aliasing gaps (deliberately conservative — opposite-side check, commented) but sets `weightGrid[idx]=1`, so interpolated cells enter stats/min/max/exports as measured data.
**Fix:** keep the cosmetic fill for display if desired, but track filled cells in a separate mask excluded from stats and flagged in exports.

### 1.4 Interpolated display defaults — screen and 3D overlay disagree with the data — **CONFIRMED (spot-check), major**
- `/cscan` defaults `smoothing:'best'` (bilinear) (`CscanVisualizer.tsx:64`) including the exported graph image path.
- The 3D heatmap texture uses `LinearFilter` min+mag (`engine/heatmap-texture.ts:106-107`) so thickness cells blend smoothly across the mesh — while hover reports the true nearest cell (`scan-sampling.ts:55-56`). Picture and readout disagree.

**Fix:** nearest-neighbor default everywhere a measurement is displayed (`NearestFilter`, `smoothing:'none'`); interpolation opt-in, labelled, and never in report/export paths.

### 1.5 Stats are inconsistent and one panel is stale — **CONFIRMED (spot-check), major**
`StatsPanel.tsx:14-87`: `useMemo` reads `minimumThreshold` but deps are `[data]` — threshold-filtered stats never recompute. Median takes a single middle element (no even-count average); the worker computes a *sampled* median. Numbers shown to inspectors are not reproducible across code paths.
**Fix:** one shared stats function; fix the deps; exact median.

### 1.6 Companion CSV quantizes thickness to 0.1 mm — **major**
`cscan_export.py:251-272` writes every thickness as `f"{v:.1f}"` although the engine computes float64 and the binary composite path already ships lossless float32. 0.1 mm steps are coarse for corrosion trending.
**Fix:** full precision in CSV (or make the binary path the sole measurement interchange; CSV becomes a human-facing report).

### 1.7 Legacy .nde over-read has no data-trust gate — **major**
Velocity is taken blindly (`nde_reader.py:173`); the known Ninian 2023 file reads ~38 mm walls against an 18–30 mm specimen window and would export silently.
**Fix:** sanity gate — flag thickness outside the specimen window / thickness-process min-max; surface velocity+wedge-delay provenance; never export a suspect wall without an inspector-visible warning.

### 1.8 Calibration step nominal rounding collapses half-mm steps — **minor but insidious**
`calibration.py:105-106` double-rounds to whole mm; a 12.5 mm cal step is recorded as 12 or 13, corrupting the calibration deviation record.

---

# Part 2 — The missing data backbone

### 2.1 Cloud composite is lossy and non-reproducible — **CONFIRMED, critical**
`scan-composite-service.ts:370-385` hardcodes `velocity: 5900`, `amplitude: null`, `envelope: null`, `timeStart: 0/end: 1` on reload. The save params and `scan_composites` schema have no velocity/gate/envelope columns — the context is never persisted, not just dropped on read. Downstream: `useThicknessEngine.ts:96` no-ops re-gating when envelope is null; the amplitude filter is inert. Re-gating after save requires the original .nde on a laptop running the companion — **the cloud is not the source of truth.**
**Fix (cheap first step):** add `velocity`, `ref_gate`/`meas_gate` (start/end/threshold), `gate_mode` columns (tens of bytes), populate on save, read back honestly. For laptop-free re-analysis: store the .nde itself in Storage keyed by content hash (the compact source), not the ~500 MB envelope cache.

### 2.2 Provenance is relational but has real gaps — **PARTIAL (corrected), high**
The original "zero provenance" claim was overstated: a project-linked composite *is* traceable via `project_vessel_id → equipment_config` (probe/wedge/serial), `scan_log_entries.scan_composite_id` (source filename, date), and `calibration_log_entries` (velocity, cal blocks). Real residual gaps:
1. `source_files` JSONB stores filename+bbox only — **no content hash**, no tamper evidence;
2. `project_vessel_id` is nullable with `ON DELETE SET NULL` — orphans lose the whole trail;
3. applied velocity lives on the vessel-level calibration log, not the composite that used it;
4. regenerate blind-upserts on `(project_vessel_id, section_type)` — no version history, no record of which files/gates produced the current matrix.

**Fix:** content hash into `source_files`; per-composite velocity/gates (2.1); version/audit row on regenerate; tighten the calibration link from vessel-granular to per-composite. Do **not** build a parallel scans table — extend the relational trail that exists.

### 2.3 Two divergent serializers, silent round-trip data loss — **CONFIRMED, critical**
In `VesselModeler.tsx`: `saveProject` (local JSON, 1683-1811) writes `coordinateOrigin`+`originSourceScanId` but **no** `domeScanComposites`; `buildSaveConfig` (cloud, 1814-1923) writes `domeScanComposites` but **no** `coordinateOrigin`/`originSourceScanId`; a third divergence — cloud save also drops `useGlobalOrigin`, silently changing scan placement behavior on round-trip (measurement-integrity relevant). Both hardcode `version:1`; the shared loader default-fills missing keys, so every omission is *silent* loss. This is the root disease behind the dome-overlay and composite-stats scars in project memory.
**Fix:** one `serialize()`/`deserialize()` pair over a single field manifest, real schema version + migration table, and a round-trip test that fails on ANY field whose save→load value diverges. That one test would have caught both historical regressions.

### 2.4 Model persistence holds a dangling reference with no fallback — **PARTIAL (corrected), major**
Corrected mechanism: every composite import path does set a `cloudId`, so "local-only composites lose data forever" was wrong. The real risks: (1) the local .json export is **not self-contained** (thickness matrix stripped, dome composites dropped entirely) — shared/offline/cross-org it renders empty; (2) reload refetches are **fire-and-forget** (`VesselModeler.tsx:2310-2339`) — a deleted row/RLS block leaves a blank overlay indistinguishable from an empty scan.
**Fix:** embed the gzipped matrix in the local export; verify the referenced composite row exists before stripping on cloud save; awaited refetches with per-composite loading/error UI.

### 2.5 Placement metadata lives in three places; IndexedDB sessions never converge — **major**
Placement exists in `vessel_scan_placements` (designed store), embedded in `vessel_models.config.scanComposites[]` (actual companion flow), and `project_vessels.section_folder_map`. Separately, `/cscan` sessions persist only to per-browser IndexedDB — invisible to teammates, lost on cache clear, not promotable to a project without re-import.
**Fix:** one placement store (the table); treat IndexedDB strictly as an offline draft cache of cloud records with an explicit promote/sync step.

### 2.6 Two companion integrations, incompatible models — **critical (integration)**
`CompanionScanPanel.tsx` (thickness composites → scan_composites) and `VesselModeler/sidebar/CompanionScanSection.tsx` (live B/D/A-scan PNGs → annotation attachments) share no code or model; the latter reconnects saved composites to .nde files by fuzzy filename matching (`normName`) because no file identity is stored.
**Fix:** one companion-scan module keyed by content hash (which the companion already computes — `routes.py:1174`); both thickness view and on-demand waveforms resolve from the same referenced source.

---

# Part 3 — The domain model gap (this is the pivot)

The industry-standard shape for this product category is a two-tier stack: **(a)** an analysis tool (what the companion + viewers are), feeding **(b)** an inspection data management system (IDMS) built on `asset → circuit/component → CML → timestamped reading history → corrosion rate → remaining life → next inspection date → code-compliant report`. NDT Suite has tier (a) in pieces and has built forms instead of tier (b). (Full sourced benchmark of what Meridium TM / Cenosco IMS / PCMS / OmniPC / UltraVision do: **Appendix B**.)

### 3.1 "Asset" is not an entity — it is string-matching at render time — **CONFIRMED, critical**
`AssetView.tsx:42-85` groups by `site_name` string (trim only, **case-sensitive**) then `vessel_tag.toLowerCase()`. `project_vessels` has no asset/equipment FK; every trip creates a fresh row. Same equipment links across trips only if strings happen to match. A legacy `assets` table exists but belongs to the removed Data Hub — unused, not a mitigation.
**Fix:** durable `assets`/equipment registry scoped by `organization_id` with natural key (site + tag), `asset_id` FK on `project_vessels`, backfill migration by normalized (site, tag), manual merge/relink UI for tag drift. Interim one-liner: normalize site the same way as tag so case variance stops splitting assets.

### 3.2 No CML/measurement-history model → corrosion rate and remaining life are structurally impossible — **critical (standards gap)**
Nominal thickness and corrosion allowance are TEXT columns; `scan_log.min_wt` is one hand-typed scalar; composite thickness is an opaque blob. Grep for corrosion-rate/remaining-life/t-min in `src/`: zero hits. This is the entire regulatory purpose of API 510/570/653 thickness monitoring.
**Fix:** CML/TML entities (id, location on asset, t-nominal, t-min, acceptance ref) with per-CML timestamped **immutable** readings; both corrosion rates computed server-side on insert — LTCR = (t_initial − t_actual)/time, STCR = (t_previous − t_actual)/time, governing rate = the higher (more conservative); remaining life = (t_actual − t_min)/CR; next-inspection ≤ half remaining life or code cap, with an FFS/overdue flag when below t_min (API 579 trigger). Consider a `circuit` entity between vessel and CML (CMLs sharing one governing rate) — first-class in every incumbent IDMS. Map scan minima to CMLs (the Vessel Modeler's scan placement is exactly the tool for locating CMLs on geometry — that's its standards-aligned role). Note the existing competency tables already model examiner certification — linking each survey to a certified examiner profile is a near-free code-compliance win no generic dashboard has.

### 3.3 Report's headline minimum is hand-typed, decoupled from measured data — **major**
`scan_log_entries.min_wt` is manual and nothing binds it to the composite's computed `stats.min`. The reported number can differ from the measurement.
**Fix:** derive from the linked composite (or per-CML minima); manual entry becomes override-with-flag.

### 3.4 No findings/indications entity; acceptance criteria is free text never evaluated — **major**
Results are one textarea; acceptance criteria a free-text field compared against nothing.
**Fix:** findings table (location, type, measured value, acceptance ref, pass/fail, disposition); auto-evaluate minima vs t-min; render a defect register.

### 3.5 No workflow state machine; sign-off is a typed name; report gating is presence-only — **CONFIRMED, major**
Status dropdowns allow any→any transition with no role check (`ProjectDetailPage.tsx:164-176`, `ReportBuilderPage.tsx:287-296`; services pass status through unchecked). Sign-off is re-editable free text with no `auth.uid()` attribution, no server timestamp, no lock. "Generate report" gates on field *presence* (and only the technician's name at that).
**Fix:** transition table (allowed next-states per role) enforced in service **and** DB trigger; append-only signoff records (auth.uid(), server timestamp, role, immutable — revocation = new row) that lock the inspection; report gating on attributed sign-off + acceptance evaluation. This dovetails with the in-flight server-authoritative activity-log work — same philosophy, same mechanisms.

### 3.6 Half-wired UI that creates the "kind of works" impression — **minor, cheap**
- `coverage_actual_pct` is never written; vessel cards render the dead column while the overview computes live — two answers for one metric.
- `TripView.tsx:130-140`: Export report / Duplicate / Archive buttons have no onClick.
- Status color maps switch on `'in_progress'`/`'pending_review'` — values not in the `VesselStatus` union — so every vessel renders "neutral."

---

# Part 4 — Duplication, surface sprawl, architecture

### 4.1 The scan-viewing surface, correctly scoped — **PARTIAL (heavily corrected)**
The "three duplicate C-scan viewers" claim was **corrected by verification**: `ScanViewerLandingPage` and `ScanViewerPage` already share the full presentational layer and differ only in orchestration (useState vs useReducer) and data source (companion-live vs Supabase). `/cscan` is a *different tool* (CSV-mosaic compositor; zero gate/waveform code) — and its coexistence is a **documented, intentional migration** (2026-04-16 design doc names the redundancy and contains a Phase-4 deprecation plan that was never executed).
**Fix:** (a) extract one `useScanViewer` reducer/hook over the shared components with pluggable data sources — kills the real duplication; (b) give `/scan-viewer` a save/link-to-project path — it is currently a genuine dead end (798 lines, zero persistence affordances; work vanishes on navigation); (c) **execute the existing Phase-4 plan** for `/cscan` (deprecation banner → adoption tracking → removal) or formally re-scope it as the permanent offline-CSV mode. Don't let it read as an abandoned fork.

### 4.2 Two report generators — **PARTIAL, decide ownership**
Both live: `report-generator.ts` (900-line docx from VesselState, editable Word skeleton) and `ReportDocument.tsx`+10 pages (print-to-PDF from persisted InspectionProject). ~7 section types duplicated across two data models. The 2026-04-16 design doc frames the React path as the replacement.
**Fix:** declare `ReportDocument` canonical (DB-authoritative). Either retire the docx path or narrow it to a documented "editable Word export" fed from the *same* report-data assembly keyed off InspectionProject. One report field defined once.

### 4.3 VesselModeler.tsx: 3,634 lines, 54× non-semantic escape hatch, no undo — **CONFIRMED, major**
All domain mutations funnel through `updateVessel((prev)=>next)` closures (~54 call sites) — opaque to any action log; ~29 useState/useRef coexist with the reducer; the drag-heavy modeling workflow has no undo (the only "Undo Last" is in the 2D screenshot overlay).
**Fix, cheapest first:** because everything already funnels through one callback, a capped snapshot ring-buffer at that single site yields undo/redo *immediately*. Then migrate closures to semantic slice actions (nozzles/scans/annotations) and split the component along the existing `sidebar/` seams.

### 4.4 Scene rebuild scope bug — **PARTIAL (narrowed)**
The claimed "any change rebuilds everything" is false — ThreeViewport has a genuine 3-tier reconciliation system. The real defect: scan/dome `opacity`, `colorScale`, `rangeMin/Max` are wrongly folded into `structuralHash` (lines 45, 51), so dragging a scan's opacity slider disposes and recreates every mesh in the vessel group.
**Fix:** remove visual-only params from the hash; update scan material/texture in place via the existing Tier-2 pattern.

### 4.5 Coordinate conventions re-derived inline in 8+ files — **CONFIRMED, major**
`datumAngleDeg + 90` hand-rolled in `annotation-heatmap.ts:80,141`, `CompanionScanSection.tsx:43`, `report-image-capture.ts:281`, `scan-gizmo-geometry.ts:168-217`, `scan-sampling.ts:42`, `texture-manager.ts:477`, `wall-loss-distribution.ts:98`; CW/CCW handedness branches duplicated across the same set plus `FlattenedViewport.tsx:482,911`; `normAngle` defined twice. This is the root cause of the twice-regressed TDC scar.
**Fix:** one `engine/vessel-coords.ts` shared by 3D and FlattenedView: `datumToVesselAngle()`, `vesselAngleToCircumMm()`, `scanOffset(datum, angle, dir)` covering the handedness branch. Fold the two partial helpers in. Property tests (roundtrip, wrap continuity, cw/ccw symmetry). Lint rule forbidding literal `+ 90` on datum angles.

### 4.6 Modeler breadth — **PARTIAL: refactor, not mission change**
Verification pushed back on "demote the CAD features": nozzles/saddles/repads *are* inspection geometry (repads=CUI, saddles=support corrosion) and the overlay *is* the scan mapping — the digital-twin mission is coherent and design-doc-backed. The defensible cut: treat Gemini AI drawing import, downstream piping segments, and lifting lugs as lazy-loaded optional modules; the concrete defect is decomposition (4.3), not breadth.

### 4.7 Other code health
- `CscanVisualizer.tsx`: 1,418 lines, ~30 useState, prop-drilling — extract hooks/reducer (prerequisite for 4.1c).
- Parser duplicated between `fileParser.ts` and the worker, kept in sync by comment; preview downsampling block-averages so a single-cell pit can vanish from the zoomed-out view (downsample the *minimum* for thickness).
- Zero unit tests for the production-path components/workers (thickness worker, heatmap worker, both god components, `routes.py`) — only extracted math modules are tested. Start with the measurement-critical workers.
- `companion/api/routes.py` (1,230 lines) mixes transport, DSP, and grid stitching; `_compute_tier2`/`_render_cursor_data` are 100-160-line engine functions inside the route module — and the cursor path runs a pure-Python per-beam×per-sample double loop on every cursor move (`routes.py:716-763`). Move to `engine/` + vectorize with the argmax approach `extract_cscan` already uses.
- No job/queue model: multi-GB HDF5 parsed synchronously in request handlers; `/calibration-files` runs full extraction per file uncached.

---

# Part 5 — Claims tested and REJECTED (do not "fix" these)

1. **"CSV ingestion + filename offset arbitration is the wrong data contract" — REFUTED.** `cscan_export.py:253-254` writes IndexStart/ScanStart into the CSV header; `fileParser.ts:194-195` reads them; a companion CSV never triggers offset repair. The repair apparatus exists for *third-party Evident/Olympus merged exports with corrupted (doubled) metadata* (2026-06-11 design doc) and only fires on >10 mm span-validated disagreement. The contract is sound.
2. **"Vessel Modeler and Projects are two separate persistence systems" — REFUTED.** No UI path writes `vessel_models` without a `project_vessel_id`; both save callbacks force a project+vessel picker; standalone context-free work persists via JSON export only. The nullable FK is an intentional, documented lifecycle. (Optional hardening: CHECK constraint + reconsider `ON DELETE SET NULL`.)
3. **"Offset repair must be ported into the .nde reader" — REJECTED with a warning.** `.nde` is self-describing HDF5 with authoritative axis offsets; the CSV repair heuristics (filename spans, IndexStart doubling) have no meaning there and **running them on correct .nde offsets risks corrupting good positioning**. If hardening is wanted: a lightweight sanity assertion on span finiteness, kept out of the CSV pipeline.
4. **"/cscan is an abandoned dead-end fork" — corrected.** It is a documented transitional tool with an unexecuted deprecation plan and a deliberate offline-CSV role (it is also the maintenance-mode landing page). The action is to execute or re-scope the plan, not to treat the tool as a mistake.

---

# Part 6 — Companion security & robustness

### 6.1 Local server auth is decorative — **CONFIRMED, critical (with structural insight)**
`server.py:64-74` validates Bearer only *when present* ("allow if absent — backward compat"); `/status` is auth-exempt and returns the live token (`routes.py:176`); WS auth failure hits `pass`. The verifier's key insight: because bootstrap requires unauthenticated `/status` to hand out the token, enforcing it can never create a real boundary against local processes — the actual security boundary is the 127.0.0.1 bind + CORS.
**Fix:** decide the model honestly. Either document localhost-bind+CORS as the real model and stop presenting the token as auth, or gate the token behind an OS-user secret (config file perms) rather than an open endpoint. Half-auth invites false confidence.

### 6.2 Arbitrary filesystem enumeration — **major**
`/list-directory` walks any path including all drive letters (`routes.py:1013-1043`). With auth optional, any allowed-origin page can enumerate the inspector's disk.
**Fix:** constrain to configured scan roots; reject traversal outside them.

### 6.3 `/browse-directory` spawns a server-side Tkinter dialog inside an HTTP handler — **minor** — blocks a worker, breaks headless, duplicates the web-native picker. Drop it.

---

# Part 7 — Strategic pivot recommendation

**The product to become:** the two-tier industry stack — the companion + one scan viewer as the *analysis tier*, and Projects rebuilt as a true *IDMS tier* (asset → CML → reading history → corrosion rate/remaining life → gated, signed, code-compliant reports). The Vessel Modeler's differentiating role is the bridge: locating CMLs and scan data on real geometry — something PCMS-class incumbents do poorly. That is a genuine market wedge; a prettier bag of disconnected viewers is not.

**Ranked pivot moves:**
1. **Canonical scan identity + provenance** (Part 2) — content hash everywhere, velocity/gates on the composite, versioned regenerate. Everything else composes on this.
2. **One thickness truth** (1.1) — single authoritative TOF, cross-tested; export honors gates; interpolation fixes.
3. **Asset + CML domain model** (Part 3) — the regulatory deliverable and the moat.
4. **Workflow integrity** (3.5) — state machine + attributed sign-off; aligns with the activity-log audit-trail work already in flight.
5. **Surface consolidation** (4.1, 4.2) — execute the existing deprecation plan; one viewer engine; one report pipeline.
6. **Architecture hardening** (4.3–4.5) — serializer unification + round-trip test, vessel-coords module, undo ring-buffer, scene-hash fix. These prevent the regression tax that has already hit twice.

# Part 8 — Prioritized roadmap

**Phase 0 — correctness quick wins (days, S efforts):**
NearestFilter on heatmap textures · smoothing default 'none' · StatsPanel deps bug + exact median · min-merge (or explicit rule) for overlaps · gap-fill mask excluded from stats · full-precision CSV · status-map enum keys · wire-or-remove dead buttons · normalize site string in AssetView · velocity+gate columns on scan_composites · stop returning token from /status.

**Phase 1 — data backbone (1–2 sprints):**
Content hash on source files · single serialize/deserialize + version + round-trip fidelity test · self-contained local export · awaited refetch with error UI · composite version/audit on regenerate · one placement store · unify the two companion integrations on hash identity.

**Phase 2 — domain model (2–4 sprints):**
Assets registry + backfill · CML entities + reading history · corrosion rate/remaining life calcs · findings register + acceptance evaluation · state machine + append-only sign-off · derived report minima.

**Phase 3 — consolidation (2–3 sprints):**
useScanViewer engine with pluggable sources · /scan-viewer save path · /cscan Phase-4 deprecation (or formal re-scope) · one report pipeline · VesselModeler decomposition + vessel-coords.ts + undo.

**Phase 4 — companion hardening (1 sprint):**
Honest auth model · scan-root confinement · job/queue for heavy parses · vectorized cursor path · routes.py split · legacy data-trust gate · calibration rounding fix.

---

# Appendix — Verification ledger

| # | Claim | Verdict | Disposition |
|---|-------|---------|-------------|
| 1 | Three independent C-scan viewers | PARTIAL | Scoped to 2 waveform pages; /cscan is a different tool (§4.1) |
| 2 | Modeler/Projects = two persistence systems | **REFUTED** | Already linked at creation; optional DB hardening only (§P5.2) |
| 3 | Offset repair missing from .nde path | PARTIAL | Not a defect; do NOT port CSV heuristics (§P5.3) |
| 4 | Two PAUT report generators | PARTIAL | Real duplication; decide ownership (§4.2) |
| 5 | /cscan is a dead-end fork | PARTIAL | Documented migration; execute Phase 4 (§4.1) |
| 6 | CSV data contract wrong | **REFUTED** | Origin preserved; repair targets 3rd-party corruption (§P5.1) |
| 7 | Pointer persistence loses scans | PARTIAL | Real: non-self-contained export + silent dangling refs (§2.4) |
| 8 | Two divergent serializers | **CONFIRMED** | +3rd divergence (useGlobalOrigin) found (§2.3) |
| 9 | Coordinate conventions scattered | **CONFIRMED** | 8 files + dual normAngle (§4.5) |
| 10 | 3.6k-line component, no undo | **CONFIRMED** | 54× escape hatch; ring-buffer undo is cheap (§4.3) |
| 11 | Any change rebuilds 3D scene | PARTIAL | 3-tier system exists; scan visuals wrongly in hash (§4.4) |
| 12 | Modeler mission sprawl | PARTIAL | Coherent mission; decompose, demote 3 modules (§4.6) |
| 13 | Asset is string-matched | **CONFIRMED** | Worse: site match is case-sensitive (§3.1) |
| 14 | No state machine / sign-off free text | **CONFIRMED** | Gating weaker than claimed (§3.5) |
| 15 | Composite has zero provenance | PARTIAL | Relational trail exists; 4 real gaps (§2.2) |
| 16 | Cloud composite lossy (velocity 5900) | **CONFIRMED** | Never persisted, not just dropped (§2.1) |
| 17 | Three divergent thickness engines | **CONFIRMED** | + export ignores active gates (§1.1) |
| 18 | Companion auth non-enforcing | **CONFIRMED** | Token structurally can't be a boundary (§6.1) |
| S1 | Overlap mean-merge | **CONFIRMED** (spot) | §1.2 |
| S2 | Gap-fill promoted to valid | **CONFIRMED** (spot) | §1.3 |
| S3 | LinearFilter on 3D heatmap | **CONFIRMED** (spot) | §1.4 |
| S4 | smoothing:'best' default | **CONFIRMED** (spot) | §1.4 |
| S5 | StatsPanel stale memo | **CONFIRMED** (spot) | §1.5 |

---

# Appendix B — Industry benchmark (sourced)

What the standard product does, per web research across Evident OmniPC/WeldSight, Zetec UltraVision, Eddyfi, GE Meridium TM, Cenosco IMS, PCMS, the NDE open file format spec, and API/ASME requirements. Each item: standard approach → implication for NDT Suite.

- **CML/TML data model** — Each location stores original/previous/current thickness plus full dated reading history, t-min, material, geometry; databases retain all surveys for equipment life. → `cmls` + `thickness_readings` (1-to-many, timestamped, immutable); never overwrite prior readings.
- **Dual corrosion-rate calculation** — LTCR = (t_initial − t_actual)/time; STCR = (t_previous − t_actual)/time; governing rate = the higher; recomputed on every reading. → Compute server-side (Postgres fn/edge) on insert; store both.
- **Remaining life & next-inspection interval** — RL = (t_actual − t_min)/CR; next inspection ≤ half RL or code cap (e.g., 10 yr API 510); sub-t-min triggers API 579 FFS. → Computed columns/views; due-date + FFS/overdue flag per CML.
- **Asset hierarchy** — Equipment/FLOC → corrosion Circuit (CMLs sharing a rate) → CML → measurement point → reading. → Circuit as a first-class table between vessel and CML; CML move/copy carries history.
- **Linked A/B/C-scan views** — Views bound to shared selection; moving a gate/cursor updates all panels live. → Bind viewers to shared state; gate edits re-derive all panels (supports §4.1's one-engine plan).
- **Gates and cursors** — Multiple gates with post-acquisition repositioning; distinct reference/measurement/data cursors. → Gates as editable overlay objects; recompute readings on gate move without re-import (requires §2.1's persisted gate context).
- **Thickness color mapping** — Configurable palette mapped to remaining-wall bands, editable per job. → User-editable color-scale legend tied to thickness thresholds, not a fixed gradient.
- **Nearest-neighbor vs interpolated display** — Raw encoded data renders as discrete cells preserving measurement truth; interpolation is an explicit toggle. → Confirms §1.4: non-interpolated default, opt-in smoothing, never silent.
- **Min-thickness merge for overlapping passes** — Merge/stitch resolves overlap to the most conservative (minimum) wall; auto min-thickness cursor per region. → Confirms §1.2: min-merge default + auto-min locator.
- **.nde reader compliance** — Parse `/Public/Setup` JSON first (probes, specimens, calibration); honor per-axis offset/resolution/quantity and value scaling; don't hardcode paths. → Confirms the companion's approach and Part 5.3's refutation (the .nde offsets are authoritative).
- **Calibration & instrument metadata** — ASME V Article 5: ±0.1 mm on a traceable step wedge (ASTM E797), in-date cert, probe details recorded with the survey. → Required report fields; block finalize if missing (supports §3.5 gating).
- **Examiner certification capture** — Readings valid only from SNT-TC-1A Level II / ISO 9712 L2, cert term ~3 yrs. → Link surveys to examiner profiles with level/expiry — the existing competency tables already model this.
- **Code-compliant report content** — Calibration, instrument/probe, certified examiner, gridded per-CML tables, min/avg per component, corrosion rate, remaining life; retained for equipment life. → Generate from stored data, enforce completeness, immutable records.
- **Historical baseline integrity** — Losing a baseline reading destroys LT rate and remaining-life; point locations must be stable over time. → Baselines immutable, stable CML IDs/coordinates (aligns with the activity-log audit-trail work).

Sources: ndeformat.com (4.x HDF5 structure, setup JSON, conventions), github.com/Evident-Industrial/NDE_Open_File_Format, Evident OmniPC/WeldSight docs, Zetec UltraVision 3.8 technical guidelines, GE Vernova Meridium Thickness Monitoring workflow docs, Cenosco IMS handbook (PEI hierarchy, CMLs), PCMS corrosion management module, API UT-21 thickness procedure, ASNT ISQ UT thickness, atlantisndt.com ASME V Art. 5 summary, inspenet/ifactory API 510/570/653 articles.
