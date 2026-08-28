// =============================================================================
// useUploadAvatar — what gets written into profiles.avatar_url
// =============================================================================
// Audit finding M11. The `avatars` bucket cannot be made private while uploads
// keep minting permanent public object URLs and persisting them, so the whole
// remediation rests on one property of this mutation: the value it stores is a
// bucket object PATH, and nothing else.
//
// That property is invisible in the UI — an avatar uploaded either way looks
// identical while the bucket is still public — so it is pinned here:
//
//   • the persisted value is the path, carrying no scheme and no host
//   • getPublicUrl is never called (the regression this file exists to catch)
//   • the persisted value is byte-identical to the object that was uploaded,
//     because a signature is minted against exactly that string
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
// @ts-ignore - shared JS test helper without type declarations
import { createWrapper } from '../../../test/test-utils';

const { mockUpload, mockGetPublicUrl, mockStorageFrom, mockEq, mockUpdate, mockTableFrom } =
  vi.hoisted(() => {
    const mockUpload = vi.fn(async () => ({ data: { path: 'ignored' }, error: null }));
    const mockGetPublicUrl = vi.fn(() => ({
      data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/avatars/leaked.png' },
    }));
    const mockEq = vi.fn(async () => ({ error: null }));
    const mockUpdate = vi.fn(() => ({ eq: mockEq }));
    return {
      mockUpload,
      mockGetPublicUrl,
      mockStorageFrom: vi.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
      mockEq,
      mockUpdate,
      mockTableFrom: vi.fn(() => ({ update: mockUpdate })),
    };
  });

vi.mock('../../../supabase-client', () => {
  const client = { storage: { from: mockStorageFrom }, from: mockTableFrom };
  return { default: client, supabase: client, isSupabaseConfigured: vi.fn(() => true) };
});

import { useUploadAvatar } from '../useUploadAvatar';

function pngFile(name = 'me.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

/** Run the mutation to completion and hand back the hook result. */
async function upload(file: File, userId = 'user-1') {
  const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
  result.current.mutate({ userId, file });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockResolvedValue({ data: { path: 'ignored' }, error: null });
  mockEq.mockResolvedValue({ error: null });
});

describe('useUploadAvatar', () => {
  it('persists the object path, not a URL', async () => {
    const result = await upload(pngFile());

    expect(result.current.isSuccess).toBe(true);
    expect(mockTableFrom).toHaveBeenCalledWith('profiles');

    const persisted = mockUpdate.mock.calls[0][0] as { avatar_url: string };
    expect(persisted.avatar_url).toMatch(/^user-1\/avatar-\d+\.png$/);
    expect(persisted.avatar_url).not.toContain('://');
    expect(persisted.avatar_url).not.toContain('/storage/v1/');
  });

  it('never mints a public URL', async () => {
    await upload(pngFile());

    // The finding itself: a permanent world-readable URL for a staff photo.
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('persists exactly the object it uploaded, so the path can be signed', async () => {
    await upload(pngFile());

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    const uploadedName = mockUpload.mock.calls[0][0] as string;
    const persisted = mockUpdate.mock.calls[0][0] as { avatar_url: string };
    expect(persisted.avatar_url).toBe(uploadedName);
  });

  it('returns the stored path to the caller', async () => {
    const result = await upload(pngFile());

    const persisted = mockUpdate.mock.calls[0][0] as { avatar_url: string };
    expect(result.current.data).toEqual({ path: persisted.avatar_url });
  });

  it('rejects a non-image before anything reaches storage', async () => {
    const result = await upload(
      new File([new Uint8Array([1])], 'cert.pdf', { type: 'application/pdf' })
    );

    expect(result.current.isError).toBe(true);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not write a profile row when the upload fails', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });

    const result = await upload(pngFile());

    expect(result.current.isError).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // The two size-rejection branches — one client-side, one from storage — used to
  // quote different numbers: the real cap was 5MB while the storage branch still
  // said "Maximum size is 2MB", telling a user to shrink a file that would have
  // been accepted. Both now read the same constant, so they cannot drift again.
  describe('the size limit it reports', () => {
    it('quotes the real 5MB cap when the file is too large', async () => {
      const oversized = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', {
        type: 'image/png',
      });

      const result = await upload(oversized);

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('File is too large. Maximum size is 5MB.');
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('quotes the same cap when storage is the one rejecting the size', async () => {
      mockUpload.mockResolvedValue({
        data: null,
        error: { message: 'Payload too large: exceeded maximum size' },
      });

      const result = await upload(pngFile());

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('File is too large. Maximum size is 5MB.');
      expect(result.current.error?.message).not.toContain('2MB');
    });
  });
});
