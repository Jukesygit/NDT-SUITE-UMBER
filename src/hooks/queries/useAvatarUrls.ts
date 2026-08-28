/**
 * useAvatarUrls / useAvatarUrl — React Query access to displayable avatar URLs.
 *
 * Every surface that renders `profiles.avatar_url` goes through here, so the
 * both-shapes contract (legacy public URL passthrough vs storage path → signed
 * URL) lives in exactly one place: `services/avatar-service.ts`.
 *
 * Lists resolve in ONE round trip — a personnel table of 40 people issues a
 * single `createSignedUrls` call, not 40. Never fetch avatars with
 * useState + useEffect; the query cache is what keeps a re-render or a re-sort
 * from re-signing.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AVATAR_SIGNED_URL_TTL_SECONDS,
  avatarRefKeys,
  avatarUrlFor,
  resolveAvatarUrls,
  type AvatarRef,
  type AvatarUrlMap,
} from '../../services/avatar-service';

/**
 * Re-sign at half the signed-URL lifetime. Comfortably inside the TTL, so a URL
 * handed to an `<img>` cannot expire between resolution and paint.
 */
const AVATAR_STALE_MS = (AVATAR_SIGNED_URL_TTL_SECONDS / 2) * 1000;

export const avatarKeys = {
  all: ['avatarUrls'] as const,
  batch: (keys: string[]) => ['avatarUrls', keys] as const,
};

/**
 * Resolve a batch of stored avatar references. Pass the raw `avatar_url` values
 * straight from the rows; nulls and blanks are filtered out here.
 *
 * The query key is the sorted, deduplicated set of resolvable refs, so
 * re-sorting a list is a cache hit and adding one person re-signs the batch.
 */
export function useAvatarUrls(refs: readonly AvatarRef[]) {
  const keys = avatarRefKeys(refs);

  return useQuery<AvatarUrlMap>({
    queryKey: avatarKeys.batch(keys),
    queryFn: () => resolveAvatarUrls(keys),
    enabled: keys.length > 0,
    staleTime: AVATAR_STALE_MS,
    gcTime: AVATAR_STALE_MS,
  });
}

/**
 * Resolve a single stored avatar reference to a displayable URL.
 * Returns undefined while loading, on failure, and for an absent avatar — all
 * three cases render the caller's initials/placeholder, which is the intent.
 */
export function useAvatarUrl(ref: AvatarRef): string | undefined {
  const query = useAvatarUrls([ref]);
  return avatarUrlFor(query.data, ref);
}

export default useAvatarUrls;
