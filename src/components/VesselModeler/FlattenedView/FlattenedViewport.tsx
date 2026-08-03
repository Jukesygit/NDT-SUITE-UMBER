// =============================================================================
// FlattenedViewport — 2D unwrapped vessel view on HTML5 Canvas
// =============================================================================
// Renders thickness heatmaps, geometry overlays, dimension scales, and a color
// legend onto a pannable/zoomable canvas.  Consumes the same VesselState that
// the 3D ThreeViewport uses.
// =============================================================================

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { VesselState, ScanCompositeConfig } from '../types';
import {
  getCircumference,
  angleToCircumMm,
  datumToCircumMm,
  projectNozzle,
  projectCircWeld,
  projectLongWeld,
  projectSaddle,
  projectLiftingLug,
  projectStripLongWeld,
  projectStripLiftingLug,
  projectStripNozzle,
  wrapCircumCenters,
  getAxialOrientation,
  axialToIndexMm,
  axialFrac,
  circumDisplayMm,
  developFootprintBoundary,
  displayFootprintPolyline,
} from './geometry-projection';
import {
  compositesForBody,
  forEachCompositeCell,
  mainSurfaceProjector,
  stripSurfaceProjector,
  findThicknessAt,
  type SurfaceProjector,
} from './scan-surface';
import {
  computeStackLayout,
  buildStripSpecs,
  stripToCanvasX,
  stripToCanvasY,
  stripFromCanvasX,
  stripFromCanvasY,
  type StackLayout,
} from './appendage-panels';
import {
  drawColorBar,
  drawMetadataHeader,
  drawAxialScale,
  drawCircumScale,
} from './legend-renderer';
import type { LegendConfig } from './legend-renderer';
import { buildJunctionFootprint } from '../engine/junction-footprint';

// ---------------------------------------------------------------------------
// Public handle exposed via ref
// ---------------------------------------------------------------------------

export interface FlattenedViewportHandle {
  exportImage: () => string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  vesselState: VesselState;
  selectedWeldIndex?: number;
  selectedNozzleIndex?: number;
  selectedSaddleIndex?: number;
  selectedLugIndex?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING = { top: 80, right: 160, bottom: 60, left: 70 };

const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

// Fixed per-appendage-panel overhead (px): a title band above each strip and a
// gap separating it from the region above. Fixed pixels (not mm) so they shrink
// the shared to-scale pxPerMm uniformly rather than distorting either axis.
const PANEL_TITLE_PX = 18;
const PANEL_GAP_PX = 16;

// Selection halo — concentric strokes/arcs with decreasing opacity. Shared by the
// main-surface glow and the appendage-strip glow so a selected feature looks the
// same on either developed surface.
const GLOW_LAYERS = [
  { width: 20, alpha: 0.07 },
  { width: 14, alpha: 0.12 },
  { width: 8, alpha: 0.2 },
  { width: 4, alpha: 0.35 },
];

// ---------------------------------------------------------------------------
// Internal view state (mutable ref to avoid re-renders on every pan/zoom)
// ---------------------------------------------------------------------------

interface ViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FlattenedViewport = forwardRef<FlattenedViewportHandle, Props>(function FlattenedViewport(
  {
    vesselState,
    selectedWeldIndex = -1,
    selectedNozzleIndex = -1,
    selectedSaddleIndex = -1,
    selectedLugIndex = -1,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(0);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  // -----------------------------------------------------------------------
  // Coordinate transforms
  // -----------------------------------------------------------------------

  const getDrawDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { drawWidth: 0, drawHeight: 0, cssWidth: 0, cssHeight: 0 };
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    const drawWidth = cssWidth - PADDING.left - PADDING.right;
    const drawHeight = cssHeight - PADDING.top - PADDING.bottom;
    return { drawWidth, drawHeight, cssWidth, cssHeight };
  }, []);

  // Single to-scale (1:1) layout: equal mm/pixel on both axes so round bores
  // render round and scan footprints are not axis-stretched. The looser axis is
  // letterboxed (centred) via marginX/marginY. The shared scale ALSO fits the
  // stacked appendage panels below the main plot; with no appendage panels this
  // reduces EXACTLY to fitScale, so the main plot stays byte-identical.
  const getPlotMetrics = useCallback(() => {
    const { drawWidth, drawHeight } = getDrawDimensions();
    const vesselLength = vesselState.length;
    const circumference = getCircumference(vesselState);
    const strips = buildStripSpecs(vesselState);
    const layout = computeStackLayout(
      drawWidth,
      drawHeight,
      vesselLength,
      circumference,
      strips,
      { titlePx: PANEL_TITLE_PX, gapPx: PANEL_GAP_PX }
    );
    const reversed = getAxialOrientation(vesselState.scanComposites)?.reversed ?? false;
    return {
      pxPerMm: layout.pxPerMm,
      marginX: layout.marginX,
      marginY: layout.marginY,
      vesselLength,
      circumference,
      reversed,
      layout,
    };
  }, [vesselState, getDrawDimensions]);

  const toCanvasX = useCallback(
    (mm: number) => {
      const { pxPerMm, marginX, vesselLength, reversed } = getPlotMetrics();
      const { zoom, offsetX } = viewRef.current;
      if (pxPerMm <= 0) return PADDING.left;
      const pos = axialFrac(mm, vesselLength, reversed) * vesselLength; // reversed ? len-mm : mm
      return PADDING.left + marginX + pos * pxPerMm * zoom + offsetX;
    },
    [getPlotMetrics]
  );

  const toCanvasY = useCallback(
    (mm: number) => {
      const { pxPerMm, marginY, circumference, reversed } = getPlotMetrics();
      const { zoom, offsetY } = viewRef.current;
      if (pxPerMm <= 0) return PADDING.top;
      // Flip circumferential handedness when the axial axis is mirrored, so the
      // developed view is a proper view-from-the-other-end (not a mirror).
      const yMm = circumDisplayMm(mm, circumference, reversed);
      return PADDING.top + marginY + yMm * pxPerMm * zoom + offsetY;
    },
    [getPlotMetrics]
  );

  /** Inverse: canvas pixel → vessel mm (for hover lookups) */
  const fromCanvasX = useCallback(
    (px: number) => {
      const { pxPerMm, marginX, vesselLength, reversed } = getPlotMetrics();
      const { zoom, offsetX } = viewRef.current;
      if (pxPerMm <= 0 || zoom <= 0) return 0;
      const pos = (px - PADDING.left - marginX - offsetX) / (pxPerMm * zoom);
      return reversed ? vesselLength - pos : pos;
    },
    [getPlotMetrics]
  );

  const fromCanvasY = useCallback(
    (py: number) => {
      const { pxPerMm, marginY, circumference, reversed } = getPlotMetrics();
      const { zoom, offsetY } = viewRef.current;
      if (pxPerMm <= 0 || zoom <= 0) return 0;
      const yMm = (py - PADDING.top - marginY - offsetY) / (pxPerMm * zoom);
      // circumDisplayMm is its own inverse, so the same call undoes the flip.
      return circumDisplayMm(yMm, circumference, reversed);
    },
    [getPlotMetrics]
  );

  // -----------------------------------------------------------------------
  // Render pipeline
  // -----------------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const vesselLength = vesselState.length;
    const circumference = getCircumference(vesselState);
    if (vesselLength <= 0 || circumference <= 0) {
      ctx.restore();
      return;
    }

    // 2. Vessel outline rectangle. The vertical edges use the LINEAR
    //    circumferential extent (top = 0, bottom = circumference). They cannot
    //    use toCanvasY(circumference): under the handedness flip that wraps the
    //    seam back to the top (circumference ≡ TDC), collapsing the rect — and
    //    its clip — to zero height, which hides the heatmap.
    const x0 = toCanvasX(0);
    const x1 = toCanvasX(vesselLength);
    const {
      pxPerMm: vPx,
      marginX: vMarginX,
      marginY: vMarginY,
      reversed: vReversed,
      layout,
    } = getPlotMetrics();
    const { zoom: vZoom, offsetX: vOffsetX, offsetY: vOffsetY } = viewRef.current;
    const y0 = PADDING.top + vMarginY + vOffsetY;
    const y1 = PADDING.top + vMarginY + circumference * vPx * vZoom + vOffsetY;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // Shared view/scale for every developed surface (main shell + strips).
    const surfaceView = {
      pxPerMm: vPx,
      marginX: vMarginX,
      marginY: vMarginY,
      zoom: vZoom,
      offsetX: vOffsetX,
      offsetY: vOffsetY,
    };
    const mainProjector = mainSurfaceProjector(
      surfaceView,
      vesselLength,
      vesselState.id,
      vReversed
    );

    // 3. Clip to vessel rect for heatmap + overlays
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();

    // 3a. Heatmap from MAIN-SHELL scan composites. Appendage-body scans are
    //     routed to their own panels below (compositesForBody splits them out),
    //     so a bodyId composite never contributes a pixel to the main surface.
    paintComposites(ctx, compositesForBody(vesselState.scanComposites, undefined), mainProjector);

    // 3b. Geometry overlays (incl. appendage junction footprints)
    renderGeometry(ctx, vesselState);

    ctx.restore(); // un-clip

    // 3b-ii. Appendage developed panels, stacked below the main plot.
    renderStripPanels(
      ctx,
      vesselState,
      layout,
      surfaceView,
      selectedWeldIndex,
      selectedLugIndex,
      selectedNozzleIndex
    );

    // 3c. Selection glow — drawn OUTSIDE clip so it radiates freely.
    //     Uses concentric strokes with decreasing opacity for a soft halo
    //     (GLOW_LAYERS, shared with the appendage-strip glow).
    const od = vesselState.id;

    // Saddle glow
    if (selectedSaddleIndex >= 0 && selectedSaddleIndex < vesselState.saddles.length) {
      const rect = projectSaddle(vesselState.saddles[selectedSaddleIndex], od);
      const rx = toCanvasX(rect.x);
      const ry = toCanvasY(rect.y);
      const rw = toCanvasX(rect.x + rect.width) - rx;
      const rh = toCanvasY(rect.y + rect.height) - ry;
      ctx.save();
      ctx.setLineDash([]);
      for (const layer of GLOW_LAYERS) {
        ctx.globalAlpha = layer.alpha;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = layer.width;
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Nozzle glow — main-shell nozzles only; an appendage nozzle glows in its own
    // strip. Match the marker: per-axis radius + seam wrap.
    if (
      selectedNozzleIndex >= 0 &&
      selectedNozzleIndex < vesselState.nozzles.length &&
      vesselState.nozzles[selectedNozzleIndex].bodyId === undefined
    ) {
      const circle = projectNozzle(vesselState.nozzles[selectedNozzleIndex], od);
      const cx = toCanvasX(circle.cx);
      const rxPx = Math.abs(toCanvasX(circle.cx + circle.radius) - cx) || 4;
      const ryPx = Math.abs(toCanvasY(circle.cy + circle.radius) - toCanvasY(circle.cy)) || rxPx;
      ctx.save();
      for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
        const cy = toCanvasY(cyMm);
        for (const layer of GLOW_LAYERS) {
          ctx.globalAlpha = layer.alpha;
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = layer.width;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Lug glow — main-shell lugs only; an appendage lug glows in its own strip.
    if (
      selectedLugIndex >= 0 &&
      selectedLugIndex < vesselState.liftingLugs.length &&
      vesselState.liftingLugs[selectedLugIndex].bodyId === undefined
    ) {
      const marker = projectLiftingLug(vesselState.liftingLugs[selectedLugIndex], od);
      const cx = toCanvasX(marker.cx);
      const cy = toCanvasY(marker.cy);
      ctx.save();
      for (const layer of GLOW_LAYERS) {
        ctx.globalAlpha = layer.alpha;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, cy, layer.width, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 3d. Welds (drawn outside clip so they extend beyond vessel bounds)
    ctx.save();
    for (let wi = 0; wi < vesselState.welds.length; wi++) {
      const weld = vesselState.welds[wi];
      // Appendage welds render on their own strip (renderStripPanels), never on the
      // main surface. Skipping them here keeps the main plot byte-identical for any
      // model whose welds are all main-shell (bodyId undefined).
      if (weld.bodyId !== undefined) continue;
      const isSelected = wi === selectedWeldIndex;
      const projected =
        weld.type === 'circumferential' ? projectCircWeld(weld, od) : projectLongWeld(weld, od);

      const px = toCanvasX(projected.x1);

      // Base weld line
      ctx.strokeStyle = isSelected ? '#4ade80' : '#22c55e';
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.setLineDash(isSelected ? [8, 4] : [6, 4]);
      ctx.globalAlpha = isSelected ? 1 : 0.7;

      if (weld.type === 'circumferential') {
        ctx.beginPath();
        ctx.moveTo(px, y0 - 15);
        ctx.lineTo(px, y1 + 15);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(toCanvasX(projected.x1), toCanvasY(projected.y1));
        ctx.lineTo(toCanvasX(projected.x2), toCanvasY(projected.y2));
        ctx.stroke();
      }

      // Label — CW above chart, LW to the right of the line
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#16a34a' : '#333';
      ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
      if (weld.type === 'circumferential') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(projected.label, px, y0 - 18);
      } else {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(projected.label, toCanvasX(projected.x2) + 6, toCanvasY(projected.y2));
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();

    // 4. Dimension scales — axial axis labelled as scan-index distance from
    //    the scan start (0 on the left), matching the mirrored orientation.
    const axialOri = getAxialOrientation(vesselState.scanComposites);
    drawAxialScale(ctx, vesselLength, toCanvasX, y1 + 4, (mm) => axialToIndexMm(mm, axialOri));
    // Circumferential scale: anchor to the actual left edge (toCanvasX(0) is
    // the right edge when the axial axis is mirrored), and place ticks with a
    // plain linear mapping — NOT the flipping toCanvasY, which would scramble
    // the tick order. The labels are distance-from-TDC, which is the same in
    // either handedness, so a linear 0→circumference placement stays correct.
    const { pxPerMm: circPx, marginY: circMargin } = getPlotMetrics();
    const { zoom: circZoom, offsetY: circOffsetY } = viewRef.current;
    drawCircumScale(
      ctx,
      circumference,
      (mm) => PADDING.top + circMargin + mm * circPx * circZoom + circOffsetY,
      Math.min(x0, x1) - 4
    );

    // 5. Metadata header
    drawMetadataHeader(ctx, vesselState, PADDING.left, 10);

    // 6. Color legend (from first confirmed composite, if any)
    const firstComposite = vesselState.scanComposites.find(
      (c) => c.orientationConfirmed && c.data.length > 0
    );
    if (firstComposite) {
      const legendConfig: LegendConfig = {
        colorScaleName: firstComposite.colorScale,
        reverseScale: true,
        rangeMin: firstComposite.rangeMin ?? firstComposite.stats.min,
        rangeMax: firstComposite.rangeMax ?? firstComposite.stats.max,
      };
      const legendX = cssWidth - PADDING.right + 20;
      const legendY = PADDING.top;
      const legendH = Math.min(200, cssHeight - PADDING.top - PADDING.bottom);
      drawColorBar(ctx, legendConfig, legendX, legendY, 18, legendH);
    }

    ctx.restore();
  }, [
    vesselState,
    selectedWeldIndex,
    selectedNozzleIndex,
    selectedSaddleIndex,
    selectedLugIndex,
    toCanvasX,
    toCanvasY,
    getPlotMetrics,
  ]);

  // -----------------------------------------------------------------------
  // Heatmap painter — shared by the main shell and every appendage strip
  // -----------------------------------------------------------------------
  // Paints a set of scan composites into a screen-space buffer via the injected
  // SurfaceProjector, then blits it at the plot origin. The caller has already
  // clipped to the target surface's rect. All cell math (nearest/blocky, seam
  // skipping, colour) lives in the shared forEachCompositeCell so a strip renders
  // measurement data identically to the main surface — no per-body distortion.

  const paintComposites = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      composites: ScanCompositeConfig[],
      projector: SurfaceProjector
    ) => {
      if (composites.length === 0) return;
      const { drawWidth, drawHeight } = getDrawDimensions();
      if (drawWidth <= 0 || drawHeight <= 0) return;

      const bufW = Math.ceil(drawWidth);
      const bufH = Math.ceil(drawHeight);
      const offscreen = document.createElement('canvas');
      offscreen.width = bufW;
      offscreen.height = bufH;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;
      const imageData = offCtx.createImageData(bufW, bufH);
      const pixels = imageData.data;
      let hasData = false;

      for (const composite of composites) {
        forEachCompositeCell(composite, projector, bufW, bufH, (cell) => {
          for (let fy = cell.y0; fy < cell.y1; fy++) {
            for (let fx = cell.x0; fx < cell.x1; fx++) {
              const idx = (fy * bufW + fx) * 4;
              pixels[idx] = cell.r;
              pixels[idx + 1] = cell.g;
              pixels[idx + 2] = cell.b;
              pixels[idx + 3] = cell.a;
            }
          }
          hasData = true;
        });
      }

      if (hasData) {
        offCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(offscreen, PADDING.left, PADDING.top);
      }
    },
    [getDrawDimensions]
  );

  // -----------------------------------------------------------------------
  // Appendage developed panels (stacked below the main plot)
  // -----------------------------------------------------------------------
  // One strip per appendage that carries scan composites, at the SHARED to-scale
  // pxPerMm. X = axial position from the shell junction (left); Y = appendage
  // circumference cut at the datum 0° meridian (top). A body's scans and its
  // coverage rects render here and ONLY here (compositesForBody routing).

  const renderStripPanels = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      state: VesselState,
      layout: StackLayout,
      view: {
        pxPerMm: number;
        marginX: number;
        marginY: number;
        zoom: number;
        offsetX: number;
        offsetY: number;
      },
      selWeldIndex: number,
      selLugIndex: number,
      selNozzleIndex: number
    ) => {
      if (layout.pxPerMm <= 0 || layout.panels.length === 0) return;
      const { pxPerMm, marginX, marginY, zoom, offsetX, offsetY } = view;

      for (const panel of layout.panels) {
        const appendage = state.appendages.find((a) => a.id === panel.id);
        if (!appendage) continue;
        const appendageOD = appendage.diameter;

        // Panel canvas rect — LINEAR vertical extents (top = datum 0°, bottom =
        // circumference), never via a wrapping toCanvasY (Decision Log 2026-06-23).
        const left = PADDING.left + marginX + offsetX;
        const right = PADDING.left + marginX + panel.lengthMm * pxPerMm * zoom + offsetX;
        const top = PADDING.top + marginY + panel.topBasePx * zoom + offsetY;
        const bottom =
          PADDING.top +
          marginY +
          (panel.topBasePx + panel.circumferenceMm * pxPerMm) * zoom +
          offsetY;

        // Title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(panel.name, left, top - 4);

        // Border + datum (0°) reference line at the top edge
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
        ctx.stroke();
        ctx.restore();

        // Heatmap + coverage rects, clipped to the panel rect.
        const projector = stripSurfaceProjector(view, panel.topBasePx, appendageOD);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();

        paintComposites(ctx, compositesForBody(state.scanComposites, panel.id), projector);

        // Body coverage rects. Appendage rect.angle is the appendage datum
        // convention (0 = datum meridian); datumToCircumMm maps it to panel Y
        // from the top, matching the scan datum mapping used above. Wrapped
        // across the panel seam like circumferential markers.
        const stripView = {
          pxPerMm,
          marginX,
          marginY,
          zoom,
          offsetX,
          offsetY,
          paddingLeft: PADDING.left,
          paddingTop: PADDING.top,
          topBasePx: panel.topBasePx,
        };
        const appCirc = Math.PI * appendageOD;
        for (const rect of state.coverageRects) {
          if (rect.bodyId !== panel.id) continue;
          const centerMm = datumToCircumMm(rect.angle, appendageOD);
          const halfHmm = rect.height / 2;
          const cxL = stripToCanvasX(rect.pos - rect.width / 2, stripView);
          const cxR = stripToCanvasX(rect.pos + rect.width / 2, stripView);
          for (const cyMm of wrapCircumCenters(centerMm, halfHmm, appCirc)) {
            const yTop = stripToCanvasY(cyMm - halfHmm, stripView);
            const yBot = stripToCanvasY(cyMm + halfHmm, stripView);
            if (rect.filled) {
              ctx.save();
              ctx.globalAlpha = rect.fillOpacity ?? 0.2;
              ctx.fillStyle = rect.color;
              ctx.fillRect(cxL, yTop, cxR - cxL, yBot - yTop);
              ctx.restore();
            }
            ctx.strokeStyle = rect.color;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cxL, yTop, cxR - cxL, yBot - yTop);
          }
        }

        // Appendage welds — same visual language as the main-surface welds, placed
        // on THIS strip: a circumferential weld is a vertical line across the strip
        // at its axial pos; a longitudinal weld is a horizontal segment at its datum
        // angle, seam-wrapped inside the strip circumference (a weld on the datum cut
        // shows on both edges). Clipped to the panel so nothing bleeds into the
        // stacked neighbours; body-scoped so a main-shell weld never lands here.
        ctx.save();
        for (let wi = 0; wi < state.welds.length; wi++) {
          const weld = state.welds[wi];
          if (weld.bodyId !== panel.id) continue;
          const isSelected = wi === selWeldIndex;
          ctx.strokeStyle = isSelected ? '#4ade80' : '#22c55e';
          ctx.lineWidth = isSelected ? 2.5 : 1;
          ctx.setLineDash(isSelected ? [8, 4] : [6, 4]);
          ctx.globalAlpha = isSelected ? 1 : 0.7;

          if (weld.type === 'circumferential') {
            const cw = projectCircWeld(weld, appendageOD);
            const px = stripToCanvasX(cw.x1, stripView);
            ctx.beginPath();
            ctx.moveTo(px, top);
            ctx.lineTo(px, bottom);
            ctx.stroke();
            // Label at the top edge, inside the panel.
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.fillStyle = isSelected ? '#16a34a' : '#333';
            ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(cw.label, px, top + 2);
          } else {
            const lw = projectStripLongWeld(weld, appendageOD);
            const xA = stripToCanvasX(lw.x1, stripView);
            const xB = stripToCanvasX(lw.x2, stripView);
            const capHalf = (weld.capWidth ?? 8) / 2;
            for (const cyMm of wrapCircumCenters(lw.y1, capHalf, appCirc)) {
              const y = stripToCanvasY(cyMm, stripView);
              ctx.beginPath();
              ctx.moveTo(xA, y);
              ctx.lineTo(xB, y);
              ctx.stroke();
            }
            // Label to the right of the segment end.
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.fillStyle = isSelected ? '#16a34a' : '#333';
            ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(lw.label, xB + 6, stripToCanvasY(lw.y1, stripView));
          }
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.restore();

        // Appendage lifting lugs — the same fixed triangle marker as the main
        // surface, at (axial pos, datum angle) on the strip and seam-wrapped so a lug
        // on the datum cut shows on both edges. A selected lug gets the shared
        // concentric glow (clipped to the panel — cheap selection parity).
        for (let li = 0; li < state.liftingLugs.length; li++) {
          const lug = state.liftingLugs[li];
          if (lug.bodyId !== panel.id) continue;
          const marker = projectStripLiftingLug(lug, appendageOD);
          const cx = stripToCanvasX(marker.cx, stripView);
          const size = 6;
          // Wrap the fixed-pixel marker using its on-screen half-height in mm, so a
          // lug straddling the datum seam is drawn on both strip edges.
          const lugRadiusMm = pxPerMm * zoom > 0 ? size / (pxPerMm * zoom) : 0;
          const centers = wrapCircumCenters(marker.cy, lugRadiusMm, appCirc);

          if (li === selLugIndex) {
            ctx.save();
            for (const cyMm of centers) {
              const cy = stripToCanvasY(cyMm, stripView);
              for (const layer of GLOW_LAYERS) {
                ctx.globalAlpha = layer.alpha;
                ctx.fillStyle = '#22c55e';
                ctx.beginPath();
                ctx.arc(cx, cy, layer.width, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
          }

          for (const cyMm of centers) {
            const cy = stripToCanvasY(cyMm, stripView);
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx + size, cy + size);
            ctx.lineTo(cx - size, cy + size);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#333';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(marker.label, cx, cy - size - 3);
          }
        }

        // Appendage nozzles — the same ellipse + cross-hair marker as the main
        // surface, at (axial pos, datum angle) on the strip. Per-axis pixel radii
        // (rxPx from the strip X scale, ryPx from the strip Y scale — equal under the
        // shared 1:1 pxPerMm, but taken per-axis exactly like the main path) and
        // seam-wrapped by the bore radius so a nozzle on the datum cut shows on both
        // strip edges. A selected nozzle gets the shared concentric ellipse glow
        // (clipped to the panel), matching the main-surface nozzle selection.
        for (let ni = 0; ni < state.nozzles.length; ni++) {
          const nozzle = state.nozzles[ni];
          if (nozzle.bodyId !== panel.id) continue;
          const circle = projectStripNozzle(nozzle, appendageOD);
          const cx = stripToCanvasX(circle.cx, stripView);
          const rxPx = Math.abs(stripToCanvasX(circle.cx + circle.radius, stripView) - cx) || 4;
          const cyBase = stripToCanvasY(circle.cy, stripView);
          const ryPx =
            Math.abs(stripToCanvasY(circle.cy + circle.radius, stripView) - cyBase) || rxPx;
          const centers = wrapCircumCenters(circle.cy, circle.radius, appCirc);

          if (ni === selNozzleIndex) {
            ctx.save();
            for (const cyMm of centers) {
              const cy = stripToCanvasY(cyMm, stripView);
              for (const layer of GLOW_LAYERS) {
                ctx.globalAlpha = layer.alpha;
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = layer.width;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
          }

          for (const cyMm of centers) {
            const cy = stripToCanvasY(cyMm, stripView);
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Cross-hair
            ctx.beginPath();
            ctx.moveTo(cx - rxPx, cy);
            ctx.lineTo(cx + rxPx, cy);
            ctx.moveTo(cx, cy - ryPx);
            ctx.lineTo(cx, cy + ryPx);
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(circle.label, cx, cy - ryPx - 3);
          }
        }

        ctx.restore();
      }
    },
    [paintComposites]
  );

  // -----------------------------------------------------------------------
  // Geometry overlay helper
  // -----------------------------------------------------------------------

  const renderGeometry = useCallback(
    (ctx: CanvasRenderingContext2D, state: VesselState) => {
      const od = state.id; // geometry-projection functions accept vesselOD

      // 12 o'clock reference line (vessel TDC = 90° → Y = 0, top of the view)
      const tdcMm = angleToCircumMm(90, od);
      const tdcY = toCanvasY(tdcMm);
      const x0 = toCanvasX(0);
      const x1 = toCanvasX(state.length);
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, tdcY);
      ctx.lineTo(x1, tdcY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22c55e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      // Left edge — toCanvasX(0) is the right edge when the axis is mirrored.
      ctx.fillText("12 o'clock (TDC)", Math.min(x0, x1) + 4, tdcY - 3);
      ctx.restore();

      // Appendage junction footprints — the exact cylinder-on-cylinder opening
      // each appendage cuts in the main shell, developed onto this surface. The
      // boundary angles are the vessel clock convention (90 = TDC), so they map
      // through angleToCircumMm exactly like nozzle markers (NEVER datumToCircumMm;
      // that helper is only for scan datums — Decision Log 2026-06-22). Drawn as a
      // base layer so nozzles/labels stay legible on top; each footprint is drawn
      // at every seam-wrapped centre (same treatment class as wrapCircumCenters).
      const {
        pxPerMm: fpPxPerMm,
        marginY: fpMarginY,
        circumference: fpCirc,
        reversed: fpReversed,
      } = getPlotMetrics();
      const { zoom: fpZoom, offsetY: fpOffsetY } = viewRef.current;
      // Linear circ mm → canvas Y (the handedness flip is already baked into the
      // developed polyline, so this must NOT re-apply the wrapping toCanvasY).
      const fpCircToY = (mm: number) =>
        PADDING.top + fpMarginY + mm * fpPxPerMm * fpZoom + fpOffsetY;
      for (const appendage of state.appendages) {
        const fp = buildJunctionFootprint(od / 2, appendage);
        if (fp.boundary.length === 0) continue;
        const developed = developFootprintBoundary(fp.boundary, appendage.mountAngle, od);
        const disp = displayFootprintPolyline(developed, fpCirc, fpReversed);

        ctx.save();
        for (const copyCenter of wrapCircumCenters(disp.centerMm, disp.halfExtentMm, fpCirc)) {
          const shift = copyCenter - disp.centerMm;
          ctx.beginPath();
          disp.points.forEach((p, i) => {
            const px = toCanvasX(p.x);
            const py = fpCircToY(p.yMm + shift);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = '#8b5cf6';
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Name label at the footprint centre (mount meridian).
        ctx.fillStyle = '#6d28d9';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(appendage.name, toCanvasX(appendage.mountPos), fpCircToY(disp.centerMm));
      }

      // Welds are rendered outside the clip region (see main draw fn)

      // Saddles
      for (const saddle of state.saddles) {
        const rect = projectSaddle(saddle, od);
        const rx = toCanvasX(rect.x);
        const ry = toCanvasY(rect.y);
        const rw = toCanvasX(rect.x + rect.width) - rx;
        const rh = toCanvasY(rect.y + rect.height) - ry;

        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);

        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(
          rect.label,
          toCanvasX(rect.x + rect.width / 2),
          toCanvasY(rect.y + rect.height) + 2
        );
      }

      // Nozzles — drawn as ellipses because the developed view scales the axial
      // and circumferential axes independently, so a bore that is round on the
      // shell must use a separate pixel radius per axis (a single radius makes
      // it bulge/shrink circumferentially). Each nozzle is also drawn at every
      // seam-wrapped centre so a feature straddling the TDC cut is not clipped
      // in half at the top/bottom boundary.
      const circumference = getCircumference(state);
      for (const nozzle of state.nozzles) {
        // Appendage nozzles render on their own strip (renderStripPanels), never on
        // the main surface. Skipping them here keeps the main plot byte-identical for
        // any model whose nozzles are all main-shell (bodyId undefined).
        if (nozzle.bodyId !== undefined) continue;
        const circle = projectNozzle(nozzle, od);
        const cx = toCanvasX(circle.cx);
        const rxPx = Math.abs(toCanvasX(circle.cx + circle.radius) - cx) || 4;
        const ryPx = Math.abs(toCanvasY(circle.cy + circle.radius) - toCanvasY(circle.cy)) || rxPx;

        for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
          const cy = toCanvasY(cyMm);

          ctx.strokeStyle = '#e74c3c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Cross-hair
          ctx.beginPath();
          ctx.moveTo(cx - rxPx, cy);
          ctx.lineTo(cx + rxPx, cy);
          ctx.moveTo(cx, cy - ryPx);
          ctx.lineTo(cx, cy + ryPx);
          ctx.stroke();

          ctx.fillStyle = '#333';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(circle.label, cx, cy - ryPx - 3);
        }
      }

      // Lifting lugs — main-shell only; appendage lugs render on their strip.
      for (const lug of state.liftingLugs) {
        if (lug.bodyId !== undefined) continue;
        const marker = projectLiftingLug(lug, od);
        const cx = toCanvasX(marker.cx);
        const cy = toCanvasY(marker.cy);
        const size = 6;

        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.lineTo(cx - size, cy + size);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#333';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(marker.label, cx, cy - size - 3);
      }
    },
    [toCanvasX, toCanvasY, getPlotMetrics]
  );

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  const syncCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      render();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncCanvasSize, render]);

  // Re-render on vesselState change
  useEffect(() => {
    render();
  }, [render]);

  // -----------------------------------------------------------------------
  // Interaction handlers
  // -----------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const v = viewRef.current;
      const factor = e.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));

      // Zoom toward cursor
      v.offsetX = mx - ((mx - v.offsetX) * newZoom) / v.zoom;
      v.offsetY = my - ((my - v.offsetY) * newZoom) / v.zoom;
      v.zoom = newZoom;

      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(render);
    },
    [render]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        viewRef.current.offsetX += dx;
        viewRef.current.offsetY += dy;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };

        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
        setTooltip(null);
        return;
      }

      // Hover tooltip — find thickness under cursor
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const vesselLength = vesselState.length;
      const circumference = getCircumference(vesselState);

      // Resolve which developed surface the cursor is over, then look up thickness
      // scoped to that body: the main shell ignores appendage scans, and a strip
      // finds ONLY its own body's scans (body-scoped findThicknessAt).
      let hit: number | null = null;
      const mainAxial = fromCanvasX(mx);
      const mainCircum = fromCanvasY(my);
      if (
        mainAxial >= 0 &&
        mainAxial <= vesselLength &&
        mainCircum >= 0 &&
        mainCircum <= circumference
      ) {
        hit = findThicknessAt(
          vesselState.scanComposites,
          undefined,
          mainAxial,
          mainCircum,
          circumference,
          vesselState.id
        );
      } else {
        const { layout } = getPlotMetrics();
        const { zoom, offsetX, offsetY } = viewRef.current;
        for (const panel of layout.panels) {
          const appendage = vesselState.appendages.find((a) => a.id === panel.id);
          if (!appendage) continue;
          const stripView = {
            pxPerMm: layout.pxPerMm,
            marginX: layout.marginX,
            marginY: layout.marginY,
            zoom,
            offsetX,
            offsetY,
            paddingLeft: PADDING.left,
            paddingTop: PADDING.top,
            topBasePx: panel.topBasePx,
          };
          const posMm = stripFromCanvasX(mx, stripView);
          const circMm = stripFromCanvasY(my, stripView);
          if (posMm < 0 || posMm > panel.lengthMm || circMm < 0 || circMm > panel.circumferenceMm) {
            continue;
          }
          hit = findThicknessAt(
            vesselState.scanComposites,
            panel.id,
            posMm,
            circMm,
            panel.circumferenceMm,
            appendage.diameter
          );
          break;
        }
      }

      if (hit != null) {
        setTooltip({
          x: e.clientX - rect.left + 12,
          y: e.clientY - rect.top - 20,
          text: `${hit.toFixed(2)} mm`,
        });
      } else {
        setTooltip(null);
      }
    },
    [render, fromCanvasX, fromCanvasY, getPlotMetrics, vesselState]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    draggingRef.current = false;
    setTooltip(null);
  }, []);

  const handleFitView = useCallback(() => {
    viewRef.current = { zoom: 1, offsetX: 0, offsetY: 0 };
    render();
  }, [render]);

  // -----------------------------------------------------------------------
  // Imperative handle
  // -----------------------------------------------------------------------

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    },
  }));

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  return (
    <div ref={containerRef} className="absolute inset-0 bg-white">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: draggingRef.current ? 'grabbing' : 'crosshair' }}
      />

      {/* Fit button */}
      <button
        type="button"
        onClick={handleFitView}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
      >
        Fit
      </button>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none px-2 py-1 text-xs text-white bg-gray-800 rounded-full whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});

FlattenedViewport.displayName = 'FlattenedViewport';
export default FlattenedViewport;
