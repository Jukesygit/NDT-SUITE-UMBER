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
        id: 'noz-1',
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
        nozzleId: 'noz-1',
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
        // Free-standing: no nozzleId, carries a freeOrigin.
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
// Dome scan bodyId (appendage end closure) — round-trips on both paths; the
// cloud section_type follows the appendage:<id> convention for a body-mounted
// dome scan and dome_left / dome_right for a main head.
// ---------------------------------------------------------------------------

describe('dome scan bodyId (appendage end closure)', () => {
  function makeMixedDomeFixture(): VesselState {
    const fixture = makeFixture();
    const base = fixture.domeScanComposites[0];
    fixture.domeScanComposites = [
      { ...base, id: 'dome-main', bodyId: undefined, head: 'right' },
      { ...base, id: 'dome-app', bodyId: 'app-1', head: 'end' },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips an appendage-mounted dome scan on the ${path} path`, () => {
      const restored = roundTrip(makeMixedDomeFixture(), path);
      expect(restored.domeScanComposites[1].bodyId).toBe('app-1');
      expect(restored.domeScanComposites[1].head).toBe('end');
      // The main-head dome scan is untouched — no bodyId, head preserved.
      expect(restored.domeScanComposites[0].bodyId).toBeUndefined();
      expect(restored.domeScanComposites[0].head).toBe('right');
    });
  }

  it('derives section_type = appendage:<id> for an appendage dome scan (cloud path)', () => {
    const cloud = serializeVesselState(makeMixedDomeFixture(), {
      path: 'cloud',
      modelType: 'blank',
    }) as { domeScanComposites: Array<Record<string, unknown>> };
    expect(cloud.domeScanComposites[1].sectionType).toBe('appendage:app-1');
    // Main-head dome scans keep the dome_left / dome_right convention.
    expect(cloud.domeScanComposites[0].sectionType).toBe('dome_right');
  });

  it('omits dome sectionType entirely on the local path', () => {
    const local = serializeVesselState(makeMixedDomeFixture(), { path: 'local' }) as {
      domeScanComposites: Array<Record<string, unknown>>;
    };
    expect(local.domeScanComposites[0]).not.toHaveProperty('sectionType');
    expect(local.domeScanComposites[1]).not.toHaveProperty('sectionType');
  });

  it('persists bodyId only for the appendage dome scan (JSON boundary)', () => {
    const serialized = JSON.parse(
      JSON.stringify(serializeVesselState(makeMixedDomeFixture(), { path: 'local' }))
    ) as { domeScanComposites: Array<Record<string, unknown>> };
    expect(serialized.domeScanComposites[0]).not.toHaveProperty('bodyId');
    expect(serialized.domeScanComposites[1].bodyId).toBe('app-1');
  });
});

// ---------------------------------------------------------------------------
// Weld / lug / coverage-rect bodyId (appendage mount) — each round-trips on both
// paths; main-shell items keep no bodyId tag (byte-identical legacy shape).
// ---------------------------------------------------------------------------

describe('weld / lug / coverage-rect bodyId (appendage mount)', () => {
  function makeMixed(): VesselState {
    const fixture = makeFixture();
    fixture.welds = [
      { name: 'W-main', type: 'circumferential', pos: 500, color: '#777777' },
      {
        name: 'W-app',
        type: 'longitudinal',
        pos: 100,
        endPos: 400,
        angle: 0,
        color: '#777777',
        bodyId: 'app-1',
      },
    ];
    fixture.liftingLugs = [
      { name: 'L-main', pos: 2000, angle: 270, style: 'padEye', swl: '5t' },
      { name: 'L-app', pos: 300, angle: 0, style: 'trunnion', swl: '10t', bodyId: 'app-1' },
    ];
    fixture.coverageRects = [
      {
        id: 1,
        name: 'C-main',
        pos: 500,
        angle: 90,
        width: 400,
        height: 300,
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.2,
        locked: false,
      },
      {
        id: 2,
        name: 'C-app',
        pos: 200,
        angle: 0,
        width: 300,
        height: 200,
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.2,
        locked: false,
        bodyId: 'app-1',
      },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips appendage-mounted weld/lug/rect on the ${path} path`, () => {
      const restored = roundTrip(makeMixed(), path);
      expect(restored.welds[1].bodyId).toBe('app-1');
      expect(restored.liftingLugs[1].bodyId).toBe('app-1');
      expect(restored.coverageRects[1].bodyId).toBe('app-1');
      // Main-shell items keep no bodyId tag.
      expect(restored.welds[0].bodyId).toBeUndefined();
      expect(restored.liftingLugs[0].bodyId).toBeUndefined();
      expect(restored.coverageRects[0].bodyId).toBeUndefined();
    });

    it(`persists bodyId only for the appendage items on the ${path} path`, () => {
      // JSON boundary mirrors the real save (undefined bodyId is dropped there).
      const serialized = JSON.parse(
        JSON.stringify(serializeVesselState(makeMixed(), { path }))
      ) as {
        welds: Array<Record<string, unknown>>;
        liftingLugs: Array<Record<string, unknown>>;
        coverageRects: Array<Record<string, unknown>>;
      };
      expect(serialized.welds[0]).not.toHaveProperty('bodyId');
      expect(serialized.welds[1].bodyId).toBe('app-1');
      expect(serialized.liftingLugs[0]).not.toHaveProperty('bodyId');
      expect(serialized.liftingLugs[1].bodyId).toBe('app-1');
      expect(serialized.coverageRects[0]).not.toHaveProperty('bodyId');
      expect(serialized.coverageRects[1].bodyId).toBe('app-1');
    });
  }
});

// ---------------------------------------------------------------------------
// Annotation bodyId (appendage mount) — an appendage-mounted annotation round-
// trips on both paths; a main-shell annotation keeps no bodyId tag (byte-
// identical legacy shape). Annotations carry no derived section_type.
// ---------------------------------------------------------------------------

describe('annotation bodyId (appendage mount)', () => {
  function makeMixedAnnotationFixture(): VesselState {
    const fixture = makeFixture();
    const base = fixture.annotations[0];
    fixture.annotations = [
      { ...base, id: 1, name: 'A-main', bodyId: undefined },
      { ...base, id: 2, name: 'A-app', pos: 300, angle: 0, bodyId: 'app-1' },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips an appendage-mounted annotation on the ${path} path`, () => {
      const restored = roundTrip(makeMixedAnnotationFixture(), path);
      expect(restored.annotations[1].bodyId).toBe('app-1');
      expect(restored.annotations[1].pos).toBe(300);
      expect(restored.annotations[1].angle).toBe(0);
      // The main-shell annotation is untouched — no bodyId tag.
      expect(restored.annotations[0].bodyId).toBeUndefined();
    });

    it(`persists bodyId only for the appendage annotation on the ${path} path`, () => {
      // JSON boundary mirrors the real save (undefined bodyId is dropped there).
      const serialized = JSON.parse(
        JSON.stringify(serializeVesselState(makeMixedAnnotationFixture(), { path }))
      ) as { annotations: Array<Record<string, unknown>> };
      expect(serialized.annotations[0]).not.toHaveProperty('bodyId');
      expect(serialized.annotations[1].bodyId).toBe('app-1');
    });
  }
});

// ---------------------------------------------------------------------------
// Coverage targets — the extended CoverageTargets (base regions + per-appendage
// map) must survive save -> load on BOTH paths. Legacy JSON without the key
// loads as undefined (the consumer defaults via ?? DEFAULT_TARGETS).
// ---------------------------------------------------------------------------

describe('coverageTargets round-trip (incl. appendage targets)', () => {
  function makeTargetsFixture(): VesselState {
    const fixture = makeFixture();
    fixture.coverageTargets = {
      leftHead: { rbaPct: 10, scopedPct: 20 },
      cylinder: { rbaPct: 30, scopedPct: 40 },
      rightHead: { rbaPct: 5, scopedPct: 15 },
      appendages: {
        // A dished boot carries shell + closure-dome targets; a flat one has no
        // dome feature, so only `shell` (design 2026-08-17).
        'app-1': { shell: { rbaPct: 50, scopedPct: 60 }, dome: { rbaPct: 25, scopedPct: 35 } },
        'app-2': { shell: { rbaPct: 70, scopedPct: 80 } },
      },
    };
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips coverageTargets including the appendage map on the ${path} path`, () => {
      const fixture = makeTargetsFixture();
      const restored = roundTrip(fixture, path);
      expect(restored.coverageTargets).toEqual(fixture.coverageTargets);
      // The nested appendage entries specifically survive the JSON boundary.
      expect(restored.coverageTargets?.appendages?.['app-1']).toEqual({
        shell: { rbaPct: 50, scopedPct: 60 },
        dome: { rbaPct: 25, scopedPct: 35 },
      });
      expect(restored.coverageTargets?.appendages?.['app-2']).toEqual({
        shell: { rbaPct: 70, scopedPct: 80 },
      });
    });

    it(`normalizes a legacy bare appendage target entry to { shell } on the ${path} path`, () => {
      // Saves written before the shell/dome split stored a bare
      // CoverageTargetEntry as the appendage value. Persisted KEYS are unchanged
      // (leftHead / cylinder / rightHead / appendages) — only the value shape.
      const legacy = {
        version: 1,
        vessel: { id: 3000, length: 8000, headRatio: 2.0, orientation: 'horizontal' },
        coverageTargets: {
          leftHead: { rbaPct: 10, scopedPct: 20 },
          cylinder: { rbaPct: 30, scopedPct: 40 },
          rightHead: { rbaPct: 5, scopedPct: 15 },
          appendages: { 'app-1': { rbaPct: 50, scopedPct: 60 } },
        },
      };
      const restored = deserializeVesselState(legacy, { path, textures: [] });

      expect(restored.coverageTargets?.appendages?.['app-1']).toEqual({
        shell: { rbaPct: 50, scopedPct: 60 },
      });
      // The base region keys are untouched by the normalization.
      expect(restored.coverageTargets?.cylinder).toEqual({ rbaPct: 30, scopedPct: 40 });
    });
  }

  it('serializes coverageTargets on both paths', () => {
    const fixture = makeTargetsFixture();
    for (const path of ['local', 'cloud'] as const) {
      const out = serializeVesselState(fixture, { path, modelType: 'blank' }) as {
        coverageTargets?: unknown;
      };
      expect(out.coverageTargets).toBeDefined();
    }
  });

  it('loads a legacy payload with no coverageTargets key as undefined (defaults downstream)', () => {
    const legacy = {
      version: 1,
      vessel: { id: 3000, length: 8000, headRatio: 2.0, orientation: 'horizontal' },
    };
    expect(
      deserializeVesselState(legacy, { path: 'local', textures: [] }).coverageTargets
    ).toBeUndefined();
    expect(
      deserializeVesselState(legacy, { path: 'cloud', textures: [] }).coverageTargets
    ).toBeUndefined();
  });

  it('a model without coverageTargets omits the key from the serialized JSON (shape unchanged)', () => {
    const fixture = makeFixture(); // no coverageTargets set
    const local = JSON.parse(JSON.stringify(serializeVesselState(fixture, { path: 'local' })));
    expect(local).not.toHaveProperty('coverageTargets');
  });
});

// ---------------------------------------------------------------------------
// Coverage-rect scope metadata (technique / techniqueOther / note, design
// 2026-08-17) — spec-declared optionals on the bodyId precedent: they round-trip
// on both paths when present, and are absent from the serialized JSON otherwise
// (byte-identical legacy saves).
// ---------------------------------------------------------------------------

describe('coverage-rect technique / note metadata', () => {
  function makeRectMetaFixture(): VesselState {
    const fixture = makeFixture();
    fixture.coverageRects = [
      // A legacy rect: no metadata at all.
      { ...fixture.coverageRects[0], id: 1, name: 'C1' },
      {
        ...fixture.coverageRects[0],
        id: 2,
        name: 'C2',
        technique: 'paut-corrosion-mapping',
        note: 'Scan both sides of the long seam.',
      },
      {
        ...fixture.coverageRects[0],
        id: 3,
        name: 'C3',
        technique: 'other',
        techniqueOther: 'Guided wave',
        note: '',
      },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips technique / techniqueOther / note on the ${path} path`, () => {
      const restored = roundTrip(makeRectMetaFixture(), path);

      expect(restored.coverageRects[1].technique).toBe('paut-corrosion-mapping');
      expect(restored.coverageRects[1].note).toBe('Scan both sides of the long seam.');
      expect(restored.coverageRects[1].techniqueOther).toBeUndefined();

      expect(restored.coverageRects[2].technique).toBe('other');
      expect(restored.coverageRects[2].techniqueOther).toBe('Guided wave');

      // The legacy rect stays metadata-free.
      expect(restored.coverageRects[0].technique).toBeUndefined();
      expect(restored.coverageRects[0].techniqueOther).toBeUndefined();
      expect(restored.coverageRects[0].note).toBeUndefined();
    });

    it(`omits absent metadata from the serialized JSON on the ${path} path (byte-identical shape)`, () => {
      const json = JSON.parse(
        JSON.stringify(serializeVesselState(makeRectMetaFixture(), { path, modelType: 'blank' }))
      ) as { coverageRects: Array<Record<string, unknown>> };

      expect(json.coverageRects[0]).not.toHaveProperty('technique');
      expect(json.coverageRects[0]).not.toHaveProperty('techniqueOther');
      expect(json.coverageRects[0]).not.toHaveProperty('note');
      // Present fields are written; an unused techniqueOther still drops out.
      expect(json.coverageRects[1].technique).toBe('paut-corrosion-mapping');
      expect(json.coverageRects[1]).not.toHaveProperty('techniqueOther');
    });
  }

  it('a fixture with no rect metadata serializes exactly as before (both paths)', () => {
    for (const path of ['local', 'cloud'] as const) {
      const json = JSON.parse(
        JSON.stringify(serializeVesselState(makeFixture(), { path, modelType: 'blank' }))
      ) as { coverageRects: Array<Record<string, unknown>> };
      expect(json.coverageRects[0]).not.toHaveProperty('technique');
      expect(json.coverageRects[0]).not.toHaveProperty('techniqueOther');
      expect(json.coverageRects[0]).not.toHaveProperty('note');
    }
  });
});

// ---------------------------------------------------------------------------
// cameraBookmarks — top-level field (C12), both paths + absent-field byte-identity
// ---------------------------------------------------------------------------

describe('cameraBookmarks round-trip', () => {
  function makeBookmarkFixture(): VesselState {
    const fixture = makeFixture();
    fixture.cameraBookmarks = [
      { id: 'bm-1', name: 'View 1', position: [1, 2, 3], target: [0, 0, 0] },
      { id: 'bm-2', name: 'Boot detail', position: [-4, 5, 6.5], target: [1, 1, 1] },
    ];
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips cameraBookmarks on the ${path} path`, () => {
      const fixture = makeBookmarkFixture();
      const restored = roundTrip(fixture, path);
      expect(restored.cameraBookmarks).toEqual(fixture.cameraBookmarks);
    });

    it(`serializes cameraBookmarks on the ${path} path`, () => {
      const out = serializeVesselState(makeBookmarkFixture(), { path, modelType: 'blank' }) as {
        cameraBookmarks?: unknown;
      };
      expect(out.cameraBookmarks).toBeDefined();
    });
  }

  it('a model without cameraBookmarks omits the key from the serialized JSON (byte-identical shape)', () => {
    const fixture = makeFixture(); // no cameraBookmarks set
    for (const path of ['local', 'cloud'] as const) {
      const json = JSON.parse(
        JSON.stringify(serializeVesselState(fixture, { path, modelType: 'blank' }))
      );
      expect(json).not.toHaveProperty('cameraBookmarks');
    }
  });

  it('loads a legacy payload with no cameraBookmarks key as undefined (both paths)', () => {
    const legacy = {
      version: 1,
      vessel: { id: 3000, length: 8000, headRatio: 2.0, orientation: 'horizontal' },
    };
    expect(
      deserializeVesselState(legacy, { path: 'local', textures: [] }).cameraBookmarks
    ).toBeUndefined();
    expect(
      deserializeVesselState(legacy, { path: 'cloud', textures: [] }).cameraBookmarks
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C13 — per-entity `visible` round-trips through the specs on both paths, and an
// ABSENT `visible` is omitted from the serialized JSON (byte-identical shape).
// Annotations & inspection images already carried `visible`; the new coverage is
// nozzles / lugs / saddles / welds / textures / rulers / coverageRects / scan /
// dome composites.
// ---------------------------------------------------------------------------

describe('per-entity visible serialization (C13)', () => {
  function makeHiddenFixture(): VesselState {
    const fixture = makeFixture();
    fixture.nozzles[0].visible = false;
    fixture.liftingLugs[0].visible = false;
    fixture.saddles[0].visible = false;
    fixture.welds[0].visible = false;
    fixture.textures[0].visible = false;
    fixture.rulers[0].visible = false;
    fixture.coverageRects[0].visible = false;
    fixture.scanComposites[0].visible = false;
    fixture.domeScanComposites[0].visible = false;
    return fixture;
  }

  for (const path of ['local', 'cloud'] as const) {
    it(`round-trips visible: false across the new types on the ${path} path`, () => {
      const restored = roundTrip(makeHiddenFixture(), path);
      expect(restored.nozzles[0].visible).toBe(false);
      expect(restored.liftingLugs[0].visible).toBe(false);
      expect(restored.saddles[0].visible).toBe(false);
      expect(restored.welds[0].visible).toBe(false);
      expect(restored.textures[0].visible).toBe(false);
      expect(restored.rulers[0].visible).toBe(false);
      expect(restored.coverageRects[0].visible).toBe(false);
      expect(restored.scanComposites[0].visible).toBe(false);
      expect(restored.domeScanComposites[0].visible).toBe(false);
    });
  }

  it('omits an absent visible from the serialized JSON (byte-identical shape)', () => {
    // makeFixture sets no `visible` on the new types → the key must not appear.
    for (const path of ['local', 'cloud'] as const) {
      const json = JSON.parse(
        JSON.stringify(serializeVesselState(makeFixture(), { path, modelType: 'blank' }))
      ) as {
        nozzles: Array<Record<string, unknown>>;
        welds: Array<Record<string, unknown>>;
        saddles: Array<Record<string, unknown>>;
        rulers: Array<Record<string, unknown>>;
        coverageRects: Array<Record<string, unknown>>;
      };
      expect(json.nozzles[0]).not.toHaveProperty('visible');
      expect(json.welds[0]).not.toHaveProperty('visible');
      expect(json.saddles[0]).not.toHaveProperty('visible');
      expect(json.rulers[0]).not.toHaveProperty('visible');
      expect(json.coverageRects[0]).not.toHaveProperty('visible');
    }
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

  it('backfills a stable id onto a legacy nozzle that has none', () => {
    const restored = deserializeVesselState(legacy, { path: 'local', textures: [] });
    expect(restored.nozzles[0].id).toBe('noz-1');
  });
});

// ---------------------------------------------------------------------------
// Legacy nozzleIndex -> nozzleId migration. Old saves referenced nozzles by
// array position; the loader must resolve those to the backfilled stable ids
// ONCE, preserving the exact physical pairing, and re-save must write nozzleId
// only (never the deprecated index) while still round-tripping.
// ---------------------------------------------------------------------------

describe('legacy pipeline nozzleIndex migration', () => {
  const legacy = {
    version: 1,
    vessel: { id: 3000, length: 8000, headRatio: 2.0, orientation: 'horizontal' },
    // Three id-less nozzles -> backfilled noz-1, noz-2, noz-3 (positional).
    nozzles: [
      { name: 'A', pos: 100, size: 50 },
      { name: 'B', pos: 200, size: 50 },
      { name: 'C', pos: 300, size: 50 },
    ],
    pipelines: [
      { id: 'pl-C', nozzleIndex: 2, pipeDiameter: 100, segments: [] },
      { id: 'pl-A', nozzleIndex: 0, pipeDiameter: 100, segments: [] },
      {
        id: 'pl-free',
        nozzleIndex: -1,
        pipeDiameter: 100,
        segments: [],
        freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
      },
    ],
  };

  for (const path of ['local', 'cloud'] as const) {
    it(`resolves nozzleIndex to the anchored nozzle's stable id on the ${path} path`, () => {
      const restored = deserializeVesselState(legacy, { path, textures: [] });
      const byId = new Map(restored.pipelines.map((p) => [p.id, p]));

      // pl-C was index 2 -> the third nozzle 'C' (noz-3); pl-A was index 0 -> 'A' (noz-1).
      expect(byId.get('pl-C')!.nozzleId).toBe('noz-3');
      expect(byId.get('pl-A')!.nozzleId).toBe('noz-1');
      // The resolved ids name the correct physical nozzles.
      const nozById = new Map(restored.nozzles.map((n) => [n.id, n.name]));
      expect(nozById.get(byId.get('pl-C')!.nozzleId!)).toBe('C');
      expect(nozById.get(byId.get('pl-A')!.nozzleId!)).toBe('A');
      // Free-standing pipeline stays free-standing.
      expect(byId.get('pl-free')!.nozzleId).toBeUndefined();
      // The deprecated index never survives onto runtime pipelines.
      expect(restored.pipelines.every((p) => p.nozzleIndex === undefined)).toBe(true);
    });

    it(`re-saves nozzleId only and round-trips to the same pairing on the ${path} path`, () => {
      const restored = deserializeVesselState(legacy, { path, textures: [] });
      const serialized = JSON.parse(
        JSON.stringify(serializeVesselState(restored, { path, modelType: 'blank' }))
      ) as { pipelines: Array<Record<string, unknown>> };

      // Saved shape carries nozzleId, never the deprecated index.
      for (const p of serialized.pipelines) {
        expect(p).not.toHaveProperty('nozzleIndex');
      }
      const savedC = serialized.pipelines.find((p) => p.id === 'pl-C')!;
      expect(savedC.nozzleId).toBe('noz-3');

      // Loading the re-saved payload preserves the pairing exactly.
      const reloaded = deserializeVesselState(
        JSON.parse(JSON.stringify(serializeVesselState(restored, { path, modelType: 'blank' }))),
        { path, textures: [] }
      );
      const reC = reloaded.pipelines.find((p) => p.id === 'pl-C')!;
      expect(reC.nozzleId).toBe('noz-3');
    });
  }
});
