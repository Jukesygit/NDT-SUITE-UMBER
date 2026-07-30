import { describe, expect, it } from 'vitest';
import { DEFAULT_VESSEL_STATE, type AppendageConfig, type VesselState } from '../../types';
import { buildAllFootprints, buildJunctionFootprint } from '../junction-footprint';

const RAD2DEG = 180 / Math.PI;
const R = 1500; // shell outer radius (mm) used across the analytic tests

/**
 * Independent ground-truth excluded area via 2D midpoint GRID quadrature over
 * (u, phi) with the true shell area element dA = R·du·dphi. The footprint region
 * is four-fold symmetric (even in u and in phi), so one quadrant is summed and
 * multiplied by 4. This is deliberately a different method from the module's
 * Simpson-on-substitution integral, so it independently validates areaMm2.
 */
function groundTruthAreaMm2(shellR: number, r: number, Nu = 2000, Nphi = 6000): number {
  const Phi = Math.asin(r / shellR); // max circumferential half-width (rad)
  const du = r / Nu;
  const dphi = Phi / Nphi;
  let area = 0;
  for (let i = 0; i < Nu; i++) {
    const u = (i + 0.5) * du;
    const phiMax = Math.asin(Math.sqrt(Math.max(0, r * r - u * u)) / shellR);
    for (let j = 0; j < Nphi; j++) {
      const phi = (j + 0.5) * dphi;
      if (phi <= phiMax) area += shellR * du * dphi;
      else break; // phi increases monotonically → remaining cells are outside
    }
  }
  return area * 4;
}

function footprintFor(diameter: number, mountPos = 3000, mountAngle = 90, id = 'app-1') {
  return buildJunctionFootprint(R, { id, mountPos, mountAngle, diameter });
}

describe('buildJunctionFootprint — excluded area', () => {
  for (const ratio of [0.1, 0.3, 0.5]) {
    it(`matches 2D grid ground truth within 0.1% for r/R=${ratio}`, () => {
      const r = ratio * R;
      const fp = footprintFor(2 * r);
      const truth = groundTruthAreaMm2(R, r);
      const relError = Math.abs(fp.areaMm2 - truth) / truth;
      expect(relError).toBeLessThan(0.001);
    });
  }

  it('approaches the flat-disc area π·r² as r/R → 0.05 (within 1%)', () => {
    const r = 0.05 * R; // 75 mm
    const fp = footprintFor(2 * r);
    const ratio = fp.areaMm2 / (Math.PI * r * r);
    expect(Math.abs(ratio - 1)).toBeLessThan(0.01);
  });
});

describe('buildJunctionFootprint — containsCell vs boundary', () => {
  const r = 0.3 * R; // 450 mm (no clamp)
  const mountPos = 3000;
  const mountAngle = 90;
  const fp = buildJunctionFootprint(R, { id: 'app-1', mountPos, mountAngle, diameter: 2 * r });

  // theta samples include the axial extremes (π/2, 3π/2) and the circumferential
  // extremes (0, π), plus general positions in every quadrant.
  const thetas = [
    0,
    Math.PI / 6,
    Math.PI / 4,
    Math.PI / 3,
    Math.PI / 2,
    (2 * Math.PI) / 3,
    Math.PI,
    (4 * Math.PI) / 3,
    (3 * Math.PI) / 2,
    (5 * Math.PI) / 3,
  ];

  for (const theta of thetas) {
    it(`is inside just within and outside just beyond the boundary at θ=${theta.toFixed(3)}`, () => {
      const uB = r * Math.sin(theta);
      const phiBDeg = Math.asin((r * Math.cos(theta)) / R) * RAD2DEG;
      // Scale the (u, phi) offset from the mount centre: factor < 1 lands strictly
      // inside the star-shaped region, factor > 1 strictly outside — valid at the
      // axial extremes (phiB → 0) and circumferential extremes (uB → 0) alike.
      const inside = fp.containsCell(mountPos + 0.98 * uB, mountAngle + 0.98 * phiBDeg);
      const outside = fp.containsCell(mountPos + 1.02 * uB, mountAngle + 1.02 * phiBDeg);
      expect(inside).toBe(true);
      expect(outside).toBe(false);
    });
  }

  it('includes the exact mount centre and excludes points beyond the axial extent', () => {
    expect(fp.containsCell(mountPos, mountAngle)).toBe(true);
    expect(fp.containsCell(mountPos + r + 0.5, mountAngle)).toBe(false);
    expect(fp.containsCell(mountPos - r - 0.5, mountAngle)).toBe(false);
  });
});

describe('buildJunctionFootprint — angular wrap across 0°', () => {
  const r = 0.2 * R; // 300 mm → half-width asin(0.2) ≈ 11.537°
  const mountPos = 2000;
  const mountAngle = 5;
  const fp = buildJunctionFootprint(R, { id: 'app-wrap', mountPos, mountAngle, diameter: 2 * r });
  const halfWidth = Math.asin(r / R) * RAD2DEG;

  it('has a half-width wider than the seam gap so it straddles 0°', () => {
    expect(halfWidth).toBeGreaterThan(mountAngle);
  });

  it('contains cells on the 355°/358° side of the seam', () => {
    expect(fp.containsCell(mountPos, 358)).toBe(true); // −2°, dist 7
    expect(fp.containsCell(mountPos, 355)).toBe(true); // −10°→dist 10
  });

  it('contains cells on the positive side of the seam', () => {
    expect(fp.containsCell(mountPos, 2)).toBe(true); // dist 3
    expect(fp.containsCell(mountPos, 16)).toBe(true); // dist 11 < 11.537
  });

  it('excludes cells beyond the half-width on both sides of the seam', () => {
    expect(fp.containsCell(mountPos, 350)).toBe(false); // dist 15
    expect(fp.containsCell(mountPos, 17)).toBe(false); // dist 12
    expect(fp.containsCell(mountPos, 185)).toBe(false); // far side of the shell
  });
});

describe('buildAllFootprints', () => {
  const appA: AppendageConfig = {
    id: 'app-1',
    name: 'Sump',
    mountPos: 500,
    mountAngle: 90,
    diameter: 600,
    length: 1000,
    endClosure: 'dished',
  };
  const appB: AppendageConfig = {
    id: 'app-2',
    name: 'Boot',
    mountPos: 5000,
    mountAngle: 270,
    diameter: 800,
    length: 1200,
    endClosure: 'flat',
  };
  const state: VesselState = { ...DEFAULT_VESSEL_STATE, id: 2 * R, appendages: [appA, appB] };

  it('returns one footprint per appendage with matching ids', () => {
    const fps = buildAllFootprints(state);
    expect(fps).toHaveLength(2);
    expect(fps.map((f) => f.appendageId)).toEqual(['app-1', 'app-2']);
  });

  it('footprints are independent — each responds only to its own mount region', () => {
    const [fpA, fpB] = buildAllFootprints(state);
    expect(fpA.containsCell(500, 90)).toBe(true);
    expect(fpA.containsCell(5000, 270)).toBe(false);
    expect(fpB.containsCell(5000, 270)).toBe(true);
    expect(fpB.containsCell(500, 90)).toBe(false);
  });
});

describe('buildJunctionFootprint — r near R (penetration clamp)', () => {
  const mountPos = 4000;
  const mountAngle = 180;
  // diameter = shell id → raw r = R; the clamp brings the effective r to 0.999·R.
  const fp = buildJunctionFootprint(R, {
    id: 'app-big',
    mountPos,
    mountAngle,
    diameter: 2 * R,
  });

  it('produces a finite, positive area (no NaN)', () => {
    expect(Number.isFinite(fp.areaMm2)).toBe(true);
    expect(fp.areaMm2).toBeGreaterThan(0);
  });

  it('emits a boundary polyline free of NaN', () => {
    expect(fp.boundary.length).toBeGreaterThanOrEqual(128);
    for (const p of fp.boundary) {
      expect(Number.isFinite(p.pos)).toBe(true);
      expect(Number.isFinite(p.angle)).toBe(true);
    }
  });

  it('keeps total angular width ≤ 360° (does not wrap the shell)', () => {
    const maxOffset = Math.max(
      ...fp.boundary.map((p) => {
        const d = Math.abs((((p.angle - mountAngle) % 360) + 360) % 360);
        return Math.min(d, 360 - d);
      })
    );
    expect(maxOffset).toBeLessThanOrEqual(180); // ⇒ total width = 2·maxOffset ≤ 360°
    expect(fp.containsCell(mountPos, mountAngle + 180)).toBe(false); // antipode excluded
  });
});
