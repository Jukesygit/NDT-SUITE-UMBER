# Flattened Vessel View — Design Document

**Date:** 2026-04-13
**Status:** Approved

## Objective

Add a 2D flattened/unwrapped vessel shell view to the VesselModeler, similar to PACMAP Image Composite reports. The view shows thickness heatmap data overlaid with vessel geometry (welds, nozzles, saddles, lifting lugs) on a rectangular projection where X = axial position and Y = circumferential position. It serves as both an interactive in-app visualization and a report-ready export image.

## Coordinate System

- **X-axis (horizontal):** Axial position along vessel length in mm (0 = left tangent line)
- **Y-axis (vertical):** Circumferential position in mm (0 = top dead center, increasing downward, max = π × OD)
- Matches PACMAP convention

## Architecture

### New Files

```
src/components/VesselModeler/FlattenedView/
├── FlattenedViewport.tsx    (~250 lines)
├── geometry-projection.ts   (~150 lines)
└── legend-renderer.ts       (~80 lines)
```

**Total new code: ~480 lines across 3 files.**

### FlattenedViewport.tsx

React component wrapping an HTML5 Canvas 2D context. Receives `VesselState` and loaded scan composite data as props from VesselModeler.

Responsibilities:
- Canvas setup with pan/zoom (mouse wheel zoom, click-drag pan, fit-to-view reset)
- Render pipeline: heatmap → geometry overlays → dimensions → legend
- Hover tooltip showing thickness value or feature name
- Exposes canvas ref for screenshot export

### geometry-projection.ts

Pure functions that convert 3D vessel features to 2D flattened coordinates.

```typescript
// Convert nozzle config to 2D ellipse on flattened surface
function projectNozzle(nozzle: NozzleConfig, vesselOD: number): FlatNozzle

// Convert weld config to 2D line segment(s)
function projectWeld(weld: WeldConfig, vesselLength: number, vesselOD: number): FlatWeld

// Convert saddle config to 2D rectangle
function projectSaddle(saddle: SaddleConfig, vesselOD: number): FlatRect

// Convert lifting lug config to 2D marker
function projectLiftingLug(lug: LiftingLugConfig, vesselOD: number): FlatMarker

// Convert circumferential mm to canvas Y coordinate
function circumToY(angleDeg: number, vesselOD: number): number
```

### legend-renderer.ts

Draws the color scale bar, metadata header block, and dimension labels directly onto the canvas.

- Color bar with min/max thickness values
- Nominal thickness callout per strake (if available)
- Metadata block: vessel name, drawing number, project info
- Axial dimension scale (bottom), circumferential scale (left)

### Modified Files

- **VesselModeler.tsx** — Add tab toggle state (`'3d' | 'flattened'`). When `'flattened'`, render `FlattenedViewport` instead of `ThreeViewport`. Sidebar remains available.
- **report-image-capture.ts** — Add `captureFlattenedView()` that grabs the flattened canvas via `toDataURL()` for DOCX report insertion.

### No New Dependencies

- Canvas 2D is native browser API
- Colorscale interpolation reuses `src/utils/colorscales.ts`
- Pan/zoom patterns lifted from CscanVisualizer's CanvasViewport.tsx

## Rendering Pipeline

Layers painted in order:

1. **Background** — White fill, vessel outline rectangle (shell length × π × OD)

2. **Heatmap** — For each scan composite placed on the vessel:
   - Read Float32 thickness matrix (already in memory)
   - Map each data point's axial + circumferential position to canvas pixel
   - Apply active colorscale + range to determine pixel color
   - Skip sentinel values (leave transparent for null readings)

3. **Geometry overlays:**
   - Circumferential welds → vertical dashed lines at `weld.pos`, labeled CW01, CW02...
   - Longitudinal welds → horizontal dashed lines from `angle` between `pos` and `endPos`
   - Nozzles → circles at (pos, angle→mm), sized by diameter, labeled by name
   - Saddles → rectangles at axial position spanning circumferential footprint
   - Lifting lugs → small markers at (pos, angle→mm)

4. **Dimensions** — Axial mm along bottom edge, circumferential mm along left edge, weld-to-weld distances

5. **Legend** — Color bar + metadata header block

## Interaction

- **Pan:** Click-drag to pan the view
- **Zoom:** Mouse wheel to zoom in/out
- **Fit-to-view:** Button to reset zoom and center the vessel
- **Hover tooltip:** Shows thickness reading (mm) over heatmap, or feature name over geometry
- **Read-only:** No editing, annotation placement, or selection. All configuration stays in the 3D tab.

## Export / Report Integration

- Reuse `report-image-capture.ts` — grab canvas via `toDataURL()` as PNG
- Insert into DOCX report as a full-width image in the "Inspection Results" section
- Screen resolution initially; high-res offscreen render can be added later

## Data Flow

```
VesselModeler (parent)
  ├── vesselState (useReducer) ─────────┐
  ├── loaded scan composite data ───────┤
  │                                     ▼
  ├── [tab: '3d']      → ThreeViewport (existing)
  └── [tab: 'flattened'] → FlattenedViewport (new)
                              ├── geometry-projection.ts
                              └── legend-renderer.ts
```

No new data fetching. No new state management. The flattened view is a pure rendering consumer of existing state.

## Out of Scope

- Annotations / scan regions (explicitly excluded)
- Editable geometry in flattened view
- High-DPI / configurable resolution export (future enhancement)
- Strake-specific nominal thickness display (future enhancement if strake data is added to VesselState)
