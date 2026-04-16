/**
 * HeatmapColorBar — vertical gradient bar with thickness tick labels.
 */

import { useEffect, useRef } from 'react';

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

    // Draw gradient (top = max, bottom = min)
    for (let y = 0; y < height; y++) {
      const t = 1 - y / (height - 1); // top=1, bottom=0
      const [r, g, b] = colormapValue(t, colormap);
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

function colormapValue(t: number, name: string): [number, number, number] {
  let r: number, g: number, b: number;
  switch (name) {
    case 'jet':
      r = Math.max(0, Math.min(1, 1.5 - Math.abs(4.0 * t - 3.0)));
      g = Math.max(0, Math.min(1, 1.5 - Math.abs(4.0 * t - 2.0)));
      b = Math.max(0, Math.min(1, 1.5 - Math.abs(4.0 * t - 1.0)));
      break;
    case 'viridis':
    default:
      r = Math.max(0, Math.min(1, 0.267 + 0.004 * t + 1.26 * t * t - 1.53 * t ** 3));
      g = Math.max(0, Math.min(1, 0.004 + 1.01 * t - 0.66 * t * t + 0.31 * t ** 3));
      b = Math.max(0, Math.min(1, 0.33 + 0.21 * t + 1.97 * t * t - 2.51 * t ** 3));
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
