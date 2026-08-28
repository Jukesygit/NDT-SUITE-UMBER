import type { AppState, RayFanResult, TracedRay } from '../types';
import { materialById, wedgeById } from './materials';

const DEG = Math.PI / 180;

/** Velocity in the part for the selected wave mode, m/s. */
export function partVelocity(state: AppState): number {
  const mat = materialById(state.part.materialId);
  return state.probe.waveMode === 'shear' ? mat.vShear : mat.vLong;
}

/**
 * Incident angle in the wedge for a desired refracted angle in the part
 * (Snell's law). Returns NaN for a contact probe (no wedge).
 */
export function incidentAngle(refracted: number, wedgeVel: number, partVel: number): number {
  if (wedgeVel <= 0) return NaN;
  const s = (wedgeVel / partVel) * Math.sin(refracted * DEG);
  if (s >= 1) return NaN;
  return Math.asin(s) / DEG;
}

/** Refracted angle in the part for an incident angle in the wedge (signed). */
function refractedAngle(incident: number, wedgeVel: number, partVel: number): number {
  const s = (partVel / wedgeVel) * Math.sin(incident * DEG);
  if (s >= 1) return 88;
  if (s <= -1) return -88;
  return Math.asin(s) / DEG;
}

/** Beam-spread constants (circular-piston approximation) per dB drop. */
const K_DROP: Record<number, number> = { 6: 0.514, 12: 0.7, 20: 0.87 };

export function spreadK(db: number): number {
  return K_DROP[db] ?? 0.514;
}

/**
 * Beam-spread half angle (deg) for wavelength in the given medium.
 * sin(gamma) = k * lambda / D;  lambda[mm] = v[m/s] / (f[MHz] * 1000).
 */
export function spreadHalfAngle(
  velocity: number,
  frequencyMHz: number,
  apertureMm: number,
  k = 0.514
): number {
  const lambdaMm = velocity / (frequencyMHz * 1000);
  const s = (k * lambdaMm) / apertureMm;
  if (s >= 1) return 90;
  return Math.asin(s) / DEG;
}

/** Phased-array active aperture, mm (standard n·p approximation). */
export function activeAperture(elements: number, pitch: number): number {
  return Math.max(elements, 1) * Math.max(pitch, 0.05);
}

/**
 * Trace a single ray from the index point through `legs` half-skips.
 * Part coordinates: x from weld centreline (+right), y depth from scan
 * surface (+down). Negative angles lean away from the weld.
 */
export function traceRay(
  angle: number,
  startX: number,
  direction: 1 | -1,
  thickness: number,
  legs: number
): TracedRay {
  const t = Math.tan(angle * DEG);
  const points = [{ x: startX, y: 0 }];
  let x = startX;
  let down = true;
  for (let i = 0; i < legs; i++) {
    x += direction * thickness * t;
    points.push({ x, y: down ? thickness : 0 });
    down = !down;
  }
  return { angle, points };
}

/**
 * Mode-purity / feasibility caveats a technician should know about:
 * contact probes cannot produce angled beams, shear below the first
 * critical angle rides with a strong refracted L-wave, and refracted
 * L-mode through a wedge always coexists with a refracted S-wave.
 */
function beamWarningFor(state: AppState, wedgeVel: number, vPart: number): string | null {
  const { probe, beam, part } = state;
  const mat = materialById(part.materialId);
  const checkAngle =
    beam.mode === 'conventional' ? beam.angle : Math.min(beam.sweepStart, beam.sweepEnd);
  if (wedgeVel <= 0) {
    if (checkAngle > 0.5 || probe.waveMode === 'shear') {
      return 'Contact probe cannot produce an angled/shear beam';
    }
    return null;
  }
  const thetaI = incidentAngle(checkAngle, wedgeVel, vPart);
  if (Number.isNaN(thetaI)) return 'Beyond critical angle — no refracted beam';
  if (probe.waveMode === 'shear') {
    const firstCritical = Math.asin(Math.min(wedgeVel / mat.vLong, 1)) / DEG;
    if (thetaI < firstCritical - 1e-6) {
      const lAngle = refractedAngle(thetaI, wedgeVel, mat.vLong);
      return `Below 1st critical — companion ${lAngle.toFixed(0)}° L-wave`;
    }
  } else if (checkAngle > 0.5) {
    const sAngle = refractedAngle(thetaI, wedgeVel, mat.vShear);
    return `L-mode — companion ${sAngle.toFixed(0)}° S-wave`;
  }
  return null;
}

/** Trace every ray implied by the current app state. */
export function traceFan(state: AppState): RayFanResult {
  const { part, probe, beam } = state;
  const vPart = partVelocity(state);
  const wedge = wedgeById(probe.wedgeId);
  const dir: 1 | -1 = probe.side === 'A' ? 1 : -1;
  const startX = dir * -probe.standoff;

  const center: TracedRay[] = [];
  let spreadLower: TracedRay | undefined;
  let spreadUpper: TracedRay | undefined;
  let effectiveHalf: number;
  const k = spreadK(beam.spreadDb);

  /**
   * Spread edge refracted angles [lo, hi] for a nominal refracted angle.
   * Divergence originates in the wedge and is refracted through Snell (the
   * fan is wider and asymmetric); the part-side symmetric formula is only
   * used for contact probes. `naturalIncident` models the aperture shrinking
   * by projection when a phased array steers away from the wedge's natural
   * beam (wedge assumed cut for the middle of the sweep).
   */
  const edgesFor = (refr: number, aperture: number, naturalIncident?: number): [number, number] => {
    const thetaI = incidentAngle(refr, wedge.velocity, vPart);
    if (wedge.velocity > 0 && !Number.isNaN(thetaI)) {
      const proj = naturalIncident === undefined ? 1 : Math.cos((thetaI - naturalIncident) * DEG);
      const halfWedge = spreadHalfAngle(
        wedge.velocity,
        probe.frequency,
        aperture * Math.max(proj, 0.2),
        k
      );
      return [
        Math.max(refractedAngle(thetaI - halfWedge, wedge.velocity, vPart), -88),
        Math.min(refractedAngle(thetaI + halfWedge, wedge.velocity, vPart), 88),
      ];
    }
    const half = spreadHalfAngle(vPart, probe.frequency, aperture, k);
    return [Math.max(refr - half, -88), Math.min(refr + half, 88)];
  };

  if (beam.mode === 'conventional') {
    center.push(traceRay(beam.angle, startX, dir, part.thickness, beam.legs));
    const [lo, hi] = edgesFor(beam.angle, probe.elementSize);
    effectiveHalf = (hi - lo) / 2;
    if (beam.showSpread) {
      spreadLower = traceRay(lo, startX, dir, part.thickness, beam.legs);
      spreadUpper = traceRay(hi, startX, dir, part.thickness, beam.legs);
    }
  } else {
    const start = Math.min(beam.sweepStart, beam.sweepEnd);
    const end = Math.max(beam.sweepStart, beam.sweepEnd);
    const step = Math.max(beam.sweepStep, 0.5);
    for (let a = start; a <= end + 1e-9; a += step) {
      center.push(traceRay(a, startX, dir, part.thickness, beam.legs));
    }
    const aperture = activeAperture(probe.elements, probe.pitch);
    const natI = incidentAngle((start + end) / 2, wedge.velocity, vPart);
    const nat = Number.isNaN(natI) ? undefined : natI;
    const [midLo, midHi] = edgesFor((start + end) / 2, aperture, nat);
    effectiveHalf = (midHi - midLo) / 2;
    if (beam.showSpread && center.length > 0) {
      spreadLower = traceRay(
        edgesFor(start, aperture, nat)[0],
        startX,
        dir,
        part.thickness,
        beam.legs
      );
      spreadUpper = traceRay(
        edgesFor(end, aperture, nat)[1],
        startX,
        dir,
        part.thickness,
        beam.legs
      );
    }
  }

  return {
    center,
    spreadLower,
    spreadUpper,
    incidentAngle: incidentAngle(beam.angle, wedge.velocity, vPart),
    spreadHalfAngle: effectiveHalf,
    beamWarning: beamWarningFor(state, wedge.velocity, vPart),
  };
}

/** Handy derived measurements for the readout strip. */
export function derived(state: AppState) {
  const t = state.part.thickness;
  const a = state.beam.angle * DEG;
  return {
    halfSkip: t * Math.tan(a),
    fullSkip: 2 * t * Math.tan(a),
    legPath: t / Math.cos(a),
    vPart: partVelocity(state),
  };
}
