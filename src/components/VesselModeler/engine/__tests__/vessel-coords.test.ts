// =============================================================================
// vessel-coords — property tests for the circumferential convention primitives
// =============================================================================
// These guard the root-cause fix for the twice-regressed TDC ±90 scar
// (Decision Log 2026-06-22). The properties — datum↔vessel round-trip, wrap
// continuity at the 0/360 seam, cw/ccw symmetry, and the TDC fixed-points —
// pin the conventions so a future edit that re-breaks the +90 fails here.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  normAngle,
  datumToVesselAngle,
  vesselToDatumAngle,
  vesselAngleToCircumMm,
  scanArcDeg,
  scanAngleFromArcDeg,
  type ScanDirection,
} from '../vessel-coords';

/** Evenly-spaced sample angles plus a few awkward negatives / big magnitudes. */
const SAMPLE_ANGLES = [
  ...Array.from({ length: 24 }, (_, i) => i * 15), // 0..345 in 15° steps
  0.001,
  89.999,
  90,
  179.5,
  270,
  359.999,
  -1,
  -90,
  -180,
  -359,
  -720.5,
  450,
  1080.25,
];

const DIRECTIONS: ScanDirection[] = ['cw', 'ccw'];

/** Two values are equal modulo 360 (within fp tolerance). */
function congruent(a: number, b: number): void {
  const diff = normAngle(a - b);
  const wrapped = Math.min(diff, 360 - diff);
  expect(wrapped).toBeLessThan(1e-9);
}

describe('normAngle', () => {
  it('always lands in [0, 360)', () => {
    for (const a of SAMPLE_ANGLES) {
      const n = normAngle(a);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(360);
    }
  });

  it('is idempotent and preserves the residue class', () => {
    for (const a of SAMPLE_ANGLES) {
      expect(normAngle(normAngle(a))).toBeCloseTo(normAngle(a), 12);
      congruent(normAngle(a), a);
    }
  });

  it('is continuous across the 0/360 seam (359.999 ≈ 0.001 apart by ~0.002)', () => {
    const below = normAngle(-0.001); // ≈ 359.999
    const above = normAngle(0.001); // ≈ 0.001
    expect(below).toBeGreaterThan(359.99);
    expect(above).toBeLessThan(0.01);
    // The two are 0.002° apart going the short way round the seam.
    congruent(below, 359.999);
  });
});

describe('datum ↔ vessel round-trip', () => {
  it('datumToVesselAngle then vesselToDatumAngle is identity', () => {
    for (const a of SAMPLE_ANGLES) {
      expect(vesselToDatumAngle(datumToVesselAngle(a))).toBeCloseTo(a, 12);
      expect(datumToVesselAngle(vesselToDatumAngle(a))).toBeCloseTo(a, 12);
    }
  });

  it('applies exactly ±90 (the notorious offset, once)', () => {
    for (const a of SAMPLE_ANGLES) {
      expect(datumToVesselAngle(a)).toBe(a + 90);
      expect(vesselToDatumAngle(a)).toBe(a - 90);
    }
  });

  it('TDC fixed-point: datum 0° ↔ vessel 90°', () => {
    expect(datumToVesselAngle(0)).toBe(90);
    expect(vesselToDatumAngle(90)).toBe(0);
  });
});

describe('vesselAngleToCircumMm', () => {
  const circ = Math.PI * 800; // ID 800 → circumference

  it('always lands in [0, circumference)', () => {
    for (const a of SAMPLE_ANGLES) {
      const mm = vesselAngleToCircumMm(a, circ);
      expect(mm).toBeGreaterThanOrEqual(0);
      expect(mm).toBeLessThan(circ);
    }
  });

  it('TDC (vessel 90°) maps to y = 0; a datum-0 scan lands there too', () => {
    expect(vesselAngleToCircumMm(90, circ)).toBeCloseTo(0, 9);
    expect(vesselAngleToCircumMm(datumToVesselAngle(0), circ)).toBeCloseTo(0, 9);
  });

  it('quarter/half/three-quarter clock positions map to the right arc fractions', () => {
    // Vessel angle decreases clockwise from TDC: 0° (3 o'clock) = ¼, 270° = ½.
    expect(vesselAngleToCircumMm(0, circ)).toBeCloseTo(circ / 4, 6); // 3 o'clock
    expect(vesselAngleToCircumMm(270, circ)).toBeCloseTo(circ / 2, 6); // 6 o'clock (BDC)
    expect(vesselAngleToCircumMm(180, circ)).toBeCloseTo((3 * circ) / 4, 6); // 9 o'clock
  });

  it('is continuous across the TDC seam', () => {
    const justBelowTdc = vesselAngleToCircumMm(90.001, circ); // ≈ just past 0 wrapping to top
    const justAboveTdc = vesselAngleToCircumMm(89.999, circ); // ≈ tiny positive
    // 89.999 → tiny positive arc; 90.001 → wraps to ≈ circ − tiny.
    expect(justAboveTdc).toBeLessThan(circ * 0.001);
    expect(justBelowTdc).toBeGreaterThan(circ * 0.999);
  });
});

describe('scan handedness (scanArcDeg ↔ scanAngleFromArcDeg)', () => {
  it('round-trips for both directions (arc → angle → arc)', () => {
    for (const dir of DIRECTIONS) {
      for (const datum of SAMPLE_ANGLES) {
        for (const arc of [0, 15, 90, 150, 200, 359]) {
          const angle = scanAngleFromArcDeg(datum, arc, dir);
          expect(scanArcDeg(datum, angle, dir)).toBeCloseTo(normAngle(arc), 9);
        }
      }
    }
  });

  it('round-trips for both directions (angle → arc → angle, modulo 360)', () => {
    for (const dir of DIRECTIONS) {
      for (const datum of SAMPLE_ANGLES) {
        for (const angle of SAMPLE_ANGLES) {
          const arc = scanArcDeg(datum, angle, dir);
          congruent(scanAngleFromArcDeg(datum, arc, dir), angle);
        }
      }
    }
  });

  it('cw/ccw are mirror-symmetric about the datum', () => {
    for (const datum of SAMPLE_ANGLES) {
      for (const angle of SAMPLE_ANGLES) {
        // Walking cw a given arc and ccw the same arc land symmetric about datum.
        const cw = scanAngleFromArcDeg(datum, 40, 'cw');
        const ccw = scanAngleFromArcDeg(datum, 40, 'ccw');
        congruent(cw, datum - 40);
        congruent(ccw, datum + 40);
        // scanArcDeg cw(angle) === scanArcDeg ccw(mirror of angle about datum).
        const mirror = 2 * datum - angle;
        expect(scanArcDeg(datum, angle, 'cw')).toBeCloseTo(scanArcDeg(datum, mirror, 'ccw'), 9);
      }
    }
  });

  it('arc is 0 at the datum and increases along the scan direction', () => {
    for (const dir of DIRECTIONS) {
      const datum = 42;
      expect(scanArcDeg(datum, datum, dir)).toBeCloseTo(0, 9);
    }
  });

  it('datum-referenced arc matches the raw historical branch byte-for-byte', () => {
    // Guards the exact expressions the migrated sites used to inline.
    for (const datum of SAMPLE_ANGLES) {
      for (const angle of SAMPLE_ANGLES) {
        const cwLegacy = (((datum - angle) % 360) + 360) % 360;
        const ccwLegacy = (((angle - datum) % 360) + 360) % 360;
        expect(scanArcDeg(datum, angle, 'cw')).toBe(cwLegacy);
        expect(scanArcDeg(datum, angle, 'ccw')).toBe(ccwLegacy);
      }
      // Offset→angle raw branch (un-normalised), as the geometry builders used.
      expect(scanAngleFromArcDeg(datum, 33, 'cw')).toBe(datum - 33);
      expect(scanAngleFromArcDeg(datum, 33, 'ccw')).toBe(datum + 33);
    }
  });
});
