# Annotation Tool Revamp — Design Document

**Date:** 2026-03-31
**Status:** Approved
**Context:** With interactive thickness scan composites now overlaid on vessels, the annotation tool should incorporate scan data and modernize its display.

---

## Overview

Three complementary improvements to the VesselModeler annotation system:

1. **Data-aware annotations** — annotations auto-read thickness data from scan composites underneath them
2. **Inspection mode** — click an annotation to enter a focused, locked-camera review with an expanded detail panel
3. **Visual revamp** — severity-coded borders, cleaner ambient labels, modern detail panel

---

## 1. Data Model Changes

### AnnotationShapeConfig — New Fields

```typescript
interface AnnotationShapeConfig {
  // ... existing fields (id, name, type, pos, angle, width, height, color, etc.)

  // Thickness stats (auto-computed when over scan data)
  thicknessStats?: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
    minPoint: { pos: number; angle: number };  // location of min reading
    maxPoint: { pos: number; angle: number };  // location of max reading
    sampleCount: number;                        // data points in footprint
  };

  // Image attachments
  attachments?: {
    id: string;
    type: 'upload' | 'viewport-capture';
    storagePath: string;           // Supabase Storage path
    caption?: string;
    capturedAt: string;            // ISO timestamp
  }[];

  // Severity border (computed from thresholds)
  severityLevel?: 'red' | 'yellow' | 'green' | null;
}
```

### Vessel-Level Thickness Thresholds

```typescript
interface ThicknessThresholds {
  mode: 'absolute' | 'percentage';
  // absolute mode
  redBelow?: number;      // mm
  yellowBelow?: number;   // mm
  // percentage mode
  nominalThickness?: number;  // mm
  redBelowPct?: number;       // e.g., 50
  yellowBelowPct?: number;    // e.g., 75
}
```

**Storage:** Both stored in existing `vessel_models.config` JSONB — no new tables.
**Attachments:** Images stored in Supabase Storage under `vessel-annotations/` bucket.

---

## 2. Thickness Stats Computation

### When Stats Are Calculated

- On annotation creation (if overlapping a scan composite)
- On annotation move/resize
- On scan composite orientation confirm or parameter change
- NOT on every frame — only on geometry changes

### Footprint Sampling Algorithm

1. Generate a grid of sample points within the annotation shape (spacing = scan data resolution or ~2mm, whichever is coarser)
2. For each sample point `(samplePos, sampleAngle)`:
   - Find which scan composite covers that point
   - Map to the composite's data grid using existing UV logic (scanDirection, indexDirection, datumAngleDeg, indexStartMm)
   - Read the thickness value at that grid cell
   - Skip null/NaN values
3. Compute min, max, avg, stdDev from all valid readings
4. Track the `(pos, angle)` of min and max points for leader line targeting
5. Store `sampleCount` for display

### Edge Cases

- **No scan data under annotation:** `thicknessStats: undefined`, `severityLevel: null`, ambient label shows no thickness info
- **Partial coverage:** Compute from available points, `sampleCount` reflects actual coverage
- **Multiple overlapping composites:** Use the topmost (last in array) at each sample point

### Severity Computation

```
if mode === 'absolute':
  red if min < redBelow
  yellow if min < yellowBelow
  green otherwise

if mode === 'percentage':
  redThreshold = nominalThickness * (redBelowPct / 100)
  yellowThreshold = nominalThickness * (yellowBelowPct / 100)
  same comparison logic
```

No thresholds configured: border uses the annotation's user-set color (current behavior preserved).

---

## 3. Visual Revamp

### Severity-Coded Borders

- Annotation outline color overridden by severity (red/yellow/green) when thresholds are configured and scan data exists
- Falls back to user-chosen color when no scan data or no thresholds
- Line width stays user-configurable

### Ambient Labels (always visible on 3D model)

Content (3 lines):
```
A1
Scan: 1250mm  Index: 3400mm
0.82 m²
```

Styling:
- Same CSS2D card style as current (dark background, subtle border)
- Left border accent colored by severity (red/yellow/green) — or user's annotation color if no scan data
- Same leader line + draggable positioning behavior as today

### Sidebar List

- Small severity dot (red/yellow/green) next to each annotation name in AnnotationSection
- Annotations without scan coverage show no dot

---

## 4. Inspection Mode

### Entering Inspection Mode

Triggered by clicking an annotation in the sidebar list or directly on the 3D model.

### Camera Behavior

1. **Compute target:** Position camera along the surface normal at annotation center, distance calculated so annotation footprint fills ~70% of viewport width
2. **Store previous state:** Save camera position, target, zoom before animation
3. **Animate:** Tween position + lookAt over ~500ms with ease-in-out
4. **Lock:** Disable OrbitControls, show lock indicator (small icon, top-left of viewport)

### Cycling Between Annotations

- Clicking another annotation while in inspection mode: camera tweens directly to the new annotation
- Panel content crossfades (stats/heatmap/attachments swap)
- Previous camera state preserved (from before first entering inspection mode)

### Exiting Inspection Mode

- Close button on panel, Escape key, or clicking empty sidebar area
- Camera tweens back to stored previous state (~500ms)
- OrbitControls re-enabled, panel slides out, lock indicator disappears

---

## 5. Detail Panel

Right-side panel (~350px wide), slides in on inspection mode entry.

### Layout

```
┌─────────────────────────────┐
│  ← Back          A1    🔴   │  Header: back button, name, severity badge
├─────────────────────────────┤
│  Position                    │
│  Scan: 1250mm  Index: 3400mm│
│  Size: 120mm × 85mm (0.82m²)│
├─────────────────────────────┤
│  Thickness                   │
│  ┌─────────────────────────┐│
│  │ Min    4.21 mm  ← hover ││  hovering draws leader to min point
│  │ Max    8.74 mm  ← hover ││  hovering draws leader to max point
│  │ Avg    6.12 mm          ││
│  │ StdDev 1.03 mm          ││
│  │ Points: 847             ││
│  └─────────────────────────┘│
├─────────────────────────────┤
│  Scan Data                   │
│  ┌─────────────────────────┐│
│  │   [cropped heatmap]     ││  2D view of footprint data
│  └─────────────────────────┘│
│  Colorscale: Jet  ▼        │
├─────────────────────────────┤
│  Attachments                 │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ img │ │ img │ │  +  │  │  thumbnails + add button
│  └─────┘ └─────┘ └─────┘  │
│  [Capture Viewport]         │
│  [Upload Image]             │
├─────────────────────────────┤
│  Thresholds: Absolute ▼     │
│  Red below:    5.0 mm       │
│  Yellow below: 6.5 mm       │
└─────────────────────────────┘
```

### Panel Interactions

- **Stat hover:** Hovering Min or Max row draws a dashed leader line to the exact point on the vessel
- **Thumbnail click:** Opens lightbox overlay
- **Thumbnail hover:** Shows delete button
- **Capture Viewport:** Saves current locked camera view as PNG to Supabase Storage, adds to attachments
- **Upload Image:** File picker for device photos, uploads to Supabase Storage
- **Mini heatmap:** Uses same colorscale as parent scan composite
- **Thresholds:** Edits vessel-level thresholds (shared across all annotations), changes recompute severity immediately

---

## 6. Stat Leader Lines

### Implementation

- SVG overlay absolutely positioned on top of the viewport (same z-index layer as detail panel)
- On stat row hover: compute screen coords of the row midpoint and the projected 3D point, draw line between them
- No Three.js geometry — purely 2D screen-space overlay

### Appearance

- Dashed line, white with slight transparency
- Small circle marker at the vessel-surface end (pulsing dot)
- Fades in on hover, fades out on mouseout (~150ms)
- Safety: if target point is behind camera, don't render

---

## 7. Image Attachments

### Storage

- Supabase Storage bucket: `vessel-annotations/`
- Path: `{organization_id}/{vessel_model_id}/{annotation_id}/{image_id}.png`
- Metadata (type, caption, timestamp) stored in the annotation config JSONB

### Viewport Capture

- Uses `renderer.domElement.toDataURL('image/png')` to capture current locked camera view
- Automatically attached with `type: 'viewport-capture'` and current timestamp

### Upload

- Standard file input accepting image types (png, jpg, webp)
- Uploaded to Supabase Storage with `type: 'upload'`

---

## Summary

| Feature | Description |
|---------|-------------|
| Data-aware annotations | Auto-compute min/max/avg/stdDev from scan data within annotation footprint |
| Severity borders | Red/yellow/green outline based on configurable thresholds (absolute mm or % of nominal) |
| Ambient labels | Name, position (scan/index mm), area (m²) — existing card style with severity accent |
| Inspection mode | Click annotation → camera locks front-on, detail panel slides in from right |
| Detail panel | Metadata, thickness stats, cropped mini heatmap, image attachments, threshold config |
| Stat leader lines | Hover Min/Max in panel → dashed line to exact point on vessel surface |
| Image attachments | Upload from device + capture viewport screenshot, stored in Supabase Storage |
| Annotation cycling | Click between annotations in sidebar without exiting inspection mode |
| Camera restore | Escape/close returns camera to pre-inspection position |
