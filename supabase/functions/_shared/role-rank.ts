/**
 * Shared role hierarchy for Supabase Edge Functions
 * SECURITY: A caller may only act on users strictly BELOW their own rank, and
 * may only grant roles they are entitled to hand out. Actions on a super_admin
 * are reserved to super_admin.
 *
 * Ranks must stay in sync with the application roles in src/types (and the
 * `role` check constraint on public.profiles).
 */

export type Role = 'viewer' | 'editor' | 'org_admin' | 'manager' | 'admin' | 'super_admin'

/** Privilege ordering. Higher number = more privileged. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  org_admin: 2,
  manager: 3,
  admin: 4,
  super_admin: 5,
}

/** Runtime type guard — anything not in ROLE_RANK is treated as unknown. */
export function isKnownRole(role: string | null | undefined): role is Role {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_RANK, role)
}

/**
 * Rank of the acting caller. Unknown roles rank below everything so an
 * unrecognised caller can never satisfy a `>` comparison (fail closed).
 */
function callerRank(role: string | null | undefined): number {
  return isKnownRole(role) ? ROLE_RANK[role] : -1
}

/**
 * Rank of the subject being acted on. Unknown roles rank above everything so an
 * unresolvable target can never be acted on (fail closed).
 */
function subjectRank(role: string | null | undefined): number {
  return isKnownRole(role) ? ROLE_RANK[role] : Number.POSITIVE_INFINITY
}

/**
 * May `callerRole` perform a privileged action (delete, change login email,
 * change role, ...) on a user holding `targetRole`?
 *
 * Strictly-greater comparison, so peers cannot act on each other: an admin
 * cannot touch another admin or a super_admin. Callers that legitimately allow
 * self-service (e.g. changing one's own email) must special-case `self` BEFORE
 * calling this — it deliberately returns false for equal ranks.
 */
export function canActOn(callerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  return callerRank(callerRole) > subjectRank(targetRole)
}

/**
 * May `callerRole` create/assign a user with `grantedRole`?
 *
 * - admin and super_admin may only be granted by a super_admin
 *   (super_admin is therefore the only role that can replicate itself)
 * - manager may only be granted by admin or super_admin
 * - every other role requires the caller to outrank it
 */
export function canGrantRole(callerRole: string | null | undefined, grantedRole: string | null | undefined): boolean {
  if (!isKnownRole(grantedRole)) return false

  if (grantedRole === 'super_admin' || grantedRole === 'admin') {
    return callerRole === 'super_admin'
  }

  if (grantedRole === 'manager') {
    return callerRole === 'super_admin' || callerRole === 'admin'
  }

  return callerRank(callerRole) > ROLE_RANK[grantedRole]
}
