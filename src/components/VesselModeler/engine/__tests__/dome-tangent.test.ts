import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { DomeScanConfig, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import {
  buildDomeTangentBasis,
  tangentOffsetsToSurface,
  surfaceToTangentOffsets,
} from '../dome-tangent';
import { createDomeScanPlane, clearDomeHeatmapCache } from '../dome-scan-geometry';
import { resolveBodyFrame } from '../body-frame';

// DEFAULT_VESSEL_STATE geometry: id 3000 (R 1500), headRatio 2 (D 750), L 8000.
const R = 1500;
const D = 750;
const L = 8000;

function makeVessel(over?: Partial<VesselState>): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2 * R,
    length: L,
    headRatio: 2,
    orientation: 'horizontal',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// (1) Forward/inverse round-trip — the projection is exactly invertible
// ---------------------------------------------------------------------------

describe('dome-tangent — offsets <-> surface round-trip', () => {
  const centers = [
    { phi: 20, theta: 0 },
    { phi: 45, theta: 90 },
    { phi: 60, theta: 200 },
    { phi: 80, theta: 315 },
  ];
  const heads: Array<'left' | 'right'> = ['left', 'right'];
  const offsets = [
    { scanMm: 0, indexMm: 0 },
    { scanMm: 120, indexMm: -60 },
    { scanMm: -200, indexMm: 150 },
    { scanMm: 40, indexMm: 220 },
  ];

  for (const head of heads) {
    for (const c of centers) {
      for (const o of offsets) {
        it(`round-trips head=${head} phi=${c.phi} theta=${c.theta} (${o.scanMm},${o.indexMm})`, () => {
          const basis = buildDomeTangentBasis(R, D, c.phi, c.theta);
          const surf = tangentOffsetsToSurface(basis, R, D, L, head, o.scanMm, o.indexMm);
          const back = surfaceToTangentOffsets(basis, R, D, L, head, surf.pos, surf.angle);
          // A large offset near the equator can project past the tangent line onto
          // the shell side — not a head point, so the inverse returns null there.
          const onHead = head === 'right' ? surf.pos > L + 1e-6 : surf.pos < -1e-6;
          if (!onHead) {
            expect(back).toBeNull();
            return;
          }
          expect(back).not.toBeNull();
          if (back) {
            expect(back.scanMm).toBeCloseTo(o.scanMm, 4);
            expect(back.indexMm).toBeCloseTo(o.indexMm, 4);
          }
        });
      }
    }
  }

  it('returns null on the shell side of the tangent line', () => {
    const basis = buildDomeTangentBasis(R, D, 45, 0);
    // Right head tangent line is at L; a point at pos < L is on the shell side.
    expect(surfaceToTangentOffsets(basis, R, D, L, 'right', L - 100, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (2) Forward mirrors createDomeScanPlane's actual corner vertices
// ---------------------------------------------------------------------------

function makeDomeConfig(over?: Partial<DomeScanConfig>): DomeScanConfig {
  const rows = 10;
  const cols = 10;
  return {
    id: 'ds',
    name: 'ds',
    head: 'right',
    centerPhi: 45,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 10)),
    xAxis: Array.from({ length: cols }, (_, i) => i * 20), // scan range 180
    yAxis: Array.from({ length: rows }, (_, i) => i * 20), // index range 180
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...over,
  };
}

describe('dome-tangent — forward matches createDomeScanPlane vertices', () => {
  for (const head of ['left', 'right'] as const) {
    for (const center of [
      { centerPhi: 30, centerTheta: 40 },
      { centerPhi: 55, centerTheta: 210 },
    ]) {
      it(`corner vertices agree head=${head} phi=${center.centerPhi} theta=${center.centerTheta}`, () => {
        clearDomeHeatmapCache();
        const vessel = makeVessel();
        const config = makeDomeConfig({ head, ...center });
        const mesh = createDomeScanPlane(config, vessel, '');
        expect(mesh).not.toBeNull();
        if (!mesh) return;

        const pos = mesh.geometry.getAttribute('position');
        const frame = resolveBodyFrame(vessel);

        const scanRange = Math.abs(config.xAxis[config.xAxis.length - 1] - config.xAxis[0]);
        const indexRange = Math.abs(config.yAxis[config.yAxis.length - 1] - config.yAxis[0]);
        const basis = buildDomeTangentBasis(R, D, config.centerPhi, config.centerTheta);

        // Vertex order: iy outer (v), ix inner (u). First = (u0,v0), last = (u1,v1).
        const readVertex = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

        // Corner (u=0, v=0): scanMm = -range/2, indexMm = -range/2.
        const first = frame.toLocal(readVertex(0));
        const fwdFirst = tangentOffsetsToSurface(
          basis,
          R,
          D,
          L,
          head,
          -scanRange / 2,
          -indexRange / 2
        );
        expect(fwdFirst.pos).toBeCloseTo(first.pos, 3);
        // angle compared modulo 360 via cos/sin to avoid wrap seams.
        expect(Math.cos((fwdFirst.angle - first.angle) * (Math.PI / 180))).toBeCloseTo(1, 4);

        // Corner (u=1, v=1): scanMm = +range/2, indexMm = +range/2.
        const last = frame.toLocal(readVertex(pos.count - 1));
        const fwdLast = tangentOffsetsToSurface(
          basis,
          R,
          D,
          L,
          head,
          scanRange / 2,
          indexRange / 2
        );
        expect(fwdLast.pos).toBeCloseTo(last.pos, 3);
        expect(Math.cos((fwdLast.angle - last.angle) * (Math.PI / 180))).toBeCloseTo(1, 4);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (3) Appendage end closure — the 'right'-head analog (apex outward)
// ---------------------------------------------------------------------------
// An appendage's dished closure is inverted by the SAME dome-tangent module,
// parameterised by the appendage's own R/D/L and head 'right' (apex outward,
// tangent line at the cylinder length). This proves the projection the appendage
// overlay draws with is exactly invertible for the sampler (Phase 4C).

describe('dome-tangent — appendage end closure round-trip', () => {
  // Dished appendage: diameter 800 -> R 400, headRatio 2 -> D 200, cylinder 1200.
  const AR = 400;
  const AD = 200;
  const AL = 1200;

  const cells = [
    { phi: 20, theta: 0, scanMm: 0, indexMm: 0 },
    { phi: 35, theta: 120, scanMm: 60, indexMm: -40 },
    { phi: 55, theta: 250, scanMm: -80, indexMm: 50 },
    { phi: 70, theta: 315, scanMm: 30, indexMm: 90 },
  ];

  for (const c of cells) {
    it(`round-trips a closure cell phi=${c.phi} theta=${c.theta} (${c.scanMm},${c.indexMm})`, () => {
      const basis = buildDomeTangentBasis(AR, AD, c.phi, c.theta);
      const surf = tangentOffsetsToSurface(basis, AR, AD, AL, 'right', c.scanMm, c.indexMm);
      const back = surfaceToTangentOffsets(basis, AR, AD, AL, 'right', surf.pos, surf.angle);
      // Large offsets near the equator can project past the tangent line onto the
      // cylinder — not a closure point, so the inverse is null there.
      const onClosure = surf.pos > AL + 1e-6;
      if (!onClosure) {
        expect(back).toBeNull();
        return;
      }
      expect(back).not.toBeNull();
      if (back) {
        expect(back.scanMm).toBeCloseTo(c.scanMm, 4);
        expect(back.indexMm).toBeCloseTo(c.indexMm, 4);
      }
    });
  }
});
