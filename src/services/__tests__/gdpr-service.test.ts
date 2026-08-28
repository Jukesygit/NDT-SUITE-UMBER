// =============================================================================
// gdpr-service — the avatar reference in an Article 15/20 export
// =============================================================================
// Since the M11 refactor `profiles.avatar_url` holds one of two shapes: a legacy
// permanent public URL, or a bare bucket object path written by every upload
// after the refactor. The export SELECTs that column verbatim, so a modern row
// would hand the data subject `<userId>/avatar-1234.png` — a string that means
// nothing outside the app. An export has to be readable on its own.
//
// What is pinned here is the same both-shapes contract avatar-service keeps,
// plus the one rule specific to an export:
//
//   • a path is resolved to a fresh signed URL, through avatar-service (the
//     single source for the decision AND the signing — never reimplemented here)
//   • a legacy URL is exported exactly as stored, and is never sent for signing
//   • a signing failure NEVER fails the export — the raw stored value goes out
//     instead, because denying someone their entire data set over a profile
//     picture is the worse outcome, and the raw value is still an honest record
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateSignedUrls, mockStorageFrom, mockFrom, tableRows } = vi.hoisted(() => {
  const tableRows = new Map<string, unknown>();
  const mockCreateSignedUrls = vi.fn();

  /**
   * Minimal PostgREST-shaped builder: every filter/modifier returns `this`, the
   * builder itself is awaitable, and `.single()` unwraps. Enough for the seven
   * parallel reads `exportUserData` issues without pretending to be Supabase.
   */
  const mockFrom = vi.fn((table: string) => {
    const rows = tableRows.get(table);
    const builder: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows ?? [], error: null }).then(resolve),
      single: () => Promise.resolve({ data: rows ?? null, error: null }),
    };
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    return builder;
  });

  return {
    tableRows,
    mockCreateSignedUrls,
    mockFrom,
    mockStorageFrom: vi.fn(() => ({ createSignedUrls: mockCreateSignedUrls })),
  };
});

// gdpr-service imports `../supabase-client`, avatar-service imports
// `../supabase-client.js`. Both specifiers resolve to the same module, but the
// mock is registered under both so the test does not depend on that. The
// factories are inlined because `vi.mock` is hoisted above any const.
vi.mock('../../supabase-client', () => {
  const client = { from: mockFrom, storage: { from: mockStorageFrom } };
  return { default: client, supabase: client, isSupabaseConfigured: () => true };
});
vi.mock('../../supabase-client.js', () => {
  const client = { from: mockFrom, storage: { from: mockStorageFrom } };
  return { default: client, supabase: client, isSupabaseConfigured: () => true };
});

import { exportUserData } from '../gdpr-service';

const USER_ID = 'user-1';
const AVATAR_PATH = 'user-1/avatar-1700000000000.png';
const SIGNED_URL =
  'https://project.supabase.co/storage/v1/object/sign/avatars/user-1/avatar.png?token=abc';
const LEGACY_URL = 'https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.png';

function seedProfile(avatarUrl: string | null) {
  tableRows.clear();
  tableRows.set('profiles', { id: USER_ID, username: 'jonas', avatar_url: avatarUrl });
  // Left empty so the competency_documents follow-up query never fires.
  tableRows.set('employee_competencies', []);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateSignedUrls.mockResolvedValue({
    data: [{ path: AVATAR_PATH, signedUrl: SIGNED_URL }],
    error: null,
  });
});

describe('exportUserData — avatar_url resolution', () => {
  it('resolves a path-shaped avatar_url to a signed URL', async () => {
    seedProfile(AVATAR_PATH);

    const result = await exportUserData(USER_ID);

    expect(result.profile?.avatar_url).toBe(SIGNED_URL);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls.mock.calls[0][0]).toEqual([AVATAR_PATH]);
  });

  it('exports a legacy public URL exactly as stored, without signing it', async () => {
    seedProfile(LEGACY_URL);

    const result = await exportUserData(USER_ID);

    // Untouched — signing a legacy URL would couple the export to the backfill.
    expect(result.profile?.avatar_url).toBe(LEGACY_URL);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('exports the raw stored path when signing throws, rather than failing the export', async () => {
    seedProfile(AVATAR_PATH);
    mockCreateSignedUrls.mockRejectedValue(new Error('storage unreachable'));

    const result = await exportUserData(USER_ID);

    expect(result.profile?.avatar_url).toBe(AVATAR_PATH);
    // The rest of the export is unaffected — this is the whole point.
    expect(result.profile?.username).toBe('jonas');
    expect(result.exportedAt).toEqual(expect.any(String));
  });

  it('exports the raw stored path when the object could not be signed', async () => {
    seedProfile(AVATAR_PATH);
    mockCreateSignedUrls.mockResolvedValue({ data: [], error: null });

    const result = await exportUserData(USER_ID);

    expect(result.profile?.avatar_url).toBe(AVATAR_PATH);
  });

  it('leaves a null avatar_url alone', async () => {
    seedProfile(null);

    const result = await exportUserData(USER_ID);

    expect(result.profile?.avatar_url).toBeNull();
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });
});
