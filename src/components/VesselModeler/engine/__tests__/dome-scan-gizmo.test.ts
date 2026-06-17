import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { DomeScanConfig, VesselState } from '../../types';
import { buildDomeScanGizmo } from '../dome-scan-gizmo';

function makeDomeScanConfig(overrides: Partial<DomeScanConfig> = {}): DomeScanConfig {
  const rows = 10;
  const cols = 10;
  return {
    id: 'ds_test',
    name: 'Test Dome Scan',
    head: 'right',
    centerPhi: 45,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: false,
    data: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => 10 + Math.random() * 5),
    ),
    xAxis: Array.from({ length: cols }, (_, i) => i * 10),
    yAxis: Array.from({ length: rows }, (_, i) => i * 10),
    stats: { min: 10, max: 15, mean: 12.5, median: 12.5, stdDev: 1 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 3000,
    length: 8000,
    headRatio: 2.0,
    orientation: 'horizontal' as const,
    vesselShape: 'vessel',
    vesselName: 'Test Vessel',
    location: '',
    inspectionDate: '',
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    welds: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    domeScanComposites: [],
    pipelines: [],
    referenceDrawings: [],
    measurementConfig: { referenceTangent: 'left', circumDirection: 'CW', viewFromEnd: 'right' },
    coordinateOrigin: { indexMm: 0, scanMm: 0 },
    hasModel: true,
    visuals: {} as any,
    ...overrides,
  } as VesselState;
}

describe('buildDomeScanGizmo', () => {
  it('returns group with originMesh', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const result = buildDomeScanGizmo(config, vessel);

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.originMesh).toBeInstanceOf(THREE.Mesh);
    expect(result.group.children).toContain(result.originMesh);
  });

  it('originMesh has userData type domeGizmo with compositeId', () => {
    const config = makeDomeScanConfig({ id: 'ds_abc' });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    expect(originMesh.userData.type).toBe('domeGizmo');
    expect(originMesh.userData.compositeId).toBe('ds_abc');
  });

  it('group contains circumferential and longitudinal arrow children', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const { group, originMesh } = buildDomeScanGizmo(config, vessel);

    const arrowChildren = group.children.filter(c => c !== originMesh);
    expect(arrowChildren.length).toBeGreaterThanOrEqual(2);

    const types = arrowChildren.map(c => c.userData?.type).filter(Boolean);
    expect(types).toContain('domeGizmoArrowCirc');
    expect(types).toContain('domeGizmoArrowLong');
  });

  it('originMesh position is on the dome surface (not at world origin)', () => {
    const config = makeDomeScanConfig({ centerPhi: 45, centerTheta: 90 });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(dist).toBeGreaterThan(0.01);
  });

  it('works for left head', () => {
    const config = makeDomeScanConfig({ head: 'left', centerPhi: 30 });
    const vessel = makeVesselState();
    const result = buildDomeScanGizmo(config, vessel);

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.originMesh.userData.compositeId).toBe('ds_test');
  });

  it('works for near-apex (phi=2) without NaN', () => {
    const config = makeDomeScanConfig({ centerPhi: 2 });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    expect(Number.isNaN(pos.x)).toBe(false);
    expect(Number.isNaN(pos.y)).toBe(false);
    expect(Number.isNaN(pos.z)).toBe(false);
  });

  it('works for vertical vessel', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    expect(Number.isNaN(pos.x)).toBe(false);
    expect(Number.isNaN(pos.y)).toBe(false);
    expect(Number.isNaN(pos.z)).toBe(false);
  });
});
