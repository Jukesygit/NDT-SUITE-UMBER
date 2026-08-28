# Auth and Roles

**Owner:** Jonas · **Last reviewed:** 2026-08-26

---

## Purpose

How identity, authorisation and two-factor authentication work in NDT Suite, and the operational
procedures around them: enrolling users, recovering locked-out accounts, and the break-glass path when
nothing else can help. Read this before changing any policy, guard, or role check.

The system is defended in **three independent layers**. All three must agree; none of them is
sufficient alone:

1. **Route guards** (client) — what a signed-in user can navigate to. Cosmetic; a determined user can
   bypass them.
2. **Edge-function role gates** (server) — what privileged operations a caller may perform.
3. **Row-Level Security** (database) — what rows a caller can actually read or write. This is the
   real control. If RLS is right, layers 1 and 2 being wrong is a UX defect, not a breach.

---

## Prerequisites

- Access to the app as an `admin` or `super_admin` for the admin procedures.
- For break-glass only: Supabase dashboard access to project `ntrgjqrbewbvwofupphn` (owner).
- Familiarity with `deploy.md` before changing any RLS policy — every migration passes adversarial
  review.

---

## The role model

Six roles, defined identically on both sides of the wire —
`src/types/auth.types.ts:5` and `supabase/functions/_shared/role-rank.ts:11`, kept in sync with the
`role` check constraint on `public.profiles`:

| Role | Rank | Typical scope |
|---|---|---|
| `super_admin` | 5 | Everything; the only role that can create another `super_admin` or `admin` |
| `admin` | 4 | Organisation-wide administration |
| `manager` | 3 | Elevated, **org-scoped** (scoped at table *and* storage layers since 2026-08-12) |
| `org_admin` | 2 | Administration within one organisation |
| `editor` | 1 | Create/modify content |
| `viewer` | 0 | Read only |

### Role-rank semantics — the part that matters

`supabase/functions/_shared/role-rank.ts` is the single source. Two functions:

- **`canActOn(callerRole, targetRole)`** — `callerRank > subjectRank`, a **strictly-greater**
  comparison. Peers therefore cannot act on each other: an admin cannot delete, re-email, re-role, or
  reset 2FA on another admin. Only a `super_admin` can reach an `admin`.
- **`canGrantRole(callerRole, grantedRole)`** — `super_admin` and `admin` may only be granted **by** a
  `super_admin`; `manager` only by `admin` or `super_admin`; everything else requires outranking it.

Both **fail closed**, asymmetrically and deliberately (`role-rank.ts:32-42`):

- An **unknown caller role ranks −1** — below everything, so it can never satisfy `>`.
- An **unknown target role ranks +∞** — above everything, so it can never be acted on.

An unrecognised role string therefore denies in both directions. Never "fix" this by defaulting an
unknown role to `viewer`.

Callers that legitimately allow self-service (changing your own email, say) must special-case *self*
**before** calling `canActOn` — it returns `false` for equal ranks, and you are your own peer.

---

## Route guards (client)

Composed in `src/App.tsx`. Nesting order is load-bearing:

```
<ProtectedRoute>                     authenticated?          src/components/ProtectedRoute.tsx
  <RequireTwoFactorEnrolled>         verified TOTP factor?   src/components/auth/RequireTwoFactorEnrolled.tsx
    <Layout>
      <RequireTabVisible tabId>      feature flag on?        src/components/RequireTabVisible.tsx
      <RequireAccess ...>            role high enough?       src/components/RequireAccess.tsx
```

- `RequireTwoFactorEnrolled` sits **inside `ProtectedRoute` and before every tab/role gate**
  (`src/App.tsx:168-170`), so no protected route is reachable without a verified factor.
- `RequireAccess` takes `requireSuperAdmin` / `requireAdmin` / `requireElevatedAccess`
  (`RequireAccess.tsx:6-11`); `isAdmin` includes `super_admin`, and `hasElevatedAccess` means admin **or**
  manager. Failure redirects to `/` — it does not render an error.
- `RequireTabVisible` reads `tab_visibility_settings` and redirects to `/profile` when a tab is hidden
  (`RequireTabVisible.tsx:39-42`). This is a **feature flag, not a security control** — a hidden tab is
  not a protected tab.
- `/share/:token` and `/login` sit **outside** all of this. The share page is deliberately loginless and
  ships no auth code; `npm run verify:share-chunk` enforces that.

---

## RLS conventions (database)

The real authorisation boundary. Three conventions, each earned from a production defect:

1. **Route through `SECURITY DEFINER` helpers, never an inline `profiles` sub-select.**
   `public.get_my_role()` (`supabase/migrations/20260812120000_security_audit_role_scoping.sql:61`),
   `public.auth_is_admin()` (`supabase/migrations/20260618120000_fix_super_admin_competency_access.sql:11`),
   plus `auth_user_org_id()` / `auth_user_role()`. A policy **on** `profiles` that sub-selects `profiles`
   re-enters RLS on itself — the recurring recursion scar in this codebase's policy history.

2. **Organisation scoping is the multi-tenant boundary.** Policies compare the row's
   `organization_id` against the caller's. Several tables — notably `inspection_projects` — have
   **no `super_admin` override**, so an out-of-org account gets a clean, silent `200 []`.
   > This is correct behaviour and has been misdiagnosed as a schema/migration defect at least twice.
   > **REFUTED — do not re-raise.** Verification accounts must be in the **Matrix** organisation.

3. **`SECURITY DEFINER` RPCs need NULL-safe role checks and an explicit `REVOKE ... FROM anon`.**
   An `EXECUTE TO PUBLIC` grant plus a NULL-role path produced a real anon self-promotion chain in
   `approve_permission_request`, caught in adversarial review before it shipped.

Also standing: role-list changes hit **both** the table policy *and* the `storage.objects` policy. A
competency document-review 400 was traced to a storage `SELECT` policy that had not gained
`super_admin`/`manager` alongside the table policy.

---

## Two-factor authentication

### Mandatory enrollment (owner decision, 2026-08-26)

**Immediate hard gate for all roles, no grace period.** A signed-in user with no *verified* TOTP factor
sees the enrollment screen and nothing else. The gate itself blocks the app —
`RequireTwoFactorEnrolled.tsx` renders a shell with two live actions (**Set up two-factor
authentication**, **Sign out**) and opens the wizard on demand rather than automatically.

> The auto-open was removed after a browser drive: the wizard is a portal modal whose overlay covered
> the Sign out button, so the escape hatch was unclickable. RTL tests were green; only the real browser
> caught it (`RequireTwoFactorEnrolled.tsx:69-73`). Keep the shell paintable first.

The gate **fails closed on error**: if factor state cannot be read, the user gets a "Try again /
Sign out" screen rather than being waved through or forced to re-enroll
(`RequireTwoFactorEnrolled.tsx:105-125`).

> **Library gotcha.** auth-js 2.78's `listFactors` buckets only *verified* factors into `data.totp` —
> everything, verified or not, is in `data.all`. Mocks that invent a `data.totp` shape hide dead code.
> Factor-selection rules are single-sourced in `src/services/mfa-factor-shape.ts`; use them, do not
> re-derive.

### Backup codes — self-service reset semantics

Issued by the wizard at enrollment, hashed at rest (PBKDF2, one salt per batch — per-code salts blow
the edge CPU budget). Backing table `public.two_factor_backup_codes`
(`supabase/migrations/20260826120000_two_factor_backup_codes.sql`) has **no RLS policy at all, on
purpose**: `anon` and `authenticated` are both `REVOKE`d, and every legitimate read and write goes
through the service-role edge function.

**Redeeming a backup code is a full 2FA reset, not a login step.** This is the owner-ratified design
ruling and it is not up for re-litigation
(`supabase/functions/manage-backup-codes/index.ts:1-18`):

> The app derives "this session cleared 2FA" solely from the JWT `aal` claim, and only Supabase's own
> MFA verify mints an `aal2` token — an edge function cannot. A design that merely marked a code used
> burned the code and left the user exactly as locked out. So redemption **deletes the TOTP factors**,
> and the whole code set is consumed with them.

Consequences to explain to users:

- Redeem a code → sign in with password → the enrollment gate forces a **fresh enrollment** → `aal2`
  restored, new codes issued.
- **Ordering is load-bearing:** factors are deleted *first*, codes second. A failure consumes nothing
  and the attempt stays retryable. Two concurrent redemptions both succeed.
- `generate` and `regenerate` require an **aal2** session (a backup code is a standing 2FA bypass —
  minting one from a password-only session would hand anyone with the password a permanent bypass).
  `regenerate` additionally verifies a live TOTP code. `verify`/redeem is the one action reachable at
  aal1 — that is its entire purpose.
- Wrong, malformed, already-used and no-codes-enrolled all return the **same** message. Nothing here is
  an oracle for which was true.

### Admin reset

`supabase/functions/admin-reset-2fa/`, invoked from `src/auth/auth-manager.ts:245`. Gates, all of them
(`admin-reset-2fa/index.ts:7-23`):

- **admin or above** (`requireAdmin`), **and**
- **strictly outranking the target** (`canActOn`) — an admin cannot reset another admin's or a
  super_admin's 2FA; peers cannot disarm each other, **and**
- **never the caller themselves.** `requireAdmin` does not inspect assurance level, so an admin session
  holding only a password (aal1) would otherwise strip its own 2FA and complete the bypass it could not
  clear. Self-service removal belongs to the MFA SDK's unenroll, which requires satisfying the factor
  first.
- Outstanding backup codes are destroyed with the factors — a surviving code would be a live bypass
  pointing at an enrolment that no longer exists.
- Every reset writes an activity-log event. It is an account-takeover-shaped action and must be
  visible.

**Procedure:** Admin panel → the user → Reset 2FA → confirm. Tell the user they will be forced through
enrollment on next sign-in.

> Historical note worth knowing: `admin-reset-2fa` and `manage-backup-codes` had **never existed** on
> any project until 2026-08-26. The admin "Reset 2FA" button 404'd in production for its entire life
> and authenticator loss was a permanent lockout. Both were authored, adversarially reviewed and
> deployed that day.

### Break-glass — super_admin lockout

Nothing outranks a `super_admin`, and self-reset is refused by design. If a `super_admin` loses both
their authenticator **and** their backup codes, the only path is the platform:

1. Supabase dashboard → project `ntrgjqrbewbvwofupphn` → **Authentication** → **Users**
2. Find the user → open the user detail
3. **Delete their MFA factors**
4. The user signs in with their password; the enrollment gate forces fresh enrollment on the next load.

This bypasses every application control, so it is **owner-only**, and it should be recorded — treat it
as a security-relevant event and log it per `incident-response.md`.

---

## Session behaviour

- Sessions are stored in `localStorage` under the fixed key `ndt-suite-auth`
  (`src/supabase-client.ts:20`). The fixed key exists because a floating key caused a shared-browser
  session clobber incident (2026-07-28). Do not change it.
- A **12-hour session time-box** is the intended server control, with the client half implemented in
  `src/lib/session-timebox.ts` and `SESSION_TIMEBOX = { hours: 12, warningMinutes: 30, enabled: true }`
  at `src/config/security.ts:35-39`. A pre-expiry banner warns 30 minutes out so unsaved modeler work
  can be saved.
  > **State honestly:** the server enforces the time-box **at the next token refresh**, so the effective
  > maximum is ≈ 12h + access-token TTL (~1h). It forces re-login roughly every 12 hours; it is not a
  > hard instant kill. `session-timebox.ts:10-13` says the same thing.
- A `SESSION_CONFIG` block declaring a 30-minute idle timeout was **deleted** rather than fixed
  (`src/config/security.ts:41-49`): nothing read it and no server setting matched it, so it documented a
  control that did not exist. **Do not reintroduce timeout constants unless something enforces them.**
- The client-side login rate limiter is cosmetic. The real control is GoTrue's server-side rate limits
  in the Supabase Auth settings.

---

## Verification

**Role model:**

```bash
npm run test -- role-rank            # strictly-greater + fail-closed behaviour
```

Manual: sign in as each of the six roles and confirm the visible tabs and the admin actions match the
table above. (This role smoke across all six is a **standing open item** — it has not been executed
end-to-end since the 2026-08 remediation.)

**2FA:**

1. A fresh account with no factor is held at the enrollment gate; the app shell does not render
   behind it, and **Sign out** is clickable before the wizard opens.
2. Enrollment issues backup codes and requires acknowledgement before completing.
3. Sign out, sign in → TOTP challenge → "use a backup code" path is present.
4. Redeem a backup code → signed in → immediately routed back into enrollment (factors were deleted).
5. Admin resets a *lower-ranked* test account → 200. Admin attempts to reset a **peer admin** → denied.
   Admin attempts to reset **themselves** → denied.
6. Non-admin calls the function directly → 403.

**Edge-function gate:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/admin-reset-2fa   # expect 401 unauthenticated
```

**RLS:** sign in as a `viewer` in one organisation and confirm no other organisation's data is
reachable. Confirm a manager account has an `organization_id` — a manager with a NULL org sees nobody.

---

## Escalation / when it goes wrong

| Symptom | Cause | Action |
|---|---|---|
| User stuck on "Two-factor authentication required" | No verified TOTP factor | Working as designed. Enroll, or admin-reset if they cannot |
| User lost authenticator, has backup codes | — | They redeem one → factors cleared → re-enroll. Self-service, no admin needed |
| User lost authenticator and codes | — | Admin (strictly outranking them) performs Reset 2FA |
| **super_admin** lost both | Nothing outranks them | **Break-glass**: dashboard → Auth → user → delete MFA factors. Owner only. Record it |
| Admin gets 403 resetting another admin | Strictly-greater rank check | Correct. Escalate to a `super_admin` |
| "Unable to verify two-factor status" screen | Factor query failed | Fail-closed by design. Check network/Supabase status, then Try again |
| Manager sees no personnel at all | NULL `organization_id` | Assign the account an organization |
| A whole role can suddenly see nothing | RLS policy regression | Do **not** relax the policy to unblock. Diagnose against `pg_policies`; forward-fix by migration with adversarial review |
| Suspected credential compromise | — | `incident-response.md` — rotate at the provider and revoke sessions first |

Related: `incident-response.md` (compromise and evidence), `secrets-and-rotation.md` (keys),
`deploy.md` (shipping a policy change).
