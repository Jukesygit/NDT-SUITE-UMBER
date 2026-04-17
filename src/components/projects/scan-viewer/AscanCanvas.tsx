/**
 * AscanCanvas — canvas-based A-scan waveform renderer with gate overlays.
 *
 * Renders a raw Float32Array waveform (amplitude 0–200%) as a polyline on a
 * 2D canvas, with semi-transparent gate rectangles and threshold lines drawn
 * underneath.  Designed for the standalone scan viewer; will receive live data
 * via WebSocket in a later phase.
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
  onGateChange?: (gateId: number, updates: Partial<GateOverlay>) => void;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AscanCanvas({
  waveform,
  timeMinUs,
  timeMaxUs,
  gates,
  onGateChange,
}: AscanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 400, h: 150 });
  const dragRef = useRef<DragState | null>(null);
  const [renderTick, setRenderTick] = useState(0);

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

  /* ---- Coordinate helpers (stable across renders via size/time props) ---- */
  const timeToX = (us: number) => ((us - timeMinUs) / (timeMaxUs - timeMinUs)) * size.w;
  const xToTime = (px: number) => timeMinUs + (px / size.w) * (timeMaxUs - timeMinUs);
  const ampToY = (pct: number) => size.h - (pct / 200) * size.h;
  const yToAmp = (py: number) => (1 - py / size.h) * 200;

  /* ---- Hit testing ---- */
  const hitTest = (mx: number, my: number): { gateId: number; property: DragProperty } | null => {
    if (timeMaxUs <= timeMinUs) return null;
    for (const gate of gates) {
      const x0 = timeToX(gate.startUs), x1 = timeToX(gate.endUs);
      const thY = ampToY(gate.thresholdPct);
      const nearThresholdY = Math.abs(my - thY) <= HIT_ZONE_PX * 2;
      // End-cap edges — only when near the threshold line vertically
      if (nearThresholdY && Math.abs(mx - x0) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'startUs' };
      if (nearThresholdY && Math.abs(mx - x1) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'endUs' };
      // Threshold line body — drag up/down to change threshold
      if (mx > x0 + HIT_ZONE_PX && mx < x1 - HIT_ZONE_PX && Math.abs(my - thY) <= HIT_ZONE_PX)
        return { gateId: gate.id, property: 'thresholdPct' };
      // Near the line horizontally — move whole gate left/right
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
    if (!onGateChange) return;
    const { mx, my } = getCanvasXY(e);
    if (dragRef.current) {
      const { gateId, property, localGates, moveOffsetUs } = dragRef.current;
      const g = localGates.find((g) => g.id === gateId);
      if (!g) return;
      if (property === 'thresholdPct') {
        g.thresholdPct = Math.max(0, Math.min(200, yToAmp(my)));
      } else if (property === 'move') {
        const t = xToTime(mx) - moveOffsetUs;
        const duration = g.endUs - g.startUs;
        const newStart = Math.max(timeMinUs, Math.min(timeMaxUs - duration, t));
        g.startUs = newStart;
        g.endUs = newStart + duration;
      } else {
        const t = Math.max(timeMinUs, Math.min(timeMaxUs, xToTime(mx)));
        g[property] = t;
        if (g.startUs > g.endUs) {
          [g.startUs, g.endUs] = [g.endUs, g.startUs];
          dragRef.current.property = property === 'startUs' ? 'endUs' : 'startUs';
        }
      }
      setRenderTick((t) => t + 1);
      return;
    }
    const hit = hitTest(mx, my);
    const cursor = !hit ? '' :
      hit.property === 'thresholdPct' ? 'ns-resize' :
      hit.property === 'move' ? 'grab' : 'ew-resize';
    e.currentTarget.style.cursor = cursor;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGateChange, gates, size, timeMinUs, timeMaxUs]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onGateChange) return;
    const { mx, my } = getCanvasXY(e);
    const hit = hitTest(mx, my);
    if (!hit) return;
    let moveOffsetUs = 0;
    if (hit.property === 'move') {
      const gate = gates.find(g => g.id === hit.gateId);
      if (gate) moveOffsetUs = xToTime(mx) - gate.startUs;
      e.currentTarget.style.cursor = 'grabbing';
    }
    dragRef.current = { ...hit, moveOffsetUs, localGates: gates.map(g => ({ ...g })) };
    e.preventDefault();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGateChange, gates, size, timeMinUs, timeMaxUs]);

  const endDrag = useCallback((cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!cancelled && onGateChange) {
      const g = drag.localGates.find((g) => g.id === drag.gateId);
      if (g) onGateChange(g.id, { startUs: g.startUs, endUs: g.endUs, thresholdPct: g.thresholdPct });
    }
    dragRef.current = null;
    setRenderTick((t) => t + 1);
  }, [onGateChange]);

  const handleMouseUp = useCallback(() => endDrag(false), [endDrag]);
  const handleMouseLeave = useCallback(() => endDrag(true), [endDrag]);

  /* ---- Main render ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeGates = dragRef.current?.localGates ?? gates;
    const { w, h } = size;
    canvas.width = w;
    canvas.height = h;

    // 1. Background
    ctx.fillStyle = 'rgb(20, 20, 30)';
    ctx.fillRect(0, 0, w, h);

    // 2. Grid — horizontal lines at 0%, 50%, 100%, 150%, 200%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridLevels = [0, 50, 100, 150, 200];
    for (const pct of gridLevels) {
      const y = Math.round(h - (pct / 200) * h) + 0.5; // +0.5 for crisp 1px line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 3. Gate overlays — drawn as horizontal threshold lines with vertical
    //    end-caps, matching OmniPC's  I---------I  style.
    const timeSpan = timeMaxUs - timeMinUs;
    if (timeSpan > 0) {
      for (const gate of activeGates) {
        const color = gateColor(gate.id);
        const x0 = Math.round(((gate.startUs - timeMinUs) / timeSpan) * w) + 0.5;
        const x1 = Math.round(((gate.endUs - timeMinUs) / timeSpan) * w) + 0.5;
        const threshY = Math.round(h - (gate.thresholdPct / 200) * h) + 0.5;
        const capH = 6; // half-height of end-cap "I" bars

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;

        // Horizontal threshold line
        ctx.beginPath();
        ctx.moveTo(x0, threshY);
        ctx.lineTo(x1, threshY);
        ctx.stroke();

        // Left end-cap  I
        ctx.beginPath();
        ctx.moveTo(x0, threshY - capH);
        ctx.lineTo(x0, threshY + capH);
        ctx.stroke();

        // Right end-cap  I
        ctx.beginPath();
        ctx.moveTo(x1, threshY - capH);
        ctx.lineTo(x1, threshY + capH);
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Gate label — above the line
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = color;
        ctx.font = '10px sans-serif';
        ctx.fillText(gate.name, x0 + 3, threshY - capH - 3);
        ctx.globalAlpha = 1;
      }
    }

    // 4. Waveform
    if (!waveform || waveform.length === 0) {
      // "No A-scan data" placeholder
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '0.75rem sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No A-scan data', w / 2, h / 2);
      return;
    }

    const samples = waveform.length;
    ctx.strokeStyle = '#50a0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // For large waveforms, draw at most one point per pixel
    const step = samples > w ? samples / w : 1;

    let first = true;
    for (let i = 0; i < samples; i += step) {
      const idx = Math.min(Math.round(i), samples - 1);
      const x = (idx / (samples - 1)) * w;
      const y = h - (waveform[idx] / 200) * h;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    // Ensure last sample is included
    const lastY = h - (waveform[samples - 1] / 200) * h;
    ctx.lineTo(w, lastY);

    ctx.stroke();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveform, gates, size, timeMinUs, timeMaxUs, renderTick]);

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
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
