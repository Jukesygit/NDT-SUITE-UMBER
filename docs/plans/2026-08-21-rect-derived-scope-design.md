# Rect-Derived Scope Design (Scoped % = drawn coverage rects, manual fallback)

- **Date:** 2026-08-21
- **Status:** Design locked (owner ruling, this session). Supersedes part of `2026-08-17-coverage-comparison-design.md` — see "What this supersedes".
- **Problem:** The modeler stats panel shows three overlapping coverage sections (Coverage / Scan Coverage / Coverage vs Scope). Achieved is shown twice, targets three times, and the drawn-rect coverage number looks like a third "achieved" when it is actually *the scope definition*.

## The ruling (owner, 2026-08-21)

**Drawn coverage rects ARE how coverage is scoped.** A feature's Scoped % is **derived from its drawn rects** whenever it has any; the manual `scopedPct` entry remains only as a **fallback** for features that have no rects (and for boot domes, which have no rect-coverage math at all). RBA % stays a manual risk-assessment input, never the yardstick.

Resolution order, per comparison feature (this IS the new `targetPctOf` contract — still the ONE place that decides):

1. **Rect-derived:** feature's rect-covered area > 0 → `scopedPct = rectCoveredMm2 / totalMm2 × 100`, source `'rects'`. Any stored manual `scopedPct` is inert while rects cover the feature (kept in state, not consulted).
2. **Manual fallback:** no rect coverage, `CoverageTargetEntry` present → `entry.scopedPct`, source `'manual'`.
3. **Untracked:** neither → `targetPct === undefined`, existing semantics unchanged.

## What this supersedes (binding)

- 2026-08-17 §"The model": "Coverage rects are where/how guidance — they are *not* measured against scans" — **superseded**. Rects now define the scope side of the comparison. Achieved is still measured against the *feature*, never per-rect (the per-rect drill-down stays future work).
- 2026-08-17 Amendment: "`scopedPct` is THE comparison target" — **amended**: the *resolved scope* (rects first, manual fallback) is the target; `targetPctOf` remains the single decision point.
- `coverage-rect-features.ts` header ("nothing downstream may treat this grouping as area") — **still true and unchanged**: the derivation uses the real rasters (`computeCoverage` / `computeAppendageCoverageTotals.coveredMm2`), never the key-grouping. Reword the comment to say the grouping is for listing only; area comes from the coverage calculator.
- Handoff 2026-08-20 open item 2 ("two coverage vocabularies coexist... product call") — this is that call. Full reconciliation of the projects-side legacy `utils/coverage-calc.ts` vocabulary is a named follow-up, not in scope here.

## Engine changes (Phase 1)

### `engine/coverage-calculator.ts`

New export `computeRegionCoveredAreas(state): { leftHead: number; cylinder: number; rightHead: number }` (mm²) — the rect-drawn covered areas per main region, extracted from `computeCoverage(state.coverageRects, state)` (main-shell rects only, cutout-adjusted, head drape raster; exactly the numbers `CoverageStatsSection` shows today, ×1e6 to mm²). No new math — a projection of the existing `CoverageResult` so `coverage-comparison.ts` doesn't consume the m²-shaped UI type.

Boot shells already expose rect-covered area: `computeAppendageCoverageTotals().coveredMm2`. **Boot domes have no rect coverage anywhere** (`domeCoveredMm2` does not exist, no dome-rect raster) — they always resolve manual/untracked. Do NOT invent dome rect math in this change.

### `engine/coverage-comparison.ts`

- `FeatureComparisonRow` gains `targetSource?: 'rects' | 'manual'` (absent ⇔ untracked) and `targetMm2?: number` (rects: the covered mm²; manual: `scopedPct/100 × totalMm2`).
- `targetPctOf` changes signature to take the feature's resolved inputs (entry + rectCoveredMm2 + totalMm2) and return `{ pct, source, mm2 } | undefined` implementing the resolution order above. Every row still routes through it; no surface picks its own target.
- `computeComparisonRows` plumbs rect-covered areas: main regions from `computeRegionCoveredAreas`, boot shells from `coveredMm2`, boot domes `0` (never rect-derived).
- `computeComparisonRollup` semantics unchanged (area-weighted, tracked-only). Rect-derived rows are tracked rows.
- **Perf note:** `computeComparisonRows` now runs the rect sweep (`computeCoverage`). Every call site is already settled/one-shot (modeler sections settle 250ms; planning summary, report, share stats are one-shot) — acceptable by construction; do not wire it to live drag state (existing PERF RULE).

### Serialization / persistence

**None.** Derivation is read-time. `CoverageTargets` shape, serialization passthrough, `normalizeCoverageTargets`, and share-bundle handling are untouched. Manual entries persist as before.

## Modeler UI changes (Phase 2)

### One merged stats section

`CoverageStatsSection`, `ScanCoverageStatsSection`, and `CoverageComparisonSection` are **replaced by a single section** (new `stats/CoverageScopeSection.tsx`, title "Coverage"). Per comparison feature (from `computeComparisonRows` — engine numbers only, no local re-derivation):

| Feature | RBA (% + m²) | Scoped (% + m²) | Achieved (% + m²) | Δ + status dot |

- Scoped cell shows a small `auto` marker when `targetSource === 'rects'` (tooltip "Derived from drawn coverage rects"); manual values render plain; untracked renders "—" (never 0 — this also fixes `ScanCoverageStatsSection`'s untracked-as-0.0% conflation).
- RBA comes from `readTargetEntry` (informational; dash when no entry). RBA m² = `rbaPct/100 × totalMm2`.
- Total row: area-weighted like today's Scan Coverage totals; rollup footer line from `computeComparisonRollup` (the "X% achieved of Y% targeted · N of M short" line, and the "No targets set" note now says "Draw coverage rects or set targets in the Coverage panel").
- Appendage dome rows appear (they exist in `listComparisonFeatures`; Scan Coverage never showed them — closing that gap).
- Settled snapshot (250ms) as today.

### Toggle collapse

The three transient flags `showCoverage` / `showScanCoverage` / `showComparison` (+ their `TOGGLE_STATS_*` actions) collapse to ONE `showCoverage` + `TOGGLE_STATS_COVERAGE`. Update `StatsDropdown.tsx`, `UnifiedStatsPanel.tsx`, command-palette entries, and `useInspectionMode`'s `visibleStatLines` if it references the removed flags. Wall Loss untouched. These are never serialized — no migration.

### `sidebar/CoverageTargetsEditor.tsx`

- Per feature: when the resolved target source is `'rects'`, the Scoped input renders **read-only showing the derived %** with the `auto` marker; RBA input stays editable. When no rects cover the feature, the Scoped input behaves exactly as today (clearing removes the entry → untracked; clearing RBA keeps entry at `rbaPct: 0`).
- Boot dome rows: always manual (unchanged behavior).
- The panel's explainer text updates to: drawn rects define Scoped %; the manual field is a fallback for features without rects.
- Undo coalescing keys unchanged.

## Downstream surfaces — no code changes required

`FeatureComparisonTable`, `CoverageScopePanel`, `VesselPlanningStrip`/`useVesselPlanningSummary`, `coverage-scope-report.ts`/report docx, and `buildShareStats`/`ShareStatsTable` all read `computeComparisonRows`/rollup and pick up rect-derived targets automatically. `ShareStatRow.targetPct` contract ("absent ⇒ untracked, never coerced to 0") holds. Optional (not required): surface the `auto` marker on those tables later.

Known interaction, unchanged and re-affirmed: share stats are computed on the **pre-sanitize** state, so an unpublished coverage layer's rects still feed the published stats numbers (existing documented rule).

## Explicit non-goals

- No rect-coverage math for boot domes (permanent manual fallback until a dome-rect raster exists).
- No reconciliation of `utils/coverage-calc.ts` / `ScopeProgressCard` / `ScopeSection` (projects side, legacy vessel-wide number) — named follow-up; the product direction (scope = rects) now points the same way, but that surface reads a different calculation and has its own chunk constraints.
- No per-rect achieved drill-down; no head-mounted cutout subtraction on heads (still deferred everywhere).
- No serialization changes.

## Test plan (Phase 1 carries these)

Extend `engine/__tests__/coverage-comparison.test.ts`:

- Rect on shell → shell row `targetSource: 'rects'`, `targetPct` = covered/total, stored manual `scopedPct` ignored.
- No rects + manual entry → `'manual'`, `entry.scopedPct` (existing pinned test "uses scopedPct and ignores rbaPct" survives, scoped to this path).
- Neither → untracked (unchanged assertions).
- Boot shell rect (`bodyId`) → that boot's shell row rect-derived; its dome row unaffected.
- Boot dome NEVER rect-derived even when the boot has shell rects.
- Rect-derived rows participate in `computeComparisonRollup` area-weighting.
- `computeRegionCoveredAreas` mm² projection matches `computeCoverage` regions ×1e6.
- `coverage-scope-report` + `vessel-planning-summary` + `bundle-builder` suites must stay green unmodified except where they construct fixtures assuming manual-only targets (adjust fixtures, not semantics).

## Verification gate

`npm run build` · targeted `npx vitest run` over the coverage/comparison/report/planning/bundle suites · `npm run lint` · full suite with the CI exclusion for `useLayoutMode.test.ts`. Behavioral: a vessel with rects and no manual targets shows a fully tracked comparison; legacy saves with manual targets and no rects behave exactly as before.
