// =============================================================================
// Geometry Projection — Coordinate Mapping Utilities
// =============================================================================
// Pure functions that convert 3D vessel features to 2D flattened coordinates.
//
// Coordinate system:
//   X = axial position in mm (0 = left tangent line, max = vessel length)
//   Y = circumferential position in mm (0 = TDC / top dead center, max = π × ID)
//
// Angle convention in VesselState:
//   90° = top (TDC), 0° = right (3 o'clock), increases counter-clockwise.
// =============================================================================

import type {
  NozzleConfig,
  SaddleConfig,
  WeldConfig,
  LiftingLugConfig,
  VesselState,
} from '../types';

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface FlatRect {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlatCircle {
  label: string;
  cx: number;
  cy: number;
  radius: number;
}

export interface FlatLine {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FlatMarker {
  label: string;
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the inner circumference of the vessel (π × ID).
 */
export function getCircumference(vesselState: VesselState): number {
  return Math.PI * vesselState.id;
}

/**
 * Convert a vessel angle (90° = TDC, CCW-positive) to circumferential mm
 * measured from TDC (y = 0).
 *
 * Mapping:  circumMm = ((90 - angleDeg) / 360) × circumference
 * The result is wrapped into [0, circumference).
 */
export function angleToCircumMm(angleDeg: number, outerDiameter: number): number {
  const circumference = Math.PI * outerDiameter;
  const raw = ((90 - angleDeg) / 360) * circumference;
  return ((raw % circumference) + circumference) % circumference;
}

// ---------------------------------------------------------------------------
// Projection functions
// ---------------------------------------------------------------------------

/**
 * Project a nozzle onto the flattened view as a circle.
 * Centre is at (axial pos, circumferential mm from TDC).
 * Radius equals half the nozzle bore (size / 2).
 */
export function projectNozzle(nozzle: NozzleConfig, vesselOD: number): FlatCircle {
  return {
    label: nozzle.name,
    cx: nozzle.pos,
    cy: angleToCircumMm(nozzle.angle - 90, vesselOD),
    radius: nozzle.size / 2,
  };
}

/**
 * Project a circumferential weld as a vertical line spanning the full
 * circumference at x = pos.
 */
export function projectCircWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const circumference = Math.PI * vesselOD;
  return {
    label: weld.name,
    x1: weld.pos,
    y1: 0,
    x2: weld.pos,
    y2: circumference,
  };
}

/**
 * Project a longitudinal weld as a horizontal line at the weld's
 * circumferential angle, running from pos to endPos.
 */
export function projectLongWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const y = angleToCircumMm((weld.angle ?? 0) - 90, vesselOD);
  return {
    label: weld.name,
    x1: weld.pos,
    y1: y,
    x2: weld.endPos ?? weld.pos,
    y2: y,
  };
}

/**
 * Project a saddle as a rectangle centred at the bottom of the vessel
 * (270°) spanning approximately 120° of arc.
 *
 * Axial width uses a 100 mm placeholder (saddles don't carry width data).
 */
export function projectSaddle(saddle: SaddleConfig, vesselOD: number): FlatRect {
  const circumference = Math.PI * vesselOD;
  // 120° arc → 1/3 of circumference
  const arcHeight = circumference / 3;
  const axialWidth = 100; // placeholder mm

  // Centre at 270° vessel angle (bottom dead centre), shifted -90° for flattened view
  const centreMm = angleToCircumMm(270 - 90, vesselOD);

  return {
    label: `Saddle @ ${saddle.pos} mm`,
    x: saddle.pos - axialWidth / 2,
    y: centreMm - arcHeight / 2,
    width: axialWidth,
    height: arcHeight,
  };
}

/**
 * Project a lifting lug as a point marker at (pos, angle→mm).
 */
export function projectLiftingLug(lug: LiftingLugConfig, vesselOD: number): FlatMarker {
  return {
    label: lug.name,
    cx: lug.pos,
    cy: angleToCircumMm(lug.angle - 90, vesselOD),
  };
}
