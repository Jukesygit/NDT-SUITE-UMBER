// =============================================================================
// avatar-service — the both-shapes reader over profiles.avatar_url
// =============================================================================
// Audit finding M11. The column holds TWO value shapes at once during the
// rollout, and which one a given row holds depends on when it was last written
// relative to the parked backfill (database/parked-migrations/avatars_private.sql):
//
//   • a legacy permanent public URL, from every upload before the refactor
//   • a bare bucket object path, from every upload after it
//
// Tolerance across both is what makes the deploy safe in EVERY order — frontend
// first, SQL first, or together. So what is pinned here is not "signing works",
// it is that neither shape can be mishandled:
//
//   • a legacy URL is passed through UNTOUCHED and never signed (signing it
//     would couple the frontend to the backfill having already run)
//   • a path is signed, ONCE per batch, and never rendered raw
//   • anything else resolves to nothing, so the caller draws initials — an
//     unresolvable avatar must never reach the DOM as a broken <img>
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateSignedUrls, mockStorageFrom, mockIsConfigured } = vi.hoisted(() => {
  const mockCreateSignedUrls = vi.fn();
  return {
    mockCreateSignedUrls,
    mockStorageFrom: vi.fn(() => ({ createSignedUrls: mockCreateSignedUrls })),
    mockIsConfigured: vi.fn(() => true),
  };
});

vi.mock('../../supabase-client.js', () => {
  const client = { storage: { from: mockStorageFrom } };
  return { default: client, supabase: client, isSupabaseConfigured: mockIsConfigured };
});

import {
  AVATAR_SIGNED_URL_TTL_SECONDS,
  avatarRefKeys,
  avatarUrlFor,
  classifyAvatarRef,
  resolveAvatarUrl,
  resolveAvatarUrls,
} from '../avatar-service';

/** Sign every requested path deterministically, the happy path. */
function signsEverything() {
  mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://signed.test/${path}?token=abc`,
      error: null,
    })),
    error: null,
  }));
}

const LEGACY_URL = 'https://proj.supabase.co/storage/v1/object/public/avatars/u-1/avatar-1.png';
const PATH = 'u-2/avatar-2.png';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  signsEverything();
});

// ---------------------------------------------------------------------------
// classifyAvatarRef — the single decision every consumer inherits
// ---------------------------------------------------------------------------

describe('classifyAvatarRef', () => {
  it('treats a legacy public URL as already-displayable', () => {
    expect(classifyAvatarRef(LEGACY_URL)).toEqual({ kind: 'url', url: LEGACY_URL });
  });

  it('treats a bare object path as needing a signature', () => {
    expect(classifyAvatarRef(PATH)).toEqual({ kind: 'path', path: PATH });
  });

  it.each([null, undefined, '', '   '])('resolves %p to nothing', (ref) => {
    expect(classifyAvatarRef(ref as string | null | undefined)).toEqual({ kind: 'none' });
  });

  it('refuses a scheme that is not a renderable image source', () => {
    // Passing this through would put an attacker-influenced scheme in an
    // <img src>; there is no avatar shape it could legitimately be.
    expect(classifyAvatarRef('javascript:alert(1)')).toEqual({ kind: 'none' });
    expect(classifyAvatarRef('file:///etc/passwd')).toEqual({ kind: 'none' });
  });

  it('refuses traversal in a path', () => {
    expect(classifyAvatarRef('../../other-user/avatar.png')).toEqual({ kind: 'none' });
  });

  it('normalises leading slashes and a cache-busting query', () => {
    expect(classifyAvatarRef('/u-2/avatar-2.png?t=123')).toEqual({ kind: 'path', path: PATH });
  });

  it('passes data and blob URLs through (renderable, and not signable)', () => {
    expect(classifyAvatarRef('data:image/png;base64,AAA')).toEqual({
      kind: 'url',
      url: 'data:image/png;base64,AAA',
    });
  });
});

// ---------------------------------------------------------------------------
// resolveAvatarUrls — the batch the list surfaces use
// ---------------------------------------------------------------------------

describe('resolveAvatarUrls', () => {
  it('passes a legacy URL through without signing it', async () => {
    const map = await resolveAvatarUrls([LEGACY_URL]);

    expect(map[LEGACY_URL]).toBe(LEGACY_URL);
    // Load-bearing: signing legacy URLs would make the frontend depend on the
    // backfill having already run, which is exactly the coupling being avoided.
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('signs a bare path with the shared TTL', async () => {
    const map = await resolveAvatarUrls([PATH]);

    expect(mockCreateSignedUrls).toHaveBeenCalledWith([PATH], AVATAR_SIGNED_URL_TTL_SECONDS);
    expect(map[PATH]).toBe(`https://signed.test/${PATH}?token=abc`);
  });

  it('handles both shapes in one call, signing only the paths', async () => {
    const map = await resolveAvatarUrls([LEGACY_URL, PATH]);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledWith([PATH], AVATAR_SIGNED_URL_TTL_SECONDS);
    expect(map[LEGACY_URL]).toBe(LEGACY_URL);
    expect(map[PATH]).toContain('token=abc');
  });

  it('signs a repeated path once (a table of people sharing nothing but duplicates)', async () => {
    await resolveAvatarUrls([PATH, PATH, ' ' + PATH + ' ']);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledWith([PATH], AVATAR_SIGNED_URL_TTL_SECONDS);
  });

  it('omits nulls, blanks and garbage rather than mapping them to empty strings', async () => {
    // An empty-string src re-requests the current page; absence is what makes
    // the caller fall back to initials.
    const map = await resolveAvatarUrls([null, undefined, '  ', 'javascript:alert(1)']);

    expect(map).toEqual({});
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('drops a path the storage layer declines to sign', async () => {
    mockCreateSignedUrls.mockResolvedValue({
      data: [{ path: PATH, signedUrl: null, error: 'Object not found' }],
      error: null,
    });

    const map = await resolveAvatarUrls([PATH]);

    expect(map[PATH]).toBeUndefined();
  });

  it('throws on a transport failure so the caller can retry', async () => {
    // Returning {} here would let React Query cache "no avatars" for the whole
    // staleTime after one blip.
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: new Error('network down') });

    await expect(resolveAvatarUrls([PATH])).rejects.toThrow('network down');
  });

  it('degrades to passthrough-only when Supabase is not configured', async () => {
    mockIsConfigured.mockReturnValue(false);

    const map = await resolveAvatarUrls([LEGACY_URL, PATH]);

    expect(map[LEGACY_URL]).toBe(LEGACY_URL);
    expect(map[PATH]).toBeUndefined();
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });
});

describe('resolveAvatarUrl', () => {
  it('resolves a path to a signed URL', async () => {
    await expect(resolveAvatarUrl(PATH)).resolves.toContain('token=abc');
  });

  it('resolves nothing for an absent avatar', async () => {
    await expect(resolveAvatarUrl(null)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Query-key and lookup helpers
// ---------------------------------------------------------------------------

describe('avatarRefKeys', () => {
  it('is order-insensitive and deduplicating, so re-sorting a list is a cache hit', () => {
    expect(avatarRefKeys([PATH, LEGACY_URL, PATH])).toEqual(avatarRefKeys([LEGACY_URL, PATH]));
  });

  it('drops everything unresolvable', () => {
    expect(avatarRefKeys([null, undefined, '', 'javascript:x', PATH])).toEqual([PATH]);
  });
});

describe('avatarUrlFor', () => {
  it('reads back by the raw stored value', async () => {
    const map = await resolveAvatarUrls([PATH]);
    expect(avatarUrlFor(map, PATH)).toContain('token=abc');
  });

  it('returns undefined — never an empty string — when there is nothing to show', () => {
    expect(avatarUrlFor(undefined, PATH)).toBeUndefined();
    expect(avatarUrlFor({}, PATH)).toBeUndefined();
    expect(avatarUrlFor({ [PATH]: '' }, PATH)).toBeUndefined();
    expect(avatarUrlFor({}, null)).toBeUndefined();
  });
});
