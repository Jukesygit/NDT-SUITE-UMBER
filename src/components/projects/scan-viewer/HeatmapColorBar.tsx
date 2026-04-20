/**
 * HeatmapColorBar — vertical gradient bar with thickness tick labels.
 *
 * Uses the shared Plotly-compatible colorscales from src/utils/colorscales.ts
 * so the bar exactly matches the heatmap canvas.
 */

import { useEffect, useRef } from 'react';
import { getColorscale, interpolateColor } from '../../../utils/colorscales';

interface HeatmapColorBarProps {
  min: number;
  max: number;
  colormap: string;
  height?: number;
}

export default function HeatmapColorBar({ min, max, colormap, height = 256 }: HeatmapColorBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 20;
    canvas.height = height;

    const scale = getColorscale(colormap);

    // Draw gradient (top = max, bottom = min)
    for (let y = 0; y < height; y++) {
      const t = 1 - y / (height - 1); // top=1, bottom=0
      const [r, g, b] = interpolateColor(t, scale);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, 20, 1);
    }
  }, [min, max, colormap, height]);

  const ticks = [max, (max + min) / 2, min];

  return (
    <div style={{ display: 'flex', gap: 4, height }}>
      <canvas ref={canvasRef} style={{ borderRadius: 2, border: '1px solid var(--border-subtle)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {ticks.map((v, i) => (
          <span key={i} style={{ fontSize: '0.65rem', color: 'var(--text-quaternary)', lineHeight: 1 }}>
            {v.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
