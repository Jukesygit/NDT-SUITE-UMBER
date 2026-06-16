# C-Scan Minimum Threshold Filter

**Date:** 2026-06-16
**Status:** Approved
**Author:** Claude (brainstorming session with Jonas)

## Problem

C-scan composite data often contains spurious low thickness readings that flag false positives in wall loss analysis. These bad readings contaminate statistics (min, mean, distribution) and carry through to the vessel modeler when composites are imported.

## Solution

A two-phase threshold filter in the C-scan visualizer:

1. **Preview mode (non-destructive):** Set a threshold value and immediately see the effect on the composite — values below the threshold render as transparent gaps and are excluded from stats. Tweak freely; clearing the threshold brings everything back.

2. **Apply mode (destructive):** Once happy with the threshold, permanently nullify all values below it in the composite's data array. Stats, wall loss distribution, and exports reflect the cleaned data. When imported into the vessel modeler, the bad readings are gone.

## UI

A "Min Cutoff" control in the toolbar (between Range and Stats):
- Numeric input (64px)
- **Preview** toggle button — enables non-destructive visual filter (amber highlight when active)
- **Apply** button — permanently bakes the threshold into the composite data (with confirmation dialog)

After Apply, the threshold control resets (the data is already clean). Metadata records the applied threshold for audit trail.

## Data Flow

### Preview (non-destructive)
```
DisplaySettings.minimumThreshold → CanvasViewport displayData memo
  → values < threshold replaced with null before Plotly render
  → StatsPanel recalculates excluding filtered values
```

### Apply (destructive)
```
User clicks Apply → confirmation dialog → APPLY_THRESHOLD worker message
  → worker nullifies values in composite Float32Array + nullMask
  → recalculates stats
  → returns updated composite → replaces state in CscanVisualizer
  → metadata stamped with threshold info
```

### Vessel Modeler Import
No changes needed. Applied threshold produces standard null cells in the data array — the modeler already handles no-data cells as transparent gaps in wall loss distribution, coverage stats, and 3D texture rendering.

## Files Modified

| File | Change |
|------|--------|
| `src/components/CscanVisualizer/types.ts` | Add `minimumThreshold` to `DisplaySettings` |
| `src/components/CscanVisualizer/ToolBar.tsx` | Add Min Cutoff input + Preview/Apply buttons |
| `src/components/CscanVisualizer/CanvasViewport.tsx` | Preview filtering in `displayData` memo |
| `src/components/CscanVisualizer/workers/cscanProcessor.worker.ts` | New `APPLY_THRESHOLD` message handler |
| `src/components/CscanVisualizer/CscanVisualizer.tsx` | Wire up state, worker messages, confirmation dialog |
| `src/components/CscanVisualizer/StatsPanel.tsx` | Respect threshold in preview mode stats |

## Metadata Audit Trail

When Apply runs, the composite's metadata is stamped:
```typescript
metadata: {
  appliedThreshold: 1.5,
  thresholdRemovedPoints: 342,
  thresholdRemovedPercent: 2.1
}
```

Annotated exports and reports can note "Minimum threshold: 1.5mm applied (342 points removed)".
