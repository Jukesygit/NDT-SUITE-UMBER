// =============================================================================
// usePublishClientShare — revision pruning is housekeeping, never a failure mode
// =============================================================================
// A re-publish sweeps up revisions older than the latest two (owner decision
// 2026-08-21). That sweep happens AFTER the row has been flipped, which means
// the client's link is already live and correct by the time it runs — so a prune
// that fails must not turn a successful publish into a red error box, and must
// not stall the result while it retries anything. One console.warn is the entire
// contract.
//
// This drives the real mutation rather than the pruning function, because the
// claim under test is about the mutation's error policy, not about pruning. The
// three.js-bearing dynamic imports (bundle builder, screenshot session) and the
// service layer are stubbed at their module seams; everything between the flip
// and the returned result is the code that actually ships.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
// @ts-ignore - shared JS test helper without type declarations
import { createWrapper } from '../../../test/test-utils';

import { DEFAULT_VESSEL_STATE } from '../../../components/VesselModeler/types';
import type { InspectionProject, ProjectVessel } from '../../../types/inspection-project';
import type { ClientShareRecord } from '../../../services/client-share-service';

vi.mock('../../../services/client-share-service', () => ({
  bumpClientShareRevision: vi.fn(),
  createClientShare: vi.fn(),
  deleteClientShare: vi.fn(),
  expiryFromDays: vi.fn(() => null),
  mintShareToken: vi.fn(() => 'tok-new'),
  nextBundlePath: vi.fn((share: { id: string; revision: number }) => `${share.id}/rev-2`),
  pruneShareRevisions: vi.fn(),
  restoreClientShare: vi.fn(),
  revokeClientShare: vi.fn(),
  uploadShareBundle: vi.fn(async () => undefined),
}));
vi.mock('../../../services/vessel-model-service', () => ({
  getVesselModelByProjectVessel: vi.fn(async () => ({
    id: 'vm-1',
    config: { vessel: {}, version: 3 },
  })),
}));
vi.mock('../../../services/scan-grid-hydration', () => ({
  hydrateScanGrids: vi.fn(async (state: unknown) => ({ state, failures: [] })),
  describeHydrationFailures: vi.fn(() => ''),
}));
vi.mock('../../../components/VesselModeler/engine/vessel-serialization', () => ({
  deserializeVesselState: vi.fn(() => DEFAULT_VESSEL_STATE),
}));
vi.mock('../../../components/VesselModeler/engine/texture-hydration', () => ({
  hydrateSavedTextures: vi.fn(async () => ({ configs: [], objects: {} })),
}));
// Dynamically imported inside the mutation because they reach three.js. Mocking
// the module seam covers the dynamic import too.
vi.mock('../../../components/clientShare/bundle-builder', () => ({
  buildShareBundle: vi.fn(() => ({ files: [] })),
}));
vi.mock('../../../components/clientShare/vessel-screenshot', () => ({
  createScreenshotSession: vi.fn(() => ({
    capture: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    dispose: vi.fn(),
  })),
}));
vi.mock('../../../utils/client-share-passcode', () => ({
  hashPasscode: vi.fn(async () => 'hashed'),
}));

import {
  bumpClientShareRevision,
  createClientShare,
  pruneShareRevisions,
} from '../../../services/client-share-service';
import { usePublishClientShare } from '../useClientShareMutations';

const mockBump = vi.mocked(bumpClientShareRevision);
const mockCreate = vi.mocked(createClientShare);
const mockPrune = vi.mocked(pruneShareRevisions);

const PROJECT = {
  id: 'proj-1',
  name: 'North Farm',
  report_number: 'R-1',
  client_name: 'Acme',
  site_name: 'Site A',
  location_description: null,
} as unknown as InspectionProject;

const VESSEL = {
  id: 'pv-1',
  vessel_name: 'V-101',
  vessel_tag: 'V101',
  vessel_type: 'separator',
} as unknown as ProjectVessel;

function shareRecord(revision: number): ClientShareRecord {
  return {
    id: 'share-1',
    token: 'tok-1',
    project_id: 'proj-1',
    organization_id: 'org-1',
    bundle_path: `share-1/rev-${revision}`,
    revision,
    expires_at: null,
    revoked_at: null,
    passcode_hash: null,
    created_by: 'u1',
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T00:00:00.000Z',
  };
}

function publishParams(existingShare: ClientShareRecord | null) {
  return {
    project: PROJECT,
    vessels: [VESSEL],
    publishedLayers: [],
    expiryDays: null,
    passcode: undefined,
    userId: 'u1',
    existingShare,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockBump.mockResolvedValue(shareRecord(2));
  mockCreate.mockResolvedValue(shareRecord(1));
  mockPrune.mockResolvedValue(undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

async function publish(existingShare: ClientShareRecord | null) {
  const { result } = renderHook(() => usePublishClientShare(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current).toBeTruthy());
  return result.current.mutateAsync(publishParams(existingShare));
}

describe('usePublishClientShare — pruning on re-publish', () => {
  it('prunes with the FLIPPED record, so the live revision is the new one', async () => {
    await publish(shareRecord(1));

    // Passing the pre-flip record here would prune the revision the client is
    // reading right now — the one thing this call must never do.
    expect(mockPrune).toHaveBeenCalledTimes(1);
    expect(mockPrune).toHaveBeenCalledWith(expect.objectContaining({ id: 'share-1', revision: 2 }));
  });

  it('does not prune on a FIRST publish — there is nothing superseded', async () => {
    await publish(null);

    expect(mockPrune).not.toHaveBeenCalled();
  });

  it('resolves the publish even when pruning fails', async () => {
    mockPrune.mockRejectedValue(new Error('permission denied'));

    const outcome = await publish(shareRecord(1));

    // The publish succeeded: the bytes are up and the row is flipped. Reporting
    // a failure here would send a publisher chasing a link that already works.
    expect(outcome.share.revision).toBe(2);
    expect(outcome.skipped).toEqual([]);
  });

  it('warns exactly once about the leftovers, and says the publish worked', async () => {
    mockPrune.mockRejectedValue(new Error('permission denied'));

    await publish(shareRecord(1));

    const pruneWarnings = warn.mock.calls
      .map((args) => String(args[0]))
      .filter((message) => message.includes('superseded revisions'));
    expect(pruneWarnings).toHaveLength(1);
    expect(pruneWarnings[0]).toMatch(/published successfully/);
  });

  it('returns the same result whether pruning succeeds or fails', async () => {
    const clean = await publish(shareRecord(1));

    vi.clearAllMocks();
    mockBump.mockResolvedValue(shareRecord(2));
    mockPrune.mockRejectedValue(new Error('permission denied'));
    const failed = await publish(shareRecord(1));

    expect(failed).toEqual(clean);
  });
});
