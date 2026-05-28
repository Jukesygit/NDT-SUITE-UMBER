import { useRef, useEffect, useCallback } from 'react';
import type { CrossSectionData } from './types';

interface CrossSectionPanelProps {
  data: CrossSectionData;
  nominalThickness: number;
  onClose: () => void;
}

const PAD = { top: 10, right: 10, bottom: 30, left: 40 };
const PANEL_HEIGHT = 200;

export default function CrossSectionPanel({
  data,
  nominalThickness,
  onClose,
}: CrossSectionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const validPoints = data.points.filter((p) => p.thickness != null);
  const sampleCount = validPoints.length;

  // ----- Canvas drawing -----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI setup
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;

    // Data ranges
    const thicknesses = validPoints.map((p) => p.thickness as number);
    if (thicknesses.length === 0) return;

    const minT = Math.min(...thicknesses, nominalThickness);
    const maxT = Math.max(...thicknesses, nominalThickness);
    const tPad = (maxT - minT) * 0.1 || 0.5;
    const yMin = minT - tPad;
    const yMax = maxT + tPad;
    const xMax = data.totalDistance;

    const toX = (d: number) => PAD.left + (d / xMax) * plotW;
    // Y-axis: thick at top, thin at bottom (inverted so valleys go down)
    const toY = (t: number) => PAD.top + (1 - (t - yMin) / (yMax - yMin)) * plotH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // ---- Gridlines (dashed, subtle) ----
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const t = yMin + ((yMax - yMin) * i) / yTicks;
      const py = toY(t);
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(w - PAD.right, py);
      ctx.stroke();
    }

    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const d = (xMax * i) / xTicks;
      const px = toX(d);
      ctx.beginPath();
      ctx.moveTo(px, PAD.top);
      ctx.lineTo(px, h - PAD.bottom);
      ctx.stroke();
    }
    ctx.restore();

    // ---- Nominal reference line (dashed, amber) ----
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#d4981e';
    ctx.lineWidth = 1;
    const nomY = toY(nominalThickness);
    ctx.beginPath();
    ctx.moveTo(PAD.left, nomY);
    ctx.lineTo(w - PAD.right, nomY);
    ctx.stroke();
    ctx.restore();

    // ---- Profile line + fill (breaks at null gaps) ----
    ctx.save();
    ctx.strokeStyle = '#2d8a4e'; // accent-primary
    ctx.lineWidth = 1.5;
    const fillBottom = toY(yMin);

    let segStart = true;
    const fillSegments: { x: number; y: number }[][] = [];
    let currentSeg: { x: number; y: number }[] = [];

    ctx.beginPath();
    for (const pt of data.points) {
      const px = toX(pt.distance);
      if (pt.thickness == null) {
        // Break: end current segment
        if (!segStart && currentSeg.length > 0) {
          fillSegments.push(currentSeg);
          currentSeg = [];
        }
        segStart = true;
        continue;
      }
      const py = toY(pt.thickness);
      if (segStart) {
        ctx.moveTo(px, py);
        segStart = false;
      } else {
        ctx.lineTo(px, py);
      }
      currentSeg.push({ x: px, y: py });
    }
    if (currentSeg.length > 0) fillSegments.push(currentSeg);
    ctx.stroke();

    // Fill below each segment
    ctx.fillStyle = 'rgba(45, 138, 78, 0.15)';
    for (const seg of fillSegments) {
      if (seg.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
      ctx.lineTo(seg[seg.length - 1].x, fillBottom);
      ctx.lineTo(seg[0].x, fillBottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // ---- Axis labels ----
    ctx.fillStyle = '#9a968f'; // text-dim
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yTicks; i++) {
      const t = yMin + ((yMax - yMin) * i) / yTicks;
      ctx.fillText(t.toFixed(1), PAD.left - 4, toY(t));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xTicks; i++) {
      const d = (xMax * i) / xTicks;
      ctx.fillText(d.toFixed(0), toX(d), h - PAD.bottom + 4);
    }

    // Axis titles
    ctx.fillStyle = '#7a7672'; // text-tertiary
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Distance (mm)', PAD.left + plotW / 2, h - 4);

    ctx.save();
    ctx.translate(10, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('mm', 0, 0);
    ctx.restore();
  }, [data, validPoints, nominalThickness]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // ----- Header info -----
  const mono: React.CSSProperties = { fontFamily: 'monospace', color: 'var(--text-primary)' };

  return (
    <div
      style={{
        height: PANEL_HEIGHT,
        background: 'var(--panel-mid, #1e1e1e)',
        borderTop: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '4px 12px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
        }}
      >
        <span>
          Start: <span style={mono}>{data.startScanMm.toFixed(1)}mm</span>,{' '}
          <span style={mono}>{data.startIndexMm.toFixed(1)}mm</span>
        </span>
        <span>
          End: <span style={mono}>{data.endScanMm.toFixed(1)}mm</span>,{' '}
          <span style={mono}>{data.endIndexMm.toFixed(1)}mm</span>
        </span>
        <span>
          Dist: <span style={mono}>{data.totalDistance.toFixed(1)}mm</span>
        </span>
        <span>
          Samples: <span style={mono}>{sampleCount} pts</span>
        </span>

        <button
          className="btn btn--sm btn--ghost"
          onClick={onClose}
          title="Close cross-section"
          style={{ marginLeft: 'auto' }}
        >
          X
        </button>
      </div>

      {/* ── Canvas ── */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', display: 'block' }}
      />
    </div>
  );
}
