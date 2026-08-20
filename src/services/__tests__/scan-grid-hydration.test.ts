// =============================================================================
// scan-grid-hydration — the modeler's post-load grid re-fetch, shared
// =============================================================================
// The merge here has to stay identical to the block in
// `VesselModeler/hooks/useVesselPersistence.ts`, so these pin: the SELECTION
// predicate (`cloudId && (!data || data.length === 0)`), the FIELD MAPPING and
// its `cloud.stats || existing.stats` fallback, one fetch per unique cloudId,
// and a failed fetch arriving as data rather than an exception.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../components/VesselModeler/types';
import type { ScanCompositeRecord } from '../scan-composite-service';

vi.mock('../scan-composite-service', () => ({
  getScanComposite: vi.fn(),
}));

import { getScanComposite } from '../scan-composite-service';
import { describeHydrationFailures, hydrateScanGrids } from '../scan-grid-hydration';

const mockGet = vi.mocked(getScanComposite);

const CONFIG_STATS = { min: 9, max: 11, mean: 10, median: 10, stdDev: 0.5 };

const CLOUD_STATS: NonNullable<ScanCompositeRecord['stats']> = {
  min: 7.1,
  max: 12.4,
  mean: 9.8,
  median: 9.9,
  stdDev: 1.2,
  validPoints: 3,
  totalPoints: 4,
  totalArea: 40_000,
  validArea: 30_000,
  ndPercent: 25,
  ndCount: 1,
  ndArea: 10_000,
};

const CLOUD_GRID = [
  [7.1, 8.2],
  [9.3, null],
];

/** No inline grid — the shape a cloud save leaves behind. */
const NO_GRID = { data: [], xAxis: [], yAxis: [] };

// Only the fields these tests read; the casts keep the fixtures short.
const SCAN_BASE = {
  id: 'sc-1',
  name: 'Shell scan 1',
  cloudId: 'cloud-a',
  ...NO_GRID,
  indexStartMm: 0,
  orientationConfirmed: true,
} as unknown as ScanCompositeConfig;

const DOME_BASE = {
  id: 'ds-1',
  name: 'Left head scan',
  cloudId: 'cloud-b',
  ...NO_GRID,
  head: 'left',
  centerPhi: 0,
  orientationConfirmed: true,
} as unknown as DomeScanConfig;

const CLOUD_BASE = {
  name: 'cloud',
  thickness_data: CLOUD_GRID,
  x_axis: [0, 50],
  y_axis: [0, 60],
  stats: CLOUD_STATS,
  width: 2,
  height: 2,
} as unknown as ScanCompositeRecord;

const cloudRecord = (
  id: string,
  overrides: Partial<ScanCompositeRecord> = {}
): ScanCompositeRecord => ({ ...CLOUD_BASE, id, ...overrides });

const scanComposite = (overrides: Partial<ScanCompositeConfig> = {}): ScanCompositeConfig => ({
  ...SCAN_BASE,
  stats: { ...CONFIG_STATS },
  ...overrides,
});

const domeComposite = (overrides: Partial<DomeScanConfig> = {}): DomeScanConfig => ({
  ...DOME_BASE,
  stats: { ...CONFIG_STATS },
  ...overrides,
});

const stateWith = (
  scanComposites: ScanCompositeConfig[],
  domeScanComposites: DomeScanConfig[] = []
): VesselState => ({ ...DEFAULT_VESSEL_STATE, scanComposites, domeScanComposites });

beforeEach(() => {
  mockGet.mockReset();
});

describe('hydrateScanGrids — merge', () => {
  it('merges the cloud grid onto a flat scan composite', async () => {
    mockGet.mockResolvedValue(cloudRecord('cloud-a'));
    const composite = scanComposite();
    const { state, failures } = await hydrateScanGrids(stateWith([composite]));

    expect(failures).toEqual([]);
    const merged = state.scanComposites[0];
    expect(merged.data).toEqual(CLOUD_GRID);
    expect(merged.xAxis).toEqual([0, 50]);
    expect(merged.yAxis).toEqual([0, 60]);
    expect(merged.stats).toBe(CLOUD_STATS);
    // Everything else survives the merge untouched.
    expect(merged.id).toBe('sc-1');
    expect(merged.indexStartMm).toBe(0);
    expect(merged.orientationConfirmed).toBe(true);
  });

  it('merges the cloud grid onto a dome scan composite the same way', async () => {
    mockGet.mockResolvedValue(cloudRecord('cloud-b'));
    const { state, failures } = await hydrateScanGrids(stateWith([], [domeComposite()]));

    expect(failures).toEqual([]);
    const merged = state.domeScanComposites[0];
    expect(merged.data).toEqual(CLOUD_GRID);
    expect(merged.xAxis).toEqual([0, 50]);
    expect(merged.yAxis).toEqual([0, 60]);
    expect(merged.stats).toBe(CLOUD_STATS);
    expect(merged.head).toBe('left');
    expect(merged.centerPhi).toBe(0);
  });

  it('does not mutate the input state or its arrays', async () => {
    mockGet.mockResolvedValue(cloudRecord('cloud-a'));
    const composite = scanComposite();
    const input = stateWith([composite]);
    const originalArray = input.scanComposites;
    const { state } = await hydrateScanGrids(input);

    expect(state).not.toBe(input);
    expect(state.scanComposites).not.toBe(originalArray);
    expect(input.scanComposites).toBe(originalArray);
    expect(composite.data).toEqual([]);
  });

  // Selection predicate — mirrors useVesselPersistence exactly.
  it('leaves a composite that already carries inline data untouched BY REFERENCE', async () => {
    const inline = scanComposite({
      id: 'sc-inline',
      cloudId: 'cloud-a',
      data: [[12.5]],
      xAxis: [0],
      yAxis: [0],
    });
    const { state, failures } = await hydrateScanGrids(stateWith([inline]));

    expect(mockGet).not.toHaveBeenCalled();
    expect(state.scanComposites[0]).toBe(inline);
    expect(failures).toEqual([]);
  });

  it('leaves a cloudId-less composite alone and returns the SAME state object', async () => {
    const local = scanComposite({ id: 'sc-local', cloudId: undefined, data: [] });
    const input = stateWith([local]);
    const { state, failures } = await hydrateScanGrids(input);

    expect(mockGet).not.toHaveBeenCalled();
    expect(state).toBe(input);
    expect(state.scanComposites[0]).toBe(local);
    expect(failures).toEqual([]);
  });

  it('hydrates only the empty-grid + cloudId composites in a mixed state', async () => {
    const inline = scanComposite({ id: 'sc-inline', cloudId: 'cloud-x', data: [[12.5]] });
    const empty = scanComposite({ id: 'sc-empty', cloudId: 'cloud-a' });
    mockGet.mockResolvedValue(cloudRecord('cloud-a'));
    const { state } = await hydrateScanGrids(stateWith([inline, empty]));

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('cloud-a');
    expect(state.scanComposites[0]).toBe(inline);
    expect(state.scanComposites[1]).not.toBe(empty);
    expect(state.scanComposites[1].data).toHaveLength(2);
  });

  it('keeps the existing stats when the cloud row has none', async () => {
    mockGet.mockResolvedValue(cloudRecord('cloud-a', { stats: null }));
    const composite = scanComposite();
    const { state } = await hydrateScanGrids(stateWith([composite]));

    // Same reference as before the merge: `cloud.stats || existing.stats`.
    expect(state.scanComposites[0].stats).toBe(composite.stats);
    // The grid still lands — only stats fall back.
    expect(state.scanComposites[0].data).toHaveLength(2);
  });

  // Parallel fetch and dedupe.
  it('fetches each unique cloudId once and merges it everywhere it matches', async () => {
    mockGet.mockImplementation(async (id: string) => cloudRecord(id));
    const shared = 'cloud-shared';
    const { state, failures } = await hydrateScanGrids(
      stateWith(
        [
          scanComposite({ id: 'sc-1', cloudId: shared }),
          scanComposite({ id: 'sc-2', cloudId: shared }),
          scanComposite({ id: 'sc-3', cloudId: 'cloud-other' }),
        ],
        [domeComposite({ id: 'ds-1', cloudId: shared })]
      )
    );

    expect(failures).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet.mock.calls.map((call) => call[0]).sort()).toEqual(
      [shared, 'cloud-other'].sort()
    );
    for (const merged of state.scanComposites) expect(merged.data).toHaveLength(2);
    expect(state.domeScanComposites[0].data).toHaveLength(2);
  });

  it('issues the fetches in parallel, not one after another', async () => {
    let inFlight = 0;
    let peak = 0;
    mockGet.mockImplementation(async (id: string) => {
      peak = Math.max(peak, (inFlight += 1));
      await Promise.resolve();
      inFlight -= 1;
      return cloudRecord(id);
    });

    await hydrateScanGrids(
      stateWith(['cloud-a', 'cloud-b', 'cloud-c'].map((cloudId) => scanComposite({ cloudId })))
    );

    expect(peak).toBe(3);
  });

  // Failures are data, not exceptions.
  it('reports a failed fetch instead of throwing, and preserves the composite', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    const composite = scanComposite();
    const { state, failures } = await hydrateScanGrids(stateWith([composite]));

    expect(failures).toEqual([
      {
        kind: 'scan',
        id: 'sc-1',
        name: 'Shell scan 1',
        cloudId: 'cloud-a',
        message: 'network down',
      },
    ]);
    expect(state.scanComposites[0]).toBe(composite);
  });

  it('reads a message off a Supabase-shaped rejection (not an Error)', async () => {
    mockGet.mockRejectedValue({ message: 'JWT expired', code: 'PGRST301' });
    const { failures } = await hydrateScanGrids(stateWith([scanComposite()]));

    expect(failures[0].message).toBe('JWT expired');
  });

  it('handles a mixed success/failure state — the reachable grid still lands', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'cloud-bad') throw new Error('404');
      return cloudRecord(id);
    });

    const bad = domeComposite({ id: 'ds-bad', name: 'Right head scan', cloudId: 'cloud-bad' });
    const { state, failures } = await hydrateScanGrids(
      stateWith([scanComposite({ cloudId: 'cloud-a' })], [bad])
    );

    expect(state.scanComposites[0].data).toHaveLength(2);
    expect(state.domeScanComposites[0]).toBe(bad);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ kind: 'dome', id: 'ds-bad', cloudId: 'cloud-bad' });
  });
});

it('describeHydrationFailures names the composites, falling back to the local id', () => {
  expect(
    describeHydrationFailures([
      { kind: 'scan', id: 'sc-1', name: 'Shell scan 1', cloudId: 'a', message: 'x' },
      { kind: 'dome', id: 'ds-1', name: 'Left head scan', cloudId: 'b', message: 'y' },
      { kind: 'scan', id: 'sc-9', name: '', cloudId: 'c', message: 'z' },
    ])
  ).toBe('Shell scan 1, Left head scan, sc-9');
});
