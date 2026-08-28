# Client-Share Stats Panel — Design

**Date:** 2026-08-25
**Status:** Approved for implementation
**Owner ask:** "The client viewer for the projects should include the stats so they can view those also — our version of the stats panel included in the client viewer."

## What exists today

- The modeler's stats panel (`UnifiedStatsPanel`) hosts two sections:
  - `stats/CoverageScopeSection` — RBA · Scoped · Achieved · Δ · status per feature, each cell stacked % over m², a Total row (area-weighted), and a rollup line.
  - `stats/WallLossStatsSection` — wall-loss distribution bins (swatch, name, range, area, %, points), spurious row, total row, nominal thickness, and a per-body selector (Combined / Main shell / each boot).
- The client share page (`/share/:token`) shows a reduced `ShareStatsTable` under the viewport: Feature / Target / Achieved / Δ / Status only. No RBA, no areas, no totals, no wall loss.

## Goal

The client viewer shows the same statistics the modeler's panel shows — same numbers, same sections — in the share page's own presentation idiom.

## Ruling constraints (all pre-existing, none new)

1. **Stats are computed from the FULL state at publish time; publishing never changes a number** (bundle-builder rule 3). The viewer formats shipped numbers; it never computes. This already governs `achievedPct` (which ships even when the scans layer is unpublished) — wall loss follows the same precedent: it is an aggregate deliverable, not a layer.
2. **The bundle carries NUMBERS, the viewer formats** with the shared engine formatters (`formatCoveragePct` / `formatCoverageDelta`).
3. **Chunk guard** (`verify:share-chunk`): the share page's static closure must not reach editor code. The modeler section components cannot be reused directly (they compute live from `VesselState` and sit in the modeler's graph); the share page gets its own components fed from the manifest.
4. **CSS-scope scar:** all share-page styling is `cs-` prefixed, colors set explicitly from `--clean-*` tokens; no app-theme tokens except `--font-sans`.
5. **Share-page accessibility rule:** status is never colour-alone — the word renders beside the dot. The share page keeps `<table>` semantics (existing pattern, mobile stacking via `data-label`).
6. **Published links outlive deploys.** All bundle-format additions are OPTIONAL fields — an old viewer ignores them, a new viewer dashes/hides what an old bundle lacks. **No `SHARE_BUNDLE_FORMAT` bump.**

## Bundle format changes (`components/clientShare/bundle-types.ts`)

Wire types are declared self-contained in `bundle-types` (as `ShareStatRow` already is — never aliased to internal engine types, so an internal refactor cannot silently change a published wire shape).

### `ShareStatRow` — additive optional fields

```ts
export interface ShareStatRow {
  key: string;
  label: string;
  targetPct?: number;        // (existing) scoped target
  achievedPct: number;       // (existing)
  deltaPct?: number;         // (existing)
  status: ComparisonStatus;  // (existing)
  // NEW — all optional; absent in pre-2026-08-25 bundles:
  rbaPct?: number;           // stored RBA entry, absent ⇒ dash (never 0)
  totalMm2?: number;         // feature coverable area
  targetMm2?: number;
  achievedMm2?: number;
  targetAuto?: boolean;      // targetSource === 'rects' → "auto" marker
}
```

### `ShareWallLoss` — new, optional per vessel

```ts
export interface ShareWallLossBin {
  minPct: number; maxPct: number;
  minMm?: number; maxMm?: number;   // custom/CA modes
  label?: string;
  area: number;                      // m²
  areaPercent: number;
  count: number;
}

export interface ShareWallLossBody {
  bodyId?: string;                   // absent ⇒ main shell
  name?: string;
  bins: ShareWallLossBin[];
  totalScannedArea: number;
  totalDataPoints: number;
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
}

export interface ShareWallLoss {
  nominalThickness: number;
  binMode: 'equal' | 'ca-based' | 'custom';
  binNames?: string[];
  combined: ShareWallLossBody;       // the all-bodies default view
  bodies: ShareWallLossBody[];       // main shell first, then appendages
}

export interface ShareManifestVessel {
  // ... existing fields ...
  wallLoss?: ShareWallLoss;          // NEW, absent when not computable
}
```

## Publish side

### Single-source the wall-loss request (no drift)

`useWallLossWorker` currently builds the `WallLossRequest` inline (~70 lines: slim composite mapping, footprints from `nozzle-footprint`, per-appendage bodies). The builder needs the identical request. Extract it:

- **New pure module `src/workers/wall-loss-request.ts`:**
  - `buildWallLossRequest(state: VesselState, config: WallLossGroupConfig, id?: number): WallLossRequest` — the hook's request-building code moved verbatim (including `DEFAULT_APPENDAGE_HEAD_RATIO` and `toSlim`).
  - `canComputeWallLoss(state, config): boolean` — the hook's gate, verbatim: `config?.enabled && hasScans && (config.nominalThickness ?? 0) > 0` where `hasScans` = any orientation-confirmed shell or dome composite.
  - No three.js, no React, no supabase — importable anywhere.
- `useWallLossWorker` refactored to call both (behaviour-identical: same debounce, same worker protocol, same result shape). The extraction IS the anti-drift mechanism — one request builder, two callers.

### Builder (`bundle-builder.ts`)

- `buildShareStats` row mapping gains the new fields from `FeatureComparisonRow` (`totalMm2`, `targetMm2`, `achievedMm2`, `targetSource === 'rects'` → `targetAuto: true`) plus `rbaPct` read via `readTargetEntry(state.coverageTargets, row.ref)` — exactly the logic `CoverageScopeSection` uses (set only when an entry exists; never coerce to 0).
- New `buildShareWallLoss(state): ShareWallLoss | undefined`:
  - `undefined` unless `canComputeWallLoss(state, state.wallLossGroups)`.
  - Otherwise call the pure `compute(buildWallLossRequest(state, config))` from `src/workers/wall-loss-compute.ts` **synchronously** (builder stays pure and sync; publish is a one-off user action and already does serialization work).
  - `undefined` when `combined.totalDataPoints === 0` (the modeler section renders nothing in that case).
  - Map response → wire shape (top-level `nominalThickness`, `binMode` from `config.binMode ?? 'equal'`, `binNames` from config).
- `buildShareBundle` computes it from the **full** `vessel.vesselState` (before sanitising, beside `buildShareStats`) and sets `wallLoss` on the manifest vessel entry.
- No change to `useClientShareMutations`, upload layer, edge function, or screenshot flow.

## Viewer side

The stats block under the viewport becomes the full panel, titled **Statistics** like the modeler's:

- **`ShareStatsTable.tsx` (coverage section, upgraded):**
  - Columns: Feature / **RBA** / Target / Achieved / Δ / Status. RBA, Target, Achieved cells stack % over m² (m² line rendered only when the area fields shipped — an old bundle degrades to today's %-only table with a dashed RBA column). Area text matches the modeler: `m² < 0.01 ? 4dp : 2dp`.
  - `targetAuto` renders the small "auto" marker with the modeler's title text ("Derived from drawn coverage rects").
  - **Total row** (tfoot): area-weighted sums over shipped `*Mm2` fields — rendered only when every row carries areas. Pure arithmetic over shipped numbers, same formula as `CoverageScopeSection.totals`.
  - Rollup line and status word-beside-dot stay exactly as they are.
  - Untracked renders `—`, never 0 (existing rule, keep).
- **New `ShareWallLossSection.tsx`:** mirrors `WallLossStatsSection`'s content as a `cs-` table — "Wall Loss Distribution · Nom. X mm" header, body `<select>` when appendage bodies exist (Combined / Main shell / boots; Combined default), rows swatch + name (`binNames[i] || bin.label || 'Bin N'`) / range (`label`, else mm pair for custom, else `minPct–maxPct%`) / area / % / points, spurious row when `spuriousCount > 0`, total row. The bin swatch colour ramp is copied as local constants (data colours, not theme). Renders nothing when `wallLoss` is absent.
  - Formatting helpers (`formatArea` 4dp/2dp, `formatPct` 2dp-under-0.1) copied as local functions — they are three lines each and the share page must not import from the modeler section components.
- `ShareVesselViewer.tsx` wraps both in the Statistics block and passes `vessel.wallLoss`.
- `client-share.css`: `cs-` styles for the new columns, stacked cells, auto marker, total rows, swatches, and the body selector — `--clean-*` tokens, explicit colors, mobile stacking extended to the new columns.

## Explicitly out of scope

- No draggable/resizable overlay on the share viewport (the modeler panel's chrome). The share page is a scrolling document read on any device; the stats live where they live today, below the viewport, now at full content parity.
- No client-side recomputation of any number, ever.
- `ShareVesselCards` unchanged.

## Tests

- `bundle-builder.test.ts` extensions:
  - Row mapping carries `rbaPct`/areas/`targetAuto`; RBA absent stays absent (no 0-coercion).
  - `wallLoss` present iff computable: absent when `wallLossGroups` disabled/missing, absent when no confirmed scans, present with a confirmed-scan fixture and numbers equal to a direct `compute()` call on the same request.
  - Wall loss is computed from the FULL state (present and identical even when the scans layer is unticked).
- New `wall-loss-request` unit test: request built for a fixture state matches the shape the worker path consumed before the extraction (composites split by body, footprints include appendages + main-shell nozzles, NWT fallbacks).
- `bundle-exclusions.test.ts` untouched (should keep passing — new fields are numbers/labels, no free text; bin `binNames` are user-entered names and ARE shipped — they name deliverable report bins, same class as annotation labels which ship by design).

## Verification gate

`npm run build` && `npm run test` && `npm run verify:share-chunk` — all three must pass; the chunk guard proves the new viewer components dragged no editor code into the loginless page.
