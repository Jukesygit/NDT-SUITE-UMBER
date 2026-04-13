/**
 * Legend renderer for the Flattened Vessel View.
 *
 * Draws PACMAP-style legend elements onto an HTML5 Canvas 2D context:
 * color bar with range labels, vessel metadata header, and dimension scales.
 */

import {
  interpolateColor,
  getColorscale,
  type ColorStop,
} from '../../../utils/colorscales';
import type { VesselState } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegendConfig {
  colorScaleName: string;
  reverseScale: boolean;
  rangeMin: number;
  rangeMax: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pick a "nice" round tick interval for approximately `targetTicks` ticks
 * across the given `range`.
 *
 * Algorithm: compute a rough interval, find the order of magnitude, then snap
 * to the nearest value in [1, 2, 5, 10] scaled by that magnitude.
 */
function niceInterval(range: number, targetTicks = 10): number {
  if (range <= 0 || targetTicks <= 0) return 1;

  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;

  let multiplier: number;
  if (residual <= 1.5) {
    multiplier = 1;
  } else if (residual <= 3.5) {
    multiplier = 2;
  } else if (residual <= 7.5) {
    multiplier = 5;
  } else {
    multiplier = 10;
  }

  return multiplier * magnitude;
}

// ---------------------------------------------------------------------------
// Drawing functions
// ---------------------------------------------------------------------------

/**
 * Draw a vertical color bar with min/max labels.
 *
 * Top of the bar corresponds to `rangeMax`, bottom to `rangeMin`.
 * Labels showing `{value}mm` are positioned to the right of the bar.
 */
export function drawColorBar(
  ctx: CanvasRenderingContext2D,
  config: LegendConfig,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale: ColorStop[] = getColorscale(config.colorScaleName);

  // Draw gradient strips row by row (top = max, bottom = min)
  for (let row = 0; row < height; row++) {
    const t = 1 - row / height; // 1 at top, 0 at bottom
    const [r, g, b] = interpolateColor(t, scale, config.reverseScale);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y + row, width, 1);
  }

  // Border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Labels to the right of the bar
  const labelX = x + width + 8;
  ctx.fillStyle = '#333';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Blue (thick) at top, red (thin) at bottom — always max at top, min at bottom
  ctx.fillText(`${config.rangeMax.toFixed(1)}mm`, labelX, y + 6);
  ctx.fillText(`${config.rangeMin.toFixed(1)}mm`, labelX, y + height - 6);
}

/**
 * Draw vessel metadata as a text block.
 *
 * Lines: bold vessel name, then location, date, and dimensions (ID x Length).
 */
export function drawMetadataHeader(
  ctx: CanvasRenderingContext2D,
  vesselState: VesselState,
  x: number,
  y: number,
): void {
  const lineHeight = 18;
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'top';

  // Vessel name (bold)
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(vesselState.vesselName || 'Unnamed Vessel', x, y);

  // Location
  ctx.font = '12px sans-serif';
  ctx.fillText(vesselState.location || '--', x, y + lineHeight);

  // Inspection date
  ctx.fillText(vesselState.inspectionDate || '--', x, y + lineHeight * 2);

  // Dimensions: ID x Length
  const idMm = vesselState.id;
  const lengthMm = vesselState.length;
  ctx.fillText(
    `ID ${idMm}mm \u00D7 Length ${lengthMm}mm`,
    x,
    y + lineHeight * 3,
  );
}

/**
 * Draw an axial (horizontal) scale along the bottom of the vessel.
 *
 * Tick marks are 6px long, labels rendered below in 10px font.
 */
export function drawAxialScale(
  ctx: CanvasRenderingContext2D,
  vesselLength: number,
  toCanvasX: (mm: number) => number,
  y: number,
): void {
  const interval = niceInterval(vesselLength);

  ctx.strokeStyle = '#333';
  ctx.fillStyle = '#333';
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let mm = 0; mm <= vesselLength; mm += interval) {
    const cx = toCanvasX(mm);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + 6);
    ctx.stroke();

    // Label
    ctx.fillText(`${Math.round(mm)}`, cx, y + 8);
  }
}

/**
 * Draw a circumferential (vertical) scale along the left side of the vessel.
 *
 * Labels are right-aligned to the left of the tick marks.
 */
export function drawCircumScale(
  ctx: CanvasRenderingContext2D,
  circumference: number,
  toCanvasY: (mm: number) => number,
  x: number,
): void {
  const interval = niceInterval(circumference);

  ctx.strokeStyle = '#333';
  ctx.fillStyle = '#333';
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let mm = 0; mm <= circumference; mm += interval) {
    const cy = toCanvasY(mm);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x - 6, cy);
    ctx.stroke();

    // Label (right-aligned to the left of tick)
    ctx.fillText(`${Math.round(mm)}`, x - 8, cy);
  }
}
