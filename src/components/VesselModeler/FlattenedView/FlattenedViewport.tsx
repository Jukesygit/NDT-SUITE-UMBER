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
  makeDevelopedFrame,
  developFootprintBoundary,
  displayFootprintPolyline,
  type DevelopedFrame,
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
  stripPx,
  stripPy,
  stripPosAt,
  stripCircAt,
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
    const orientation = vesselState.orientation;
    const layout = computeStackLayout(
      drawWidth,
      drawHeight,
      vesselLength,
      circumference,
      strips,
      { titlePx: PANEL_TITLE_PX, gapPx: PANEL_GAP_PX },
      orientation
    );
    const reversed = getAxialOrientation(vesselState.scanComposites)?.reversed ?? false;
    return {
      pxPerMm: layout.pxPerMm,
      marginX: layout.marginX,
      marginY: layout.marginY,
      vesselLength,
      circumference,
      reversed,
      orientation,
      layout,
    };
  }, [vesselState, getDrawDimensions]);

  // The ONE orientation-aware developed→canvas mapping (Decision Log 2026-06-22 /
  // 06-23 conventions + the vertical-vessel portrait transpose). Geometry, heatmap
  // and hover all read it, so they always agree in one frame. Horizontal reduces
  // to the historical toCanvasX/toCanvasY/fromCanvasX/fromCanvasY arithmetic.
  const getFrame = useCallback((): DevelopedFrame => {
    const { pxPerMm, marginX, marginY, vesselLength, circumference, reversed, orientation } =
      getPlotMetrics();
    const { zoom, offsetX, offsetY } = viewRef.current;
    return makeDevelopedFrame({
      orientation,
      pxPerMm,
      marginX,
      marginY,
      zoom,
      offsetX,
      offsetY,
      originX: PADDING.left,
      originY: PADDING.top,
      vesselLength,
      circumference,
      reversed,
    });
  }, [getPlotMetrics]);

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

    const {
      pxPerMm: vPx,
      marginX: vMarginX,
      marginY: vMarginY,
      reversed: vReversed,
      orientation,
      layout,
    } = getPlotMetrics();
    const { zoom: vZoom, offsetX: vOffsetX, offsetY: vOffsetY } = viewRef.current;
    const vertical = orientation === 'vertical';
    const frame = getFrame();
    const kZoom = vPx * vZoom;
    const od = vesselState.id;

    // 2. Vessel outline rectangle. The axial extent runs along its screen axis
    //    (X horizontal / Y vertical); the circumferential extent is drawn LINEARLY
    //    (0 → circumference) — NOT via the flipping circScreen, which under the
    //    handedness flip wraps the seam back to the start (circumference ≡ TDC),
    //    collapsing the rect and its clip and hiding the heatmap (Decision Log
    //    2026-06-23). For a vertical vessel the developed plane is transposed:
    //    axial is screen-vertical (top of vessel at top), circumference horizontal
    //    (TDC = left seam edge), so longitudinal strips read as vertical bands.
    const axialLo = frame.axialScreen(0);
    const axialHi = frame.axialScreen(vesselLength);
    const circBase = vertical
      ? PADDING.left + vMarginX + vOffsetX
      : PADDING.top + vMarginY + vOffsetY;
    const circLinLo = circBase;
    const circLinHi = circBase + circumference * kZoom;

    const rectLeft = vertical ? Math.min(circLinLo, circLinHi) : Math.min(axialLo, axialHi);
    const rectRight = vertical ? Math.max(circLinLo, circLinHi) : Math.max(axialLo, axialHi);
    const rectTop = vertical ? Math.min(axialLo, axialHi) : Math.min(circLinLo, circLinHi);
    const rectBottom = vertical ? Math.max(axialLo, axialHi) : Math.max(circLinLo, circLinHi);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.strokeRect(rectLeft, rectTop, rectRight - rectLeft, rectBottom - rectTop);

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
      vReversed,
      orientation
    );

    // 3. Clip to vessel rect for heatmap + overlays
    ctx.save();
    ctx.beginPath();
    ctx.rect(rectLeft, rectTop, rectRight - rectLeft, rectBottom - rectTop);
    ctx.clip();

    // 3a. Heatmap from MAIN-SHELL scan composites. Appendage-body scans are
    //     routed to their own panels below (compositesForBody splits them out),
    //     so a bodyId composite never contributes a pixel to the main surface.
    paintComposites(ctx, compositesForBody(vesselState.scanComposites, undefined), mainProjector);

    // 3b. Geometry overlays (incl. appendage junction footprints)
    renderGeometry(ctx, vesselState, frame);

    ctx.restore(); // un-clip

    // 3b-ii. Appendage developed panels, stacked alongside the main plot.
    renderStripPanels(
      ctx,
      vesselState,
      layout,
      surfaceView,
      orientation,
      selectedWeldIndex,
      selectedLugIndex,
      selectedNozzleIndex
    );

    // 3c. Selection glow — drawn OUTSIDE clip so it radiates freely.
    //     Uses concentric strokes with decreasing opacity for a soft halo
    //     (GLOW_LAYERS, shared with the appendage-strip glow).

    // Saddle glow
    if (selectedSaddleIndex >= 0 && selectedSaddleIndex < vesselState.saddles.length) {
      const rect = projectSaddle(vesselState.saddles[selectedSaddleIndex], od);
      const c0x = frame.px(rect.x, rect.y);
      const c0y = frame.py(rect.x, rect.y);
      const c1x = frame.px(rect.x + rect.width, rect.y + rect.height);
      const c1y = frame.py(rect.x + rect.width, rect.y + rect.height);
      const rx = Math.min(c0x, c1x);
      const ry = Math.min(c0y, c1y);
      const rw = Math.abs(c1x - c0x);
      const rh = Math.abs(c1y - c0y);
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
    // strip. Match the marker: per-axis radius (swapped for a vertical view) + seam wrap.
    if (
      selectedNozzleIndex >= 0 &&
      selectedNozzleIndex < vesselState.nozzles.length &&
      vesselState.nozzles[selectedNozzleIndex].bodyId === undefined
    ) {
      const circle = projectNozzle(vesselState.nozzles[selectedNozzleIndex], od);
      const rAx = frame.axialDeltaPx(circle.radius) || 4;
      const rCi = frame.circDeltaPx(circle.radius) || rAx;
      const exRx = vertical ? rCi : rAx;
      const exRy = vertical ? rAx : rCi;
      ctx.save();
      for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
        const cx = frame.px(circle.cx, cyMm);
        const cy = frame.py(circle.cx, cyMm);
        for (const layer of GLOW_LAYERS) {
          ctx.globalAlpha = layer.alpha;
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = layer.width;
          ctx.beginPath();
          ctx.ellipse(cx, cy, exRx, exRy, 0, 0, Math.PI * 2);
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
      const cx = frame.px(marker.cx, marker.cy);
      const cy = frame.py(marker.cx, marker.cy);
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

    // 3d. Welds (drawn outside clip so they extend beyond vessel bounds).
    //     A circumferential weld is a full ring → a line spanning the whole
    //     circumference at its axial position (a vertical line horizontally,
    //     a horizontal line for a vertical vessel). A longitudinal weld is a
    //     segment at its circ angle running along the axial axis.
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

      // Base weld line
      ctx.strokeStyle = isSelected ? '#4ade80' : '#22c55e';
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.setLineDash(isSelected ? [8, 4] : [6, 4]);
      ctx.globalAlpha = isSelected ? 1 : 0.7;

      if (weld.type === 'circumferential') {
        const aScreen = frame.axialScreen(projected.x1);
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(circLinLo - 15, aScreen);
          ctx.lineTo(circLinHi + 15, aScreen);
        } else {
          ctx.moveTo(aScreen, circLinLo - 15);
          ctx.lineTo(aScreen, circLinHi + 15);
        }
        ctx.stroke();

        // Label at the seam-start end of the line.
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? '#16a34a' : '#333';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        if (vertical) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(projected.label, circLinLo, aScreen - 4);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(projected.label, aScreen, circLinLo - 18);
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(frame.px(projected.x1, projected.y1), frame.py(projected.x1, projected.y1));
        ctx.lineTo(frame.px(projected.x2, projected.y2), frame.py(projected.x2, projected.y2));
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? '#16a34a' : '#333';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          projected.label,
          frame.px(projected.x2, projected.y2) + 6,
          frame.py(projected.x2, projected.y2)
        );
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();

    // 4. Dimension scales. The axial axis is labelled as scan-index distance from
    //    the scan start; the circumferential axis as distance-from-TDC. For a
    //    vertical vessel the two axes swap screen sides (axial down the left,
    //    circumference along the bottom).
    const axialOri = getAxialOrientation(vesselState.scanComposites);
    const axialLabel = (mm: number) => axialToIndexMm(mm, axialOri);
    const circLinear = (mm: number) => circBase + mm * kZoom;
    if (vertical) {
      // Axial scale down the left edge (ticks horizontal); circ scale along the bottom.
      drawCircumScale(ctx, vesselLength, (mm) => frame.axialScreen(mm), rectLeft - 4, axialLabel);
      drawAxialScale(ctx, circumference, circLinear, rectBottom + 4);
    } else {
      drawAxialScale(ctx, vesselLength, (mm) => frame.axialScreen(mm), circLinHi + 4, axialLabel);
      drawCircumScale(ctx, circumference, circLinear, Math.min(axialLo, axialHi) - 4);
    }

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
    getFrame,
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
      orientation: VesselState['orientation'],
      selWeldIndex: number,
      selLugIndex: number,
      selNozzleIndex: number
    ) => {
      if (layout.pxPerMm <= 0 || layout.panels.length === 0) return;
      const { pxPerMm, zoom } = view;

      for (const panel of layout.panels) {
        const appendage = state.appendages.find((a) => a.id === panel.id);
        if (!appendage) continue;
        const appendageOD = appendage.diameter;
        const appCirc = Math.PI * appendageOD;

        const stripView = {
          ...view,
          paddingLeft: PADDING.left,
          paddingTop: PADDING.top,
          topBasePx: panel.topBasePx,
        };
        // Orientation-aware strip point → canvas (physical axial axis, datum-cut
        // circumference). Horizontal: axial→X, circ→Y (+ stack offset). Vertical:
        // the strip transposes with the parent vessel — axial→Y, circ→X — so it
        // stays in ONE frame with the main surface (Decision Log 2026-06-23).
        const spx = (pos: number, circ: number) => stripPx(pos, circ, stripView, orientation);
        const spy = (pos: number, circ: number) => stripPy(pos, circ, stripView, orientation);

        // Panel canvas rect from the developed corners (LINEAR extents; the datum
        // cut is a seam edge, never routed through a wrapping transform).
        const cAx = spx(0, 0);
        const cAy = spy(0, 0);
        const cBx = spx(panel.lengthMm, panel.circumferenceMm);
        const cBy = spy(panel.lengthMm, panel.circumferenceMm);
        const left = Math.min(cAx, cBx);
        const right = Math.max(cAx, cBx);
        const top = Math.min(cAy, cBy);
        const bottom = Math.max(cAy, cBy);

        // Title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(panel.name, left, top - 4);

        // Border + datum (0°) reference line along the datum-cut seam edge.
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(spx(0, 0), spy(0, 0));
        ctx.lineTo(spx(panel.lengthMm, 0), spy(panel.lengthMm, 0));
        ctx.stroke();
        ctx.restore();

        // Heatmap + coverage rects, clipped to the panel rect.
        const projector = stripSurfaceProjector(view, panel.topBasePx, appendageOD, orientation);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();

        paintComposites(ctx, compositesForBody(state.scanComposites, panel.id), projector);

        // Body coverage rects. Appendage rect.angle is the appendage datum
        // convention (0 = datum meridian); datumToCircumMm maps it to the panel
        // circ axis, matching the scan datum mapping used above. Wrapped across the
        // panel seam like circumferential markers.
        for (const rect of state.coverageRects) {
          if (rect.bodyId !== panel.id) continue;
          const centerMm = datumToCircumMm(rect.angle, appendageOD);
          const halfHmm = rect.height / 2;
          for (const cyMm of wrapCircumCenters(centerMm, halfHmm, appCirc)) {
            const r0x = spx(rect.pos - rect.width / 2, cyMm - halfHmm);
            const r0y = spy(rect.pos - rect.width / 2, cyMm - halfHmm);
            const r1x = spx(rect.pos + rect.width / 2, cyMm + halfHmm);
            const r1y = spy(rect.pos + rect.width / 2, cyMm + halfHmm);
            const rx = Math.min(r0x, r1x);
            const ry = Math.min(r0y, r1y);
            const rw = Math.abs(r1x - r0x);
            const rh = Math.abs(r1y - r0y);
            if (rect.filled) {
              ctx.save();
              ctx.globalAlpha = rect.fillOpacity ?? 0.2;
              ctx.fillStyle = rect.color;
              ctx.fillRect(rx, ry, rw, rh);
              ctx.restore();
            }
            ctx.strokeStyle = rect.color;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(rx, ry, rw, rh);
          }
        }

        // Appendage welds — same visual language as the main-surface welds, placed
        // on THIS strip: a circumferential weld spans the full circumference at its
        // axial pos; a longitudinal weld runs along the axial axis at its datum
        // angle, seam-wrapped inside the strip circumference. Clipped to the panel;
        // body-scoped so a main-shell weld never lands here.
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
            ctx.beginPath();
            ctx.moveTo(spx(cw.x1, 0), spy(cw.x1, 0));
            ctx.lineTo(spx(cw.x1, appCirc), spy(cw.x1, appCirc));
            ctx.stroke();
            // Label at the datum-seam end of the line.
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.fillStyle = isSelected ? '#16a34a' : '#333';
            ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(cw.label, spx(cw.x1, 0), spy(cw.x1, 0) + 2);
          } else {
            const lw = projectStripLongWeld(weld, appendageOD);
            const capHalf = (weld.capWidth ?? 8) / 2;
            for (const cyMm of wrapCircumCenters(lw.y1, capHalf, appCirc)) {
              ctx.beginPath();
              ctx.moveTo(spx(lw.x1, cyMm), spy(lw.x1, cyMm));
              ctx.lineTo(spx(lw.x2, cyMm), spy(lw.x2, cyMm));
              ctx.stroke();
            }
            // Label at the segment end.
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.fillStyle = isSelected ? '#16a34a' : '#333';
            ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(lw.label, spx(lw.x2, lw.y1) + 6, spy(lw.x2, lw.y1));
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
          const size = 6;
          // Wrap the fixed-pixel marker using its on-screen half-height in mm, so a
          // lug straddling the datum seam is drawn on both strip edges.
          const lugRadiusMm = pxPerMm * zoom > 0 ? size / (pxPerMm * zoom) : 0;
          const centers = wrapCircumCenters(marker.cy, lugRadiusMm, appCirc);

          if (li === selLugIndex) {
            ctx.save();
            for (const cyMm of centers) {
              const cx = spx(marker.cx, cyMm);
              const cy = spy(marker.cx, cyMm);
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
            const cx = spx(marker.cx, cyMm);
            const cy = spy(marker.cx, cyMm);
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
        // surface, at (axial pos, datum angle) on the strip. Per-axis pixel radii —
        // equal under the shared 1:1 pxPerMm — seam-wrapped by the bore radius so a
        // nozzle on the datum cut shows on both strip edges. A selected nozzle gets
        // the shared concentric ellipse glow (clipped to the panel).
        for (let ni = 0; ni < state.nozzles.length; ni++) {
          const nozzle = state.nozzles[ni];
          if (nozzle.bodyId !== panel.id) continue;
          const circle = projectStripNozzle(nozzle, appendageOD);
          const rPx = circle.radius * pxPerMm * zoom || 4;
          const centers = wrapCircumCenters(circle.cy, circle.radius, appCirc);

          if (ni === selNozzleIndex) {
            ctx.save();
            for (const cyMm of centers) {
              const cx = spx(circle.cx, cyMm);
              const cy = spy(circle.cx, cyMm);
              for (const layer of GLOW_LAYERS) {
                ctx.globalAlpha = layer.alpha;
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = layer.width;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rPx, rPx, 0, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
          }

          for (const cyMm of centers) {
            const cx = spx(circle.cx, cyMm);
            const cy = spy(circle.cx, cyMm);
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rPx, rPx, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Cross-hair
            ctx.beginPath();
            ctx.moveTo(cx - rPx, cy);
            ctx.lineTo(cx + rPx, cy);
            ctx.moveTo(cx, cy - rPx);
            ctx.lineTo(cx, cy + rPx);
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(circle.label, cx, cy - rPx - 3);
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
    (ctx: CanvasRenderingContext2D, state: VesselState, frame: DevelopedFrame) => {
      const od = state.id; // geometry-projection functions accept vesselOD

      const {
        pxPerMm: gPx,
        marginX: gMx,
        marginY: gMy,
        circumference: gCirc,
        reversed: gRev,
        orientation,
      } = getPlotMetrics();
      const { zoom: gZoom, offsetX: gOx, offsetY: gOy } = viewRef.current;
      const vertical = orientation === 'vertical';
      const gK = gPx * gZoom;
      // LINEAR circ-mm → screen coordinate along the circ axis (Y horizontal /
      // X vertical). Used for the vessel-frame overlays whose handedness flip is
      // already baked into their developed polyline (footprints); NOT the frame's
      // flipping circScreen (Decision Log 2026-06-23).
      const circLinearScalar = (mm: number) =>
        (vertical ? PADDING.left + gMx + gOx : PADDING.top + gMy + gOy) + mm * gK;
      const fpPointX = (axialMm: number, circMm: number) =>
        vertical ? circLinearScalar(circMm) : frame.axialScreen(axialMm);
      const fpPointY = (axialMm: number, circMm: number) =>
        vertical ? frame.axialScreen(axialMm) : circLinearScalar(circMm);

      // 12 o'clock reference line (vessel TDC = 90° → circ = 0). Horizontal → a
      // horizontal line along the top; vertical → a vertical line down the left
      // seam edge.
      const tdcMm = angleToCircumMm(90, od);
      const t0x = frame.px(0, tdcMm);
      const t0y = frame.py(0, tdcMm);
      const t1x = frame.px(state.length, tdcMm);
      const t1y = frame.py(state.length, tdcMm);
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(t0x, t0y);
      ctx.lineTo(t1x, t1y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22c55e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText("12 o'clock (TDC)", Math.min(t0x, t1x) + 4, Math.min(t0y, t1y) - 3);
      ctx.restore();

      // Appendage junction footprints — the exact cylinder-on-cylinder opening
      // each appendage cuts in the main shell, developed onto this surface. The
      // boundary angles are the vessel clock convention (90 = TDC), so they map
      // through angleToCircumMm exactly like nozzle markers (NEVER datumToCircumMm;
      // that helper is only for scan datums — Decision Log 2026-06-22). Drawn as a
      // base layer so nozzles/labels stay legible on top; each footprint is drawn
      // at every seam-wrapped centre (same treatment class as wrapCircumCenters).
      for (const appendage of state.appendages) {
        const fp = buildJunctionFootprint(od / 2, appendage);
        if (fp.boundary.length === 0) continue;
        const developed = developFootprintBoundary(fp.boundary, appendage.mountAngle, od);
        const disp = displayFootprintPolyline(developed, gCirc, gRev);

        ctx.save();
        for (const copyCenter of wrapCircumCenters(disp.centerMm, disp.halfExtentMm, gCirc)) {
          const shift = copyCenter - disp.centerMm;
          ctx.beginPath();
          disp.points.forEach((p, i) => {
            const px = fpPointX(p.x, p.yMm + shift);
            const py = fpPointY(p.x, p.yMm + shift);
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
        ctx.fillText(
          appendage.name,
          fpPointX(appendage.mountPos, disp.centerMm),
          fpPointY(appendage.mountPos, disp.centerMm)
        );
      }

      // Welds are rendered outside the clip region (see main draw fn)

      // Saddles
      for (const saddle of state.saddles) {
        const rect = projectSaddle(saddle, od);
        const c0x = frame.px(rect.x, rect.y);
        const c0y = frame.py(rect.x, rect.y);
        const c1x = frame.px(rect.x + rect.width, rect.y + rect.height);
        const c1y = frame.py(rect.x + rect.width, rect.y + rect.height);
        const rx = Math.min(c0x, c1x);
        const ry = Math.min(c0y, c1y);
        const rw = Math.abs(c1x - c0x);
        const rh = Math.abs(c1y - c0y);

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
          frame.px(rect.x + rect.width / 2, rect.y + rect.height),
          frame.py(rect.x + rect.width / 2, rect.y + rect.height) + 2
        );
      }

      // Nozzles — drawn as ellipses with a separate pixel radius per axis (axial
      // vs circumferential). Under the shared 1:1 scale the two are equal (round
      // bore); the per-axis form keeps the marker faithful and swaps cleanly for a
      // vertical (transposed) view. Each nozzle is drawn at every seam-wrapped
      // centre so a feature straddling the TDC cut is not clipped in half.
      const circumference = getCircumference(state);
      for (const nozzle of state.nozzles) {
        // Appendage nozzles render on their own strip (renderStripPanels), never on
        // the main surface. Skipping them here keeps the main plot byte-identical for
        // any model whose nozzles are all main-shell (bodyId undefined).
        if (nozzle.bodyId !== undefined) continue;
        const circle = projectNozzle(nozzle, od);
        const rAx = frame.axialDeltaPx(circle.radius) || 4;
        const rCi = frame.circDeltaPx(circle.radius) || rAx;
        const exRx = vertical ? rCi : rAx;
        const exRy = vertical ? rAx : rCi;

        for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
          const cx = frame.px(circle.cx, cyMm);
          const cy = frame.py(circle.cx, cyMm);

          ctx.strokeStyle = '#e74c3c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, exRx, exRy, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Cross-hair
          ctx.beginPath();
          ctx.moveTo(cx - exRx, cy);
          ctx.lineTo(cx + exRx, cy);
          ctx.moveTo(cx, cy - exRy);
          ctx.lineTo(cx, cy + exRy);
          ctx.stroke();

          ctx.fillStyle = '#333';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(circle.label, cx, cy - exRy - 3);
        }
      }

      // Lifting lugs — main-shell only; appendage lugs render on their strip.
      for (const lug of state.liftingLugs) {
        if (lug.bodyId !== undefined) continue;
        const marker = projectLiftingLug(lug, od);
        const cx = frame.px(marker.cx, marker.cy);
        const cy = frame.py(marker.cx, marker.cy);
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
    [getPlotMetrics]
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
      const frame = getFrame();
      const orientation = vesselState.orientation;
      const mainAxial = frame.axialMmAt(mx, my);
      const mainCircum = frame.circMmAt(mx, my);
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
          const posMm = stripPosAt(mx, my, stripView, orientation);
          const circMm = stripCircAt(mx, my, stripView, orientation);
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
    [render, getFrame, getPlotMetrics, vesselState]
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
