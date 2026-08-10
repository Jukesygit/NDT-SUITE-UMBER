# Competency Attribution & Session-Identity Hardening — Design

**Date:** 2026-07-28
**Trigger:** Incident — an admin added Ben Wilkes' TOFD L2 certificate + document to Richard Biggar's profile. RLS behaved as designed (only privileged roles can write on behalf of others); the system failure is that nothing records or surfaces *who performed* a competency write, and the session/identity investigation surfaced several adjacent weaknesses.

## Goals

1. **Attribution:** every competency record knows who created it; the activity log records *for whom* an action was performed; both are visible in the UI (admin activity log + competency cards).
2. **Hardening:** fix the identified session/identity weaknesses so a wrong-identity session cannot act silently.

## Non-goals

- Reworking the no-op Supabase auth lock ([supabase-client.ts:27](../../src/supabase-client.ts)). The no-op exists to avoid a real signInWithPassword deadlock; the incident was not multi-tab clobbering; the harm vector is mitigated by items H1–H4 below. Revisit alongside a supabase-js upgrade. (Recorded in Decision Log.)
- Supabase dashboard settings (session inactivity timeout, revoking sessions) — operator actions, recommended separately.
- Backfilling `created_by` for historical rows (unknowable; legacy rows display no author).

## Part A — Attribution

### A1. `created_by` on competency rows (migration `20260728130000_competency_attribution.sql`)

- `employee_competencies.created_by uuid REFERENCES profiles(id) ON DELETE SET NULL` (references **profiles**, not auth.users, so PostgREST can embed the author's name; profiles is 1:1 with auth.users).
- Same column on `competency_documents`, guarded with `to_regclass` (that table is created by the same-day migration `20260728120000`; timestamp ordering guarantees it applies first when both are pending).
- **Tamper-proof:** BEFORE INSERT trigger sets `NEW.created_by := auth.uid()` whenever `auth.uid()` is non-null (client-supplied values are overwritten; service-role writes may supply their own). No client code changes needed to capture attribution.
- No RLS changes required (column rides existing row policies).

### A2. Activity-log "on behalf of" enrichment (same migration)

`audit_row_change()` (from `20260626160000`) currently writes `details = NULL` on INSERT. Change (CREATE OR REPLACE): after building `v_details`, for any audited row that has a `user_id` key differing from the actor:

```sql
IF v_row ? 'user_id' AND (v_row->>'user_id') IS DISTINCT FROM v_actor::text THEN
    v_details := COALESCE(v_details, '{}'::jsonb)
              || jsonb_build_object('on_behalf_of', v_row->>'user_id');
END IF;
```

Applies uniformly to INSERT/UPDATE/DELETE; merges with existing UPDATE `changes` / DELETE `deleted` payloads; stores only a UUID (no PII). Taxonomy (10 categories) unchanged.

### A3. Storage INSERT policy role fix (migration `20260728131000_fix_storage_insert_super_admin.sql`)

The live storage INSERT policy (`database/migrations/fix-admin-document-upload-policy.sql`) checks only `role = 'admin'` in its privileged branch — `super_admin` is missing (under-permits). Recreate with `role IN ('admin','super_admin')`; org_admin same-org branch unchanged; manager stays SELECT-only (matches table policy). Mirror the change into `database/storage-policies.sql` with the existing sync-warning comment convention (per the storage role-omission lesson).

### A4. UI surfacing

- **ActivityLogTab** ([src/pages/admin/tabs/ActivityLogTab.tsx](../../src/pages/admin/tabs/ActivityLogTab.tsx)): when `details.on_behalf_of` is present, render "for {name}" beside the entry (resolve names from profiles via existing query data or a lightweight id→name map), plus a filter toggle "On-behalf actions only" so admins can audit exactly the class of action that caused this incident.
- **Competency cards** (personnel expanded row + profile page card component): when `created_by` is present and ≠ `user_id`, show a subtle "Added by {name}" line. Requires `created_by` + embedded author name in the competency selects (`competency-queries.ts`, `personnel-service.ts`).
- Legacy rows (`created_by IS NULL`): show nothing.

### Retroactive forensics

Historic incidents remain resolvable by correlating `activity_log` (actor, `action_type='competency_created'`, timestamp) with `employee_competencies.created_at` — documented in the incident query set; no code needed.

## Part B — Session-identity hardening

- **H1. Visible identity, always.** [LayoutNew.tsx](../../src/components/LayoutNew.tsx) currently renders no logged-in identity anywhere. Add name + role (from `useAuth()`) to the header, design-system classes/tokens only.
- **H2. Fix the stale-identity guard.** [auth-supabase.ts:70,74](../../src/auth/auth-supabase.ts): `if (session?.user && !this.currentUser)` never refreshes when the session's user *changes*. Replace with an identity-change check (`session.user.id !== this.currentUser?.id`) that reloads the profile and re-broadcasts auth state; AuthContext must clear the React Query cache on identity change (not just logout) so no cross-user data survives a swap.
- **H3. Restored-session banner.** When a session is restored from persistence at app open (as opposed to an explicit sign-in), show a dismissible banner: "Signed in as {name} — Not you? Sign out." Banner, not a blocking modal (shared-machine mistake-catcher with near-zero friction).
- **H4. Self-service write assertion.** New guard `assertActiveUser(expectedUserId)` (in `src/auth/`): fetches the live session user and throws a clear error if it differs. Called from ProfilePage's self-service competency save + document upload handlers before mutating. Personnel/admin flows intentionally skip it (on-behalf is legitimate there).
- **H5. PII console hygiene.** Strip the `[AUTH-DEBUG] … user=${email}` console.log calls in AuthContext/auth modules (violates no-console rule; logs emails).

## Implementation plan (orchestration)

| Task | Files | Tier |
|---|---|---|
| DB migrations A1–A3 + SQL mirrors | `supabase/migrations/` (2 new files), `database/storage-policies.sql`, `database/competency-schema.sql` (reference update) | opus |
| Attribution data + UI A4 | `competency-queries.ts`, `personnel-service.ts`, competency types, `ActivityLogTab.tsx`, competency card component(s) | opus |
| Hardening H1–H5 | `auth-supabase.ts`, new guard util, `AuthContext.tsx`, `LayoutNew.tsx`, `ProfilePage.tsx` | opus |
| Verification (build/test/lint) | — | sonnet |

Constraints: working tree carries uncommitted multi-document changes in the same competency files — **preserve them; build on the working tree, never revert**. Files stay under 300 lines; React Query patterns; design-system classes only. Nothing is committed without the user's say-so.

## Verification

- `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`.
- SQL reviewed against live-policy set from the 2026-07-28 RLS audit (no behavioural change for non-privileged users; storage INSERT gains super_admin only).
- Manual: admin adds a competency for another user → activity log shows "for {name}"; card shows "Added by {admin}"; self-service submission under a mismatched session throws the assertion error.
