/**
 * AscanCanvas — canvas-based A-scan waveform renderer with gate overlays.
 *
 * Renders a raw Float32Array waveform (amplitude 0–200%) as a polyline on a
 * 2D canvas, with semi-transparent gate rectangles and threshold lines drawn
 * underneath.  Supports scroll-to-zoom and probe delay (wedge delay) to
 * reference the mm scale from the interface echo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GateOverlay {
  id: number;
  name: string;
  startUs: number;
  endUs: number;
  thresholdPct: number;
}

interface AscanCanvasProps {
  waveform: Float32Array | null; // amplitude % (0-200)
  timeMinUs: number;
  timeMaxUs: number;
  gates: GateOverlay[];
  /** Sound velocity in m/s — used to draw mm scale on x-axis. */
  velocity?: number;
  /** Interface echo crossing time in µs — sets the 0mm reference (probe delay). */
  delayUs?: number;
  onGateChange?: (gateId: number, updates: Partial<GateOverlay>) => void;
  /** Fires when the user finishes dragging a gate (mouseup). Use for Tier 2 refinement. */
  onGateRelease?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Gate palette                                                       */
/* ------------------------------------------------------------------ */

const GATE_COLORS = ['#ff4444', '#44aa44', '#4444ff', '#ff8800', '#8800ff'];
const HIT_ZONE_PX = 5;

function gateColor(index: number): string {
  return GATE_COLORS[index % GATE_COLORS.length];
}

type DragProperty = 'startUs' | 'endUs' | 'thresholdPct' | 'move';

interface DragState {
  gateId: number;
  property: DragProperty;
  /** Offset from mouse to gate start when dragging the whole gate */
  moveOffsetUs: number;
  localGates: GateOverlay[];
}

interface PanState {
  startX: number;
  startViewMin: number;
  startViewMax: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/** Bottom margin reserved for the mm axis labels. */
const AXIS_HEIGHT = 18;
const ZOOM_FACTOR = 1.15;
const MIN_VIEW_SPAN_US = 0.5; // minimum zoom-in span

export default function AscanCanvas({
  waveform,
  timeMinUs,
  timeMaxUs,
  gates,
  velocity,
  delayUs,
  onGateChange,
  onGateRelease,
}: AscanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 400, h: 150 });
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  // Zoom state: view range can differ from data range.
  // null = auto (compute from data + gates). User zoom sets explicit values.
  const [viewMinUs, setViewMinUs] = useState<number | null>(null);
  const [viewMaxUs, setViewMaxUs] = useState<number | null>(null);
  const userZoomedRef = useRef(false);

  // Compute the auto view range (includes waveform + all gates)
  const autoRange = (() => {
    if (timeMaxUs <= timeMinUs) return { min: timeMinUs, max: timeMaxUs };
    let fullMin = timeMinUs;
    let fullMax = timeMaxUs;
    for (const g of gates) {
      if (g.startUs < fullMin) fullMin = g.startUs;
      if (g.endUs > fullMax) fullMax = g.endUs;
    }
    const span = fullMax - fullMin;
    const pad = span * 0.02;
    return { min: fullMin - pad, max: fullMax + pad };
  })();

  // Effective view range: user zoom overrides auto range
  const vMin = viewMinUs ?? autoRange.min;
  const vMax = viewMaxUs ?? autoRange.max;
  const viewSpan = vMax - vMin;

  /* ---- Measure parent ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- Coordinate helpers using VIEW range ---- */
  const plotH = velocity ? size.h - AXIS_HEIGHT : size.h;
  const timeToX = (us: number) => ((us - vMin) / viewSpan) * size.w;
  const xToTime = (px: number) => vMin + (px / size.w) * viewSpan;
  const ampToY = (pct: number) => plotH - (pct / 200) * plotH;
  const yToAmp = (py: number) => (1 - py / plotH) * 200;

  /* ---- Scroll-to-zoom ---- */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pivot = vMin + (mx / size.w) * viewSpan;

    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;

    const newMin = pivot - (pivot - vMin) * factor;
    const newMax = pivot + (vMax - pivot) * factor;

    // Enforce minimum span
    if (newMax - newMin < MIN_VIEW_SPAN_US) return;

    userZoomedRef.current = true;
    setViewMinUs(newMin);
    setViewMaxUs(newMax);
  }, [vMin, vMax, viewSpan, size.w]);

  /* ---- Double-click to reset zoom ---- */
  const handleDoubleClick = useCallback(() => {
    userZoomedRef.current = false;
    setViewMinUs(null);
    setViewMaxUs(null);
  }, []);

  /* ---- Hit testing ---- */
  const hitTest = (mx: number, my: number): { gateId: number; property: DragProperty } | null => {
    if (viewSpan <= 0) return null;
    for (const gate of gates) {
      const x0 = timeToX(gate.startUs), x1 = timeToX(gate.endUs);
      const thY = ampToY(gate.thresholdPct);
      const nearThresholdY = Math.abs(my - thY) <= HIT_ZONE_PX * 2;
      if (nearThresholdY && Math.abs(mx - x0) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'startUs' };
      if (nearThresholdY && Math.abs(mx - x1) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'endUs' };
      if (mx > x0 + HIT_ZONE_PX && mx < x1 - HIT_ZONE_PX && Math.abs(my - thY) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'thresholdPct' };
      if (mx >= x0 && mx <= x1 && nearThresholdY)
        return { gateId: gate.id, property: 'move' };
    }
    return null;
  };

  /* ---- Mouse handlers ---- */
  const getCanvasXY = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getCanvasXY(e);

    // Panning — drag to scroll the view
    if (panRef.current) {
      const dx = mx - panRef.current.startX;
      const dtUs = -(dx / size.w) * (panRef.current.startViewMax - panRef.current.startViewMin);
      setViewMinUs(panRef.current.startViewMin + dtUs);
      setViewMaxUs(panRef.current.startViewMax + dtUs);
      return;
    }

    // Gate dragging
    if (dragRef.current) {
      const { gateId, property, localGates, moveOffsetUs } = dragRef.current;
      const g = localGates.find((g) => g.id === gateId);
      if (!g) return;
      if (property === 'thresholdPct') {
        g.thresholdPct = Math.max(0, Math.min(200, yToAmp(my)));
      } else if (property === 'move') {
        const t = xToTime(mx) - moveOffsetUs;
        const duration = g.endUs - g.startUs;
        g.startUs = t;
        g.endUs = t + duration;
      } else {
        const t = xToTime(mx);
        g[property] = t;
        if (g.startUs > g.endUs) {
          [g.startUs, g.endUs] = [g.endUs, g.startUs];
          dragRef.current.property = property === 'startUs' ? 'endUs' : 'startUs';
        }
      }
      setRenderTick((t) => t + 1);
      return;
    }

    // Hover cursor — check gate hit zones
    if (onGateChange) {
      const hit = hitTest(mx, my);
      const cursor = !hit ? 'grab' :
        hit.property === 'thresholdPct' ? 'ns-resize' :
        hit.property === 'move' ? 'grab' : 'ew-resize';
      e.currentTarget.style.cursor = cursor;
    } else {
      e.currentTarget.style.cursor = 'grab';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGateChange, gates, size, vMin, vMax]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getCanvasXY(e);

    // Check for gate hit first
    if (onGateChange) {
      const hit = hitTest(mx, my);
      if (hit) {
        let moveOffsetUs = 0;
        if (hit.property === 'move') {
          const gate = gates.find(g => g.id === hit.gateId);
          if (gate) moveOffsetUs = xToTime(mx) - gate.startUs;
          e.currentTarget.style.cursor = 'grabbing';
        }
        dragRef.current = { ...hit, moveOffsetUs, localGates: gates.map(g => ({ ...g })) };
        e.preventDefault();
        return;
      }
    }

    // No gate hit — start panning
    userZoomedRef.current = true;
    panRef.current = { startX: mx, startViewMin: vMin, startViewMax: vMax };
    e.currentTarget.style.cursor = 'grabbing';
    e.preventDefault();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGateChange, gates, size, vMin, vMax]);

  const commitDrag = useCallback(() => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (onGateChange) {
      const g = drag.localGates.find((g) => g.id === drag.gateId);
      if (g) onGateChange(g.id, { startUs: g.startUs, endUs: g.endUs, thresholdPct: g.thresholdPct });
    }
    if (onGateRelease) {
      onGateRelease();
    }
    dragRef.current = null;
    setRenderTick((t) => t + 1);
  }, [onGateChange, onGateRelease]);

  useEffect(() => {
    const handleWindowMouseUp = () => { commitDrag(); };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [commitDrag]);

  /* ---- Main render ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeGates = dragRef.current?.localGates ?? gates;
    const { w, h } = size;
    const pH = velocity ? h - AXIS_HEIGHT : h;
    canvas.width = w;
    canvas.height = h;

    // 1. Background
    ctx.fillStyle = 'rgb(20, 20, 30)';
    ctx.fillRect(0, 0, w, h);

    // Shade the region outside the waveform data range
    if (vMin < timeMinUs) {
      const noDataX = Math.round(((timeMinUs - vMin) / viewSpan) * w);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(0, 0, noDataX, pH);
    }
    if (vMax > timeMaxUs) {
      const noDataX = Math.round(((timeMaxUs - vMin) / viewSpan) * w);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(noDataX, 0, w - noDataX, pH);
    }

    // 2. Grid — horizontal lines at 0%, 50%, 100%, 150%, 200%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridLevels = [0, 50, 100, 150, 200];
    for (const pct of gridLevels) {
      const y = Math.round(pH - (pct / 200) * pH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 3. Gate overlays — drawn as horizontal threshold lines with vertical
    //    end-caps, matching OmniPC's  I---------I  style.
    //    Gates that extend beyond the view are clamped and drawn with arrows.
    if (viewSpan > 0) {
      for (const gate of activeGates) {
        const color = gateColor(gate.id);
        const rawX0 = ((gate.startUs - vMin) / viewSpan) * w;
        const rawX1 = ((gate.endUs - vMin) / viewSpan) * w;

        // Skip gates entirely outside the view
        if (rawX1 < -20 || rawX0 > w + 20) continue;

        const x0 = Math.round(Math.max(-0.5, rawX0)) + 0.5;
        const x1 = Math.round(Math.min(w + 0.5, rawX1)) + 0.5;
        const threshY = Math.round(pH - (gate.thresholdPct / 200) * pH) + 0.5;
        const capH = 6;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;

        // Horizontal threshold line
        ctx.beginPath();
        ctx.moveTo(x0, threshY);
        ctx.lineTo(x1, threshY);
        ctx.stroke();

        // Left end-cap (only if visible)
        if (rawX0 >= 0) {
          ctx.beginPath();
          ctx.moveTo(x0, threshY - capH);
          ctx.lineTo(x0, threshY + capH);
          ctx.stroke();
        }

        // Right end-cap (only if visible)
        if (rawX1 <= w) {
          ctx.beginPath();
          ctx.moveTo(x1, threshY - capH);
          ctx.lineTo(x1, threshY + capH);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Gate label — positioned at the visible start of the gate
        const labelX = Math.max(3, x0 + 3);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = color;
        ctx.font = '10px sans-serif';
        ctx.fillText(gate.name, labelX, threshY - capH - 3);
        ctx.globalAlpha = 1;
      }
    }

    // 4. Waveform
    if (!waveform || waveform.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '0.75rem sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No A-scan data', w / 2, pH / 2);
      return;
    }

    const samples = waveform.length;
    const dataSpan = timeMaxUs - timeMinUs;

    ctx.strokeStyle = '#50a0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    let first = true;
    // Map each sample to its time, then to view X
    for (let i = 0; i < samples; i++) {
      const sampleTimeUs = timeMinUs + (i / (samples - 1)) * dataSpan;
      const x = ((sampleTimeUs - vMin) / viewSpan) * w;

      // Skip samples far outside the view for performance
      if (x < -2 || x > w + 2) {
        first = true;
        continue;
      }

      const y = pH - (waveform[i] / 200) * pH;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // 5. X-axis with mm scale (probe delay applied: 0mm = interface echo)
    if (velocity && viewSpan > 0) {
      const refUs = delayUs ?? timeMinUs; // probe delay or data start (fixed reference)
      const depthAtViewMin = (vMin - refUs) * velocity / 2 / 1000;
      const depthAtViewMax = (vMax - refUs) * velocity / 2 / 1000;
      const depthRange = depthAtViewMax - depthAtViewMin;

      // Separator line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, pH + 0.5);
      ctx.lineTo(w, pH + 0.5);
      ctx.stroke();

      // Pick nice tick interval
      const targetTickCount = Math.max(3, Math.floor(w / 60));
      const rawStep = Math.abs(depthRange) / targetTickCount;
      if (rawStep > 0) {
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const residual = rawStep / mag;
        const niceStep = residual <= 1.5 ? 1 * mag
          : residual <= 3.5 ? 2 * mag
          : residual <= 7.5 ? 5 * mag
          : 10 * mag;

        const firstTick = Math.ceil(depthAtViewMin / niceStep) * niceStep;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let mm = firstTick; mm <= depthAtViewMax; mm += niceStep) {
          const x = ((mm - depthAtViewMin) / depthRange) * w;
          if (x < 0 || x > w) continue;

          ctx.beginPath();
          ctx.moveTo(x + 0.5, pH + 1);
          ctx.lineTo(x + 0.5, pH + 5);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, pH);
          ctx.stroke();

          const label = niceStep >= 1 ? mm.toFixed(0) : mm.toFixed(1);
          ctx.fillText(label, x, pH + 5);
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'right';
        ctx.fillText('mm', w - 2, pH + 5);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveform, gates, size, timeMinUs, timeMaxUs, velocity, delayUs, vMin, vMax, renderTick]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: 6,
          fontSize: '0.6rem',
          color: 'rgba(255, 255, 255, 0.5)',
          pointerEvents: 'none',
        }}
      >
        A-scan
      </span>
    </div>
  );
}
