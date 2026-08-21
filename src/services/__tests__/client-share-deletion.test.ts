// =============================================================================
// client-share-service — permanent deletion and revision pruning
// =============================================================================
// Both are new powers (owner decision 2026-08-21, relaxing the design's
// keep-every-revision-forever rule), and both are irreversible, so what is
// pinned here is the shape of the destruction rather than that it happens:
//
//   • ORDER. Objects come out of storage BEFORE the row, because the storage
//     DELETE policy authorises an object by an EXISTS over the row that owns its
//     prefix. Row-first would strand every object as an undeletable orphan, and
//     nothing about the UI would look wrong at the time.
//   • COMPLETENESS. Storage has no delete-a-prefix call, so a recursive walk is
//     the only thing standing between "deleted" and "mostly deleted". Nested
//     folders and paginated listings are the two ways that walk goes quiet.
//   • RESTRAINT. Pruning must touch superseded revisions and nothing else —
//     the live revision is what the client is reading right now.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockList,
  mockRemove,
  mockEq,
  mockDelete,
  mockStorageFrom,
  mockTableFrom,
  mockIsConfigured,
} = vi.hoisted(() => {
  const mockList = vi.fn();
  const mockRemove = vi.fn();
  const mockEq = vi.fn();
  const mockDelete = vi.fn(() => ({ eq: mockEq }));
  return {
    mockList,
    mockRemove,
    mockEq,
    mockDelete,
    mockStorageFrom: vi.fn(() => ({ list: mockList, remove: mockRemove })),
    mockTableFrom: vi.fn(() => ({ delete: mockDelete })),
    mockIsConfigured: vi.fn(() => true),
  };
});

vi.mock('../../supabase-client', () => {
  const client = { storage: { from: mockStorageFrom }, from: mockTableFrom };
  return { default: client, supabase: client, isSupabaseConfigured: mockIsConfigured };
});

import {
  deleteClientShare,
  listShareObjectPaths,
  pruneShareRevisions,
  revisionsToPrune,
} from '../client-share-service';

// ---------------------------------------------------------------------------
// A fake bucket. Storage marks a folder with a null `id`; a file always has one,
// which is the only thing the walk may use to tell them apart.
// ---------------------------------------------------------------------------

interface Entry {
  name: string;
  id: string | null;
}
type Tree = Record<string, Entry[]>;

const file = (name: string): Entry => ({ name, id: `obj-${name}` });
const folder = (name: string): Entry => ({ name, id: null });

/** Records the sequence of destructive operations, across both systems. */
const order: string[] = [];

function installTree(tree: Tree) {
  mockList.mockImplementation(
    async (dir: string, options?: { limit?: number; offset?: number }) => {
      const entries = tree[dir] ?? [];
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 1000;
      return { data: entries.slice(offset, offset + limit), error: null };
    }
  );
}

/** Every path handed to `remove()`, flattened across its batches. */
function removedPaths(): string[] {
  return mockRemove.mock.calls.flatMap((args) => (args as unknown as [string[]])[0]);
}

const SHARE_ID = '11111111-1111-1111-1111-111111111111';

/** A two-revision share with the real bundle layout: rev-N/vessels/<id>/<file>. */
const BUNDLE_TREE: Tree = {
  [SHARE_ID]: [folder('rev-1'), folder('rev-2')],
  [`${SHARE_ID}/rev-1`]: [file('manifest.json'), folder('vessels')],
  [`${SHARE_ID}/rev-1/vessels`]: [folder('v-1')],
  [`${SHARE_ID}/rev-1/vessels/v-1`]: [file('model.json.gz'), file('screenshot.png')],
  [`${SHARE_ID}/rev-2`]: [file('manifest.json'), folder('vessels')],
  [`${SHARE_ID}/rev-2/vessels`]: [folder('v-1')],
  [`${SHARE_ID}/rev-2/vessels/v-1`]: [file('model.json.gz')],
};

const ALL_BUNDLE_PATHS = [
  `${SHARE_ID}/rev-1/manifest.json`,
  `${SHARE_ID}/rev-1/vessels/v-1/model.json.gz`,
  `${SHARE_ID}/rev-1/vessels/v-1/screenshot.png`,
  `${SHARE_ID}/rev-2/manifest.json`,
  `${SHARE_ID}/rev-2/vessels/v-1/model.json.gz`,
];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;

  mockIsConfigured.mockReturnValue(true);
  mockStorageFrom.mockImplementation(() => ({ list: mockList, remove: mockRemove }));
  mockTableFrom.mockImplementation(() => ({ delete: mockDelete }));
  mockDelete.mockImplementation(() => ({ eq: mockEq }));

  mockRemove.mockImplementation(async (paths: string[]) => {
    order.push(`storage:remove(${paths.length})`);
    return { data: [], error: null };
  });
  mockEq.mockImplementation(async () => {
    order.push('row:delete');
    return { error: null };
  });

  installTree(BUNDLE_TREE);
});

// =============================================================================
// revisionsToPrune — the keep-latest-two rule
// =============================================================================

describe('revisionsToPrune', () => {
  it('keeps the live revision and one previous, prunes the rest', () => {
    const names = ['rev-1', 'rev-2', 'rev-3', 'rev-4', 'rev-5'];
    // Live is 5, so 4 is the quick-restore spare and 1–3 go.
    expect(revisionsToPrune(5, names)).toEqual(['rev-1', 'rev-2', 'rev-3']);
  });

  it('prunes across gaps — a missing revision is not a stopping point', () => {
    // A previous prune (or a failed upload) can leave holes. The rule is about
    // the NUMBER, never about how many folders happen to be present.
    expect(revisionsToPrune(9, ['rev-2', 'rev-5', 'rev-7', 'rev-8', 'rev-9'])).toEqual([
      'rev-2',
      'rev-5',
      'rev-7',
    ]);
  });

  it('prunes nothing at revision 1 or 2 — there is nothing superseded yet', () => {
    expect(revisionsToPrune(1, ['rev-1'])).toEqual([]);
    expect(revisionsToPrune(2, ['rev-1', 'rev-2'])).toEqual([]);
  });

  it('never returns the live revision or its predecessor', () => {
    const kept = revisionsToPrune(4, ['rev-1', 'rev-2', 'rev-3', 'rev-4']);
    expect(kept).not.toContain('rev-4');
    expect(kept).not.toContain('rev-3');
  });

  it('ignores anything that is not exactly rev-<digits>', () => {
    // The output is fed straight to a recursive delete, so a name this code
    // cannot positively identify as a superseded revision is left alone.
    const names = [
      'rev-1',
      'rev-0', // revisions start at 1; a rev-0 is not ours
      'rev-', // no number
      'rev-2x', // trailing junk
      'revision-2', // different word
      'Rev-2', // wrong case
      'rev-2/vessels', // a path, not a folder name
      'vessels', // a bundle subfolder, one level too deep
      '.emptyFolderPlaceholder',
      '',
    ];
    expect(revisionsToPrune(6, names)).toEqual(['rev-1']);
  });

  it('handles unsorted input without reordering what it returns', () => {
    // Listings come back in whatever order storage gives them; the caller only
    // needs the set, so the input order is preserved rather than sorted.
    expect(revisionsToPrune(6, ['rev-3', 'rev-1', 'rev-6', 'rev-2'])).toEqual([
      'rev-3',
      'rev-1',
      'rev-2',
    ]);
  });
});

// =============================================================================
// listShareObjectPaths — the recursive walk
// =============================================================================

describe('listShareObjectPaths', () => {
  it('descends into nested folders and returns full object paths', async () => {
    const paths = await listShareObjectPaths(SHARE_ID);

    expect([...paths].sort()).toEqual([...ALL_BUNDLE_PATHS].sort());
  });

  it('reads the private bundle bucket, not some other one', async () => {
    await listShareObjectPaths(SHARE_ID);

    expect(mockStorageFrom).toHaveBeenCalledWith('client-shares');
  });

  it('returns no folder as an object — a prefix is not deletable', async () => {
    const paths = await listShareObjectPaths(SHARE_ID);

    expect(paths).not.toContain(`${SHARE_ID}/rev-1`);
    expect(paths).not.toContain(`${SHARE_ID}/rev-1/vessels`);
  });

  it('follows pagination past the 1000-entry page limit', async () => {
    // The failure this guards: a share big enough to paginate silently loses
    // everything past the first page, and "deleted" leaves objects behind.
    const first = Array.from({ length: 1000 }, (_, i) => file(`f-${i}.json`));
    const second = [file('f-1000.json'), file('f-1001.json'), file('f-1002.json')];
    installTree({ [`${SHARE_ID}/rev-1`]: [...first, ...second] });

    const paths = await listShareObjectPaths(`${SHARE_ID}/rev-1`);

    expect(paths).toHaveLength(1003);
    expect(paths).toContain(`${SHARE_ID}/rev-1/f-0.json`);
    expect(paths).toContain(`${SHARE_ID}/rev-1/f-1002.json`);
    expect(mockList).toHaveBeenCalledWith(`${SHARE_ID}/rev-1`, { limit: 1000, offset: 0 });
    expect(mockList).toHaveBeenCalledWith(`${SHARE_ID}/rev-1`, { limit: 1000, offset: 1000 });
    // A short second page ends the listing — no third round trip.
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('propagates a listing error instead of reporting an empty prefix', async () => {
    // An empty result and a failed result look identical downstream, and one of
    // them means "delete nothing and then delete the row".
    mockList.mockResolvedValue({ data: null, error: { message: 'storage unavailable' } });

    await expect(listShareObjectPaths(SHARE_ID)).rejects.toMatchObject({
      message: 'storage unavailable',
    });
  });
});

// =============================================================================
// deleteClientShare — storage first, row last
// =============================================================================

describe('deleteClientShare', () => {
  it('removes every listed object BEFORE deleting the row', async () => {
    await deleteClientShare({ id: SHARE_ID });

    expect([...removedPaths()].sort()).toEqual([...ALL_BUNDLE_PATHS].sort());
    // The load-bearing assertion: the row authorises the object deletes, so it
    // must still exist while they run.
    expect(order[order.length - 1]).toBe('row:delete');
    expect(order.filter((step) => step === 'row:delete')).toHaveLength(1);
  });

  it('deletes the share row by id', async () => {
    await deleteClientShare({ id: SHARE_ID });

    expect(mockTableFrom).toHaveBeenCalledWith('client_shares');
    expect(mockEq).toHaveBeenCalledWith('id', SHARE_ID);
  });

  it('leaves the row alone when storage removal fails', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(deleteClientShare({ id: SHARE_ID })).rejects.toMatchObject({
      message: 'permission denied',
    });
    // Objects-but-no-row is retryable; row-but-no-objects is unrecoverable.
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('propagates a row-delete error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'row level security' } });

    await expect(deleteClientShare({ id: SHARE_ID })).rejects.toMatchObject({
      message: 'row level security',
    });
  });

  it('batches removal at 100 paths per call', async () => {
    const many = Array.from({ length: 250 }, (_, i) => file(`f-${i}.json`));
    installTree({ [SHARE_ID]: many });

    await deleteClientShare({ id: SHARE_ID });

    const batchSizes = mockRemove.mock.calls.map(
      (args) => (args as unknown as [string[]])[0].length
    );
    expect(batchSizes).toEqual([100, 100, 50]);
    expect(removedPaths()).toHaveLength(250);
  });

  it('still deletes the row for a share whose bundle is already gone', async () => {
    installTree({});

    await deleteClientShare({ id: SHARE_ID });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', SHARE_ID);
  });
});

// =============================================================================
// pruneShareRevisions — housekeeping that must not touch the live revision
// =============================================================================

describe('pruneShareRevisions', () => {
  const FOUR_REVISIONS: Tree = {
    [SHARE_ID]: [folder('rev-1'), folder('rev-2'), folder('rev-3'), folder('rev-4')],
    [`${SHARE_ID}/rev-1`]: [file('manifest.json')],
    [`${SHARE_ID}/rev-2`]: [file('manifest.json'), folder('vessels')],
    [`${SHARE_ID}/rev-2/vessels`]: [folder('v-1')],
    [`${SHARE_ID}/rev-2/vessels/v-1`]: [file('model.json.gz')],
    [`${SHARE_ID}/rev-3`]: [file('manifest.json')],
    [`${SHARE_ID}/rev-4`]: [file('manifest.json')],
  };

  it('removes only the superseded revisions, recursively', async () => {
    installTree(FOUR_REVISIONS);

    await pruneShareRevisions({ id: SHARE_ID, revision: 4 });

    expect([...removedPaths()].sort()).toEqual([
      `${SHARE_ID}/rev-1/manifest.json`,
      `${SHARE_ID}/rev-2/manifest.json`,
      `${SHARE_ID}/rev-2/vessels/v-1/model.json.gz`,
    ]);
  });

  it('never touches the live revision or the one before it', async () => {
    installTree(FOUR_REVISIONS);

    await pruneShareRevisions({ id: SHARE_ID, revision: 4 });

    const touched = removedPaths().join('\n');
    expect(touched).not.toContain('/rev-3/');
    expect(touched).not.toContain('/rev-4/');
  });

  it('does nothing at all on a share with only two revisions', async () => {
    installTree(BUNDLE_TREE);

    await pruneShareRevisions({ id: SHARE_ID, revision: 2 });

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('never deletes the share row — pruning is storage-only', async () => {
    installTree(FOUR_REVISIONS);

    await pruneShareRevisions({ id: SHARE_ID, revision: 4 });

    expect(mockTableFrom).not.toHaveBeenCalled();
  });

  it('throws on a storage failure and lets the caller set the policy', async () => {
    // The publish mutation catches this and warns; nothing else does.
    installTree(FOUR_REVISIONS);
    mockRemove.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(pruneShareRevisions({ id: SHARE_ID, revision: 4 })).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});
