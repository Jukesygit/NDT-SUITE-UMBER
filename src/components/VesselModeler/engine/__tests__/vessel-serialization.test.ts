// =============================================================================
// vessel-serialization — round-trip + legacy load tests
// =============================================================================
// Guards the field-spec consolidation (design §4 C4 / §11): every attachable
// array must survive save -> load on BOTH the local-JSON and cloud-config paths,
// and the documented per-path differences (weld capWidth, scan useGlobalOrigin,
// annotation labelMode, dome sectionType) must behave exactly as before. Also
// pins the confirmed bug fix: the local path now serializes domeScanComposites.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { DEFAULT_VESSEL_STATE, type VesselState } from '../../types';
import {
  serializeVesselState,
  deserializeVesselState,
  type SerPath,
} from '../vessel-serialization';

// ---------------------------------------------------------------------------
// Fixture — a VesselState with every attachable array populated with
// non-default values. Fields whose value is intentionally lost on save are
// pre-set to their post-load form so the array is a clean round-trip fixed
// point on both paths:
//   - scan/dome `data` is stripped on save (stored out-of-band, re-fetched by
//     cloudId) and defaults to [] on load, so the fixture carries data: [].
// The three genuinely path-asymmetric fields (weld capWidth, scan
// useGlobalOrigin, annotation labelMode) are exercised in a separate block.
// ---------------------------------------------------------------------------

function makeFixture(): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 3200,
    length: 9000,
    headRatio: 2.0,
    orientation: 'horizontal',
    vesselName: 'V-TEST',
    location: 'Test Terminal',
    inspectionDate: '2026-07-21',
    coordinateOrigin: { indexMm: 120, scanMm: 45 },
    originSourceScanId: 'sc1',
    nozzles: [
      {
        name: 'N1',
        pos: 1000,
        proj: 250,
        angle: 45,
        size: 150,
        orientationMode: 'radial',
        azimuthRotation: 0,
        flangeOD: 400,
        flangeThk: 30,
        pipeOD: 168,
        style: 'flanged',
        hideRepad: false,
        showRepad: true,
        showWeldNeck: true,
        repadOD: 350,
        repadThickness: 14,
      },
    ],
    liftingLugs: [
      {
        name: 'LUG1',
        pos: 2000,
        angle: 270,
        style: 'trunnion',
        swl: '10t',
        width: 150,
        height: 180,
        thickness: 25,
        holeDiameter: 42,
      },
    ],
    saddles: [
      {
        pos: 1500,
        color: '#2244ff',
        height: 1100,
        depth: 600,
        wearPlate: true,
        wearPlateThickness: 12,
        wearPlateArcOverhang: 6,
        wearPlateAxialOverhang: 50,
      },
    ],
    welds: [
      { name: 'W1', type: 'longitudinal', pos: 500, endPos: 3000, angle: 90, color: '#777777' },
    ],
    textures: [
      {
        id: 1,
        name: 'Tex1',
        imageData: 'data:image/png;base64,AAAA',
        pos: 100,
        angle: 45,
        scaleX: 1.5,
        scaleY: 2.0,
        rotation: 15,
        flipH: true,
        flipV: false,
        aspectRatio: 1.33,
      },
    ],
    annotations: [
      {
        id: 1,
        name: 'A1',
        type: 'restriction',
        pos: 1000,
        angle: 180,
        width: 200,
        height: 150,
        color: '#ff3333',
        lineWidth: 3,
        showLabel: true,
        leaderLength: 2000,
        labelOffset: [1, 2, 3],
        visible: true,
        locked: false,
        restrictionNotes: 'note',
        restrictionImage: 'img',
        restrictionImageName: 'r.png',
        includeInReport: true,
        attachments: [],
      },
    ],
    rulers: [
      {
        id: 1,
        name: 'R1',
        startPos: 0,
        startAngle: 90,
        endPos: 1000,
        endAngle: 45,
        color: '#ffaa00',
        showLabel: true,
      },
    ],
    coverageRects: [
      {
        id: 1,
        name: 'C1',
        pos: 500,
        angle: 90,
        width: 400,
        height: 300,
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.3,
        locked: false,
      },
    ],
    inspectionImages: [
      {
        id: 1,
        name: 'IMG1',
        imageData: 'data:image/png;base64,BBBB',
        pos: 1000,
        angle: 0,
        description: 'desc',
        date: '2026-01-01',
        inspector: 'insp',
        method: 'UT',
        result: 'Pass',
        leaderLength: 2000,
        labelOffset: [1, 2, 3],
        visible: true,
        locked: false,
      },
    ],
    scanComposites: [
      {
        id: 'sc1',
        name: 'Scan 1',
        cloudId: 'cloud-sc-1',
        data: [],
        xAxis: [0, 10, 20],
        yAxis: [0, 5],
        stats: { min: 5, max: 10, mean: 7, median: 7, stdDev: 1 },
        indexStartMm: 100,
        datumAngleDeg: 45,
        scanDirection: 'ccw',
        indexDirection: 'reverse',
        orientationConfirmed: true,
        colorScale: 'Viridis',
        rangeMin: 2,
        rangeMax: 12,
        opacity: 0.8,
        sourceNdeFile: 'x.nde',
        sourceFiles: [{ filename: 'f', minX: 0, maxX: 10, minY: 0, maxY: 5 }],
      },
    ],
    domeScanComposites: [
      {
        id: 'dome-l',
        name: 'Dome Left',
        cloudId: 'cloud-dome-l',
        head: 'left',
        centerPhi: 30,
        centerTheta: 60,
        scanDirection: 'cw',
        indexDirection: 'outward',
        orientationConfirmed: true,
        data: [],
        xAxis: [0, 10],
        yAxis: [0, 5],
        stats: { min: 5, max: 10, mean: 7, median: 7, stdDev: 1 },
        colorScale: 'Jet',
        rangeMin: 2,
        rangeMax: 12,
        opacity: 0.9,
        sourceFiles: [{ filename: 'd', minX: 0, maxX: 10, minY: 0, maxY: 5 }],
      },
      {
        id: 'dome-r',
        name: 'Dome Right',
        cloudId: 'cloud-dome-r',
        head: 'right',
        centerPhi: 20,
        centerTheta: 15,
        scanDirection: 'ccw',
        indexDirection: 'inward',
        orientationConfirmed: false,
        data: [],
        xAxis: [0, 8],
        yAxis: [0, 4],
        stats: { min: 6, max: 9, mean: 7.5, median: 7.5, stdDev: 0.5 },
        colorScale: 'Jet',
        rangeMin: null,
        rangeMax: null,
        opacity: 1,
      },
    ],
    appendages: [
      {
        id: 'app-1',
        name: 'Sump',
        mountPos: 4500,
        mountAngle: 270,
        diameter: 1000,
        length: 1500,
        endClosure: 'dished',
        headRatio: 2.0,
        flangeJoint: { show: true, od: 1200, thickness: 40 },
        nominalThickness: 12,
        visible: true,
        locked: false,
      },
      {
        id: 'app-2',
        name: 'Boot',
        mountPos: 2000,
        mountAngle: 90,
        diameter: 600,
        length: 900,
        endClosure: 'flat',
        headRatio: 2.0,
        visible: true,
        locked: false,
      },
    ],
    pipelines: [
      {
        id: 'pipe-1',
        nozzleIndex: 0,
        pipeDiameter: 168,
        color: '#abcdef',
        segments: [
          { id: 'seg-1', type: 'straight', rotation: 0, length: 500 },
          { id: 'seg-2', type: 'elbow', rotation: 90, angle: 90, bendRadius: 250 },
        ],
        locked: false,
        visible: true,
      },
      {
        id: 'pipe-free',
        nozzleIndex: -1,
        pipeDiameter: 114,
        segments: [{ id: 'seg-f', type: 'straight', rotation: 0, length: 300 }],
        freeOrigin: { position: [1, 2, 3], direction: [1, 0, 0] },
      },
    ],
    referenceDrawings: [
      { id: 1, title: 'GA Drawing', imageData: 'data:image/png;base64,CCCC', fileName: 'ga.png' },
    ],
  };
}

/** Serialize -> JSON boundary (mirrors the real save/load IO) -> deserialize. */
function roundTrip(state: VesselState, path: SerPath): VesselState {
  const serialized = serializeVesselState(state, { path, modelType: 'blank' });
  const cloned = JSON.parse(JSON.stringify(serialized));
  // Textures are reconstructed by the caller (async/renderer-bound); the helper
  // takes them pre-loaded, so feed the fixture's own textures back in.
  return deserializeVesselState(cloned, { path, textures: state.textures });
}

// ---------------------------------------------------------------------------
// Round-trip: every attachable array survives both paths
// ---------------------------------------------------------------------------

describe('serializeVesselState / deserializeVesselState round-trip', () => {
  const fixture = makeFixture();

  for (const path of ['local', 'cloud'] as const) {
    describe(`${path} path`, () => {
      const restored = roundTrip(fixture, path);

      it('preserves nozzles', () => expect(restored.nozzles).toEqual(fixture.nozzles));
      it('preserves liftingLugs', () => expect(restored.liftingLugs).toEqual(fixture.liftingLugs));
      it('preserves saddles', () => expect(restored.saddles).toEqual(fixture.saddles));
      it('preserves welds', () => expect(restored.welds).toEqual(fixture.welds));
      it('preserves textures', () => expect(restored.textures).toEqual(fixture.textures));
      it('preserves annotations', () => expect(restored.annotations).toEqual(fixture.annotations));
      it('preserves rulers', () => expect(restored.rulers).toEqual(fixture.rulers));
      it('preserves coverageRects', () =>
        expect(restored.coverageRects).toEqual(fixture.coverageRects));
      it('preserves inspectionImages', () =>
        expect(restored.inspectionImages).toEqual(fixture.inspectionImages));
      it('preserves scanComposites', () =>
        expect(restored.scanComposites).toEqual(fixture.scanComposites));
      it('preserves appendages', () => expect(restored.appendages).toEqual(fixture.appendages));
      it('preserves pipelines', () => expect(restored.pipelines).toEqual(fixture.pipelines));
      it('preserves referenceDrawings', () =>
        expect(restored.referenceDrawings).toEqual(fixture.referenceDrawings));

      it('preserves domeScanComposites', () => {
        // The cloud path additionally derives section_type for the scan_composites
        // column; normalizeDomeScanComposite spreads it back onto the loaded record.
        const expected =
          path === 'cloud'
            ? fixture.domeScanComposites.map((d) => ({ ...d, sectionType: `dome_${d.head}` }))
            : fixture.domeScanComposites;
        expect(restored.domeScanComposites).toEqual(expected);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Bug fix (confirmed): the local save path now serializes domeScanComposites,
// so dome overlays survive a local save -> reload. Previously omitted entirely.
// ---------------------------------------------------------------------------

describe('local save dome-scan bug fix', () => {
  const fixture = makeFixture();

  it('local serialization includes domeScanComposites', () => {
    const local = serializeVesselState(fixture, { path: 'local' }) as {
      domeScanComposites?: unknown[];
    };
    expect(Array.isArray(local.domeScanComposites)).toBe(true);
    expect(local.domeScanComposites).toHaveLength(2);
  });

  it('local round-trip retains both dome overlays with their head + geometry', () => {
    const restored = roundTrip(fixture, 'local');
    expect(restored.domeScanComposites.map((d) => d.head)).toEqual(['left', 'right']);
    expect(restored.domeScanComposites[0].centerPhi).toBe(30);
    expect(restored.domeScanComposites[1].orientationConfirmed).toBe(false);
  });

  it('local serialization omits the cloud-only dome sectionType', () => {
    const local = serializeVesselState(fixture, { path: 'local' }) as {
      domeScanComposites: Array<Record<string, unknown>>;
    };
    expect(local.domeScanComposites[0]).not.toHaveProperty('sectionType');
  });
});

// ---------------------------------------------------------------------------
// Documented per-path differences — preserved exactly, not papered over.
// ---------------------------------------------------------------------------

describe('per-path field differences', () => {
  it('modelType is written on the cloud path only', () => {
    const fixture = makeFixture();
    const cloud = serializeVesselState(fixture, {
      path: 'cloud',
      modelType: 'scan_overlayed',
    }) as Record<string, unknown>;
    const local = serializeVesselState(fixture, { path: 'local' }) as Record<string, unknown>;
    expect(cloud.modelType).toBe('scan_overlayed');
    expect(local).not.toHaveProperty('modelType');
  });

  it('coordinateOrigin + originSourceScanId persist on the local path only', () => {
    const fixture = makeFixture();
    const local = serializeVesselState(fixture, { path: 'local' }) as Record<string, unknown>;
    const cloud = serializeVesselState(fixture, { path: 'cloud' }) as Record<string, unknown>;
    expect(local.coordinateOrigin).toEqual({ indexMm: 120, scanMm: 45 });
    expect(local.originSourceScanId).toBe('sc1');
    expect(cloud).not.toHaveProperty('coordinateOrigin');
    expect(cloud).not.toHaveProperty('originSourceScanId');
  });

  it('weld capWidth is restored on the cloud path but dropped on the local path', () => {
    const fixture = makeFixture();
    fixture.welds = [
      { name: 'W1', type: 'circumferential', pos: 500, capWidth: 8, color: '#777777' },
    ];
    expect(roundTrip(fixture, 'cloud').welds[0].capWidth).toBe(8);
    expect(roundTrip(fixture, 'local').welds[0].capWidth).toBeUndefined();
  });

  it('scan useGlobalOrigin round-trips on the local path but is dropped on the cloud path', () => {
    const fixture = makeFixture();
    fixture.scanComposites[0].useGlobalOrigin = true;
    expect(roundTrip(fixture, 'local').scanComposites[0].useGlobalOrigin).toBe(true);
    expect(roundTrip(fixture, 'cloud').scanComposites[0].useGlobalOrigin).toBeUndefined();
  });

  it('annotation labelMode is saved but never restored (both paths)', () => {
    const fixture = makeFixture();
    fixture.annotations[0].labelMode = 'table';
    // Saved value is present in the serialized payload...
    const local = serializeVesselState(fixture, { path: 'local' }) as {
      annotations: Array<Record<string, unknown>>;
    };
    expect(local.annotations[0].labelMode).toBe('table');
    // ...but the load mappers intentionally never read it back.
    expect(roundTrip(fixture, 'local').annotations[0].labelMode).toBeUndefined();
    expect(roundTrip(fixture, 'cloud').annotations[0].labelMode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Nozzle bodyId — an appendage-mounted nozzle round-trips on both paths, while a
// main-shell nozzle keeps no bodyId tag (byte-identical legacy shape).
// ---------------------------------------------------------------------------

describe('nozzle bodyId (appendage mount)', () => {
  function makeMixedNozzleFixture(): VesselState {
    const fixture = makeFixture();
    fixture.nozzles = [
      { name: 'N-main', pos: 1000, proj: 200, angle: 90, size: 150 },
      { name: 'N-app', pos: 500, proj: 200, angle: 0, size: 100, bodyId: 'app-1' },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips an appendage-mounted nozzle on the ${path} path`, () => {
      const restored = roundTrip(makeMixedNozzleFixture(), path);
      expect(restored.nozzles[1].bodyId).toBe('app-1');
      expect(restored.nozzles[1].pos).toBe(500);
      expect(restored.nozzles[1].angle).toBe(0);
      // The main-shell nozzle is untouched — no bodyId tag.
      expect(restored.nozzles[0].bodyId).toBeUndefined();
    });

    it(`persists bodyId only for the appendage nozzle on the ${path} path`, () => {
      // JSON boundary mirrors the real save (undefined bodyId is dropped there).
      const serialized = JSON.parse(
        JSON.stringify(serializeVesselState(makeMixedNozzleFixture(), { path }))
      ) as { nozzles: Array<Record<string, unknown>> };
      expect(serialized.nozzles[0]).not.toHaveProperty('bodyId');
      expect(serialized.nozzles[1].bodyId).toBe('app-1');
    });
  }
});

// ---------------------------------------------------------------------------
// Scan composite bodyId (appendage mount) — an appendage-mounted scan round-trips
// on both paths; on the cloud path it derives section_type = 'appendage:<id>'.
// Main-shell scans keep no bodyId and emit no section_type (byte-identical shape).
// ---------------------------------------------------------------------------

describe('scan composite bodyId (appendage mount)', () => {
  function makeMixedScanFixture(): VesselState {
    const fixture = makeFixture();
    const base = fixture.scanComposites[0];
    fixture.scanComposites = [
      { ...base, id: 'sc-main', bodyId: undefined },
      { ...base, id: 'sc-app', bodyId: 'app-1' },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips an appendage-mounted scan on the ${path} path`, () => {
      const restored = roundTrip(makeMixedScanFixture(), path);
      expect(restored.scanComposites[1].bodyId).toBe('app-1');
      // The main-shell scan is untouched — no bodyId tag.
      expect(restored.scanComposites[0].bodyId).toBeUndefined();
    });

    it(`persists bodyId only for the appendage scan on the ${path} path`, () => {
      // JSON boundary mirrors the real save (undefined bodyId is dropped there).
      const serialized = JSON.parse(
        JSON.stringify(serializeVesselState(makeMixedScanFixture(), { path }))
      ) as { scanComposites: Array<Record<string, unknown>> };
      expect(serialized.scanComposites[0]).not.toHaveProperty('bodyId');
      expect(serialized.scanComposites[1].bodyId).toBe('app-1');
    });
  }

  it('derives section_type = appendage:<id> for appendage scans on the cloud path only', () => {
    const cloud = serializeVesselState(makeMixedScanFixture(), {
      path: 'cloud',
      modelType: 'blank',
    }) as { scanComposites: Array<Record<string, unknown>> };
    expect(cloud.scanComposites[1].sectionType).toBe('appendage:app-1');
    // Main-shell scans emit no sectionType (shape unchanged from before bodyId).
    expect(cloud.scanComposites[0]).not.toHaveProperty('sectionType');
  });

  it('omits scan sectionType entirely on the local path', () => {
    const local = serializeVesselState(makeMixedScanFixture(), { path: 'local' }) as {
      scanComposites: Array<Record<string, unknown>>;
    };
    expect(local.scanComposites[0]).not.toHaveProperty('sectionType');
    expect(local.scanComposites[1]).not.toHaveProperty('sectionType');
  });

  it('never restores a derived sectionType onto the loaded scan config', () => {
    const restored = roundTrip(makeMixedScanFixture(), 'cloud') as unknown as {
      scanComposites: Array<Record<string, unknown>>;
    };
    expect(restored.scanComposites[1]).not.toHaveProperty('sectionType');
  });
});

// ---------------------------------------------------------------------------
// Legacy payloads — no domeScanComposites key must load as [] (not undefined).
// ---------------------------------------------------------------------------

describe('legacy payload defaulting', () => {
  const legacy = {
    version: 1,
    vessel: { id: 3000, length: 8000, headRatio: 2.0, orientation: 'horizontal' },
    nozzles: [{ name: 'N1', pos: 100, size: 50 }],
    // NOTE: no domeScanComposites key at all (pre-dome-overlay saved project).
  };

  it('loads domeScanComposites as [] on the local path', () => {
    const restored = deserializeVesselState(legacy, { path: 'local', textures: [] });
    expect(restored.domeScanComposites).toEqual([]);
  });

  it('loads domeScanComposites as [] on the cloud path', () => {
    const restored = deserializeVesselState(legacy, { path: 'cloud', textures: [] });
    expect(restored.domeScanComposites).toEqual([]);
  });

  it('loads appendages as [] on the local path', () => {
    const restored = deserializeVesselState(legacy, { path: 'local', textures: [] });
    expect(restored.appendages).toEqual([]);
  });

  it('loads appendages as [] on the cloud path', () => {
    const restored = deserializeVesselState(legacy, { path: 'cloud', textures: [] });
    expect(restored.appendages).toEqual([]);
  });

  it('still hydrates other arrays and defaults from a sparse legacy payload', () => {
    const restored = deserializeVesselState(legacy, { path: 'local', textures: [] });
    expect(restored.nozzles).toHaveLength(1);
    expect(restored.nozzles[0].name).toBe('N1');
    expect(restored.coverageRects).toEqual([]);
    expect(restored.scanComposites).toEqual([]);
    expect(restored.appendages).toEqual([]);
    expect(restored.hasModel).toBe(true);
  });
});
