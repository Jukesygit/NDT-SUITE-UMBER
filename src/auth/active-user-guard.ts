/**
 * Active-user guard - verifies the LIVE Supabase session identity before a
 * self-service write.
 *
 * Self-service flows (a user editing their own profile / competencies) must
 * never be filed under the wrong person. RLS enforces *who may write*, but a
 * stale or swapped session token could still attach data to the wrong id. This
 * guard re-fetches the authenticated user straight from Supabase and throws if
 * it is missing or differs from the id the UI believes it is acting for.
 */

import { getSupabase } from '../supabase-client';

const IDENTITY_MISMATCH_MESSAGE =
    'Session identity mismatch — please sign out and sign in again before submitting.';

/**
 * Assert that the live Supabase session belongs to `expectedUserId`.
 *
 * @throws Error when there is no live session user, the lookup fails, or the
 *         live user id differs from `expectedUserId`.
 */
export async function assertActiveUser(expectedUserId: string): Promise<void> {
    const { data, error } = await getSupabase().auth.getUser();
    const liveUserId = data?.user?.id;

    if (error || !liveUserId || liveUserId !== expectedUserId) {
        throw new Error(IDENTITY_MISMATCH_MESSAGE);
    }
}
