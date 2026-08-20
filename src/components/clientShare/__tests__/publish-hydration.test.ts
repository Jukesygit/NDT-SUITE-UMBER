// =============================================================================
// Publish refuses to ship a vessel whose scan grids could not be loaded
// =============================================================================
// A cloud save strips composite thickness grids into `scan_composites`; the
// bundle is the client's ONLY copy of them. Publishing without them produced a
// live defect: stats tables with numbers, and viewports with no heatmap and no
// hover thickness. The ruling is that a publisher must never silently ship that,
// so `loadVesselState` throws and the dialog surfaces it.
//
// The seam is `loadVesselState` rather than the mutation: driving the mutation
// would mean standing up React Query plus the three.js-bearing bundle builder
// and screenshot session for an assertion that is entirely about this function.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DEFAULT_VESSEL_STATE, type VesselState } from '../../VesselModeler/types';
import type { ScanGridHydrationFailure } from '../../../services/scan-grid-hydration';

vi.mock('../../../services/vessel-model-service', () => ({
  getVesselModelByProjectVessel: vi.fn(),
}));
vi.mock('../../../services/scan-grid-hydration', () => ({
  hydrateScanGrids: vi.fn(),
  describeHydrationFailures: (failures: ScanGridHydrationFailure[]) =>
    failures.map((failure) => failure.name).join(', '),
}));
vi.mock('../../VesselModeler/engine/vessel-serialization', () => ({
  deserializeVesselState: vi.fn(() => DEFAULT_VESSEL_STATE),
}));
vi.mock('../../VesselModeler/engine/texture-hydration', () => ({
  hydrateSavedTextures: vi.fn(async () => ({ configs: [], objects: {} })),
}));
// Never loaded for real: it reaches supabase-js, and these tests must not touch
// a network or a live project.
vi.mock('../../../services/client-share-service', () => ({
  bumpClientShareRevision: vi.fn(),
  createClientShare: vi.fn(),
  expiryFromDays: vi.fn(),
  mintShareToken: vi.fn(),
  nextBundlePath: vi.fn(),
  restoreClientShare: vi.fn(),
  revokeClientShare: vi.fn(),
  uploadShareBundle: vi.fn(),
}));

import { getVesselModelByProjectVessel } from '../../../services/vessel-model-service';
import { hydrateScanGrids } from '../../../services/scan-grid-hydration';
import { loadVesselState } from '../../../hooks/mutations/useClientShareMutations';

const mockGetModel = vi.mocked(getVesselModelByProjectVessel);
const mockHydrate = vi.mocked(hydrateScanGrids);

const MODEL_ROW = {
  id: 'vm-1',
  config: { vessel: {}, version: 3 },
} as unknown as Awaited<ReturnType<typeof getVesselModelByProjectVessel>>;

const FAILURE: ScanGridHydrationFailure = {
  kind: 'scan',
  id: 'sc-1',
  name: 'Shell scan 1',
  cloudId: 'cloud-a',
  message: 'network down',
};

beforeEach(() => {
  mockGetModel.mockReset();
  mockHydrate.mockReset();
});

describe('loadVesselState — publish-side grid hydration', () => {
  it('returns the HYDRATED state, not the raw deserialized one', async () => {
    const hydrated = { ...DEFAULT_VESSEL_STATE } as VesselState;
    mockGetModel.mockResolvedValue(MODEL_ROW);
    mockHydrate.mockResolvedValue({ state: hydrated, failures: [] });

    const state = await loadVesselState('pv-1', 'V-101');

    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(state).toBe(hydrated);
  });

  it('throws, naming the vessel and the composites, when a grid cannot be loaded', async () => {
    mockGetModel.mockResolvedValue(MODEL_ROW);
    mockHydrate.mockResolvedValue({ state: DEFAULT_VESSEL_STATE, failures: [FAILURE] });

    await expect(loadVesselState('pv-1', 'V-101')).rejects.toThrow(
      /Could not load scan data for V-101 \(Shell scan 1\).*was not published/s
    );
  });

  it('skips a vessel with no linked model without hydrating anything', async () => {
    mockGetModel.mockResolvedValue(null);

    await expect(loadVesselState('pv-1', 'V-101')).resolves.toBeNull();
    expect(mockHydrate).not.toHaveBeenCalled();
  });
});
