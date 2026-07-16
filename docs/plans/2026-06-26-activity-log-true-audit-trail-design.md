---
tags:
  - plans/admin
  - activity-log
  - audit-trail
  - security
  - compliance
---

# Activity Log → True Audit Trail

**Date:** 2026-06-26
**Status:** Implemented (P1–P5 complete; migrations pending apply + manual QA)
**Owner area:** Admin / Security

## Goal

Turn the admin Activity Log from a partial, best-effort, client-trusted feed into a
**server-authoritative, tamper-resistant audit trail that covers the whole platform**
and also serves as the day-to-day operational monitoring feed. Driven by two user
complaints: (1) it "doesn't encompass the breadth of the site", and (2) it "doesn't
work the way a true activity log should".

## Decisions (locked during brainstorm)

1. **Purpose:** Compliance audit trail **+** operational feed (full rework).
2. **Capture model:** Hybrid — DB triggers for data CRUD + hardened RPC for semantic
   events + edge-function logging. (Matches the existing `competency_history` /
   `log_competency_change` trigger idiom already in the repo.)
3. **Read access:** **Admin-only** (`super_admin` + `admin`). Managers lose access
   (behavior change — they can read it today). No org-based RLS needed; `organization_id`
   is captured only as context + an admin filter.
4. **Actor is never client-trusted** — every write path forces the actor from
   `auth.uid()` (RPC) or the JWT subject (edge functions). Triggers read `auth.uid()`.

## Current State (verified 2026-06-26)

- **Write:** single client-side, fire-and-forget `logActivity()` in
  `src/services/activity-log-service.ts` → `log_activity` RPC (10-param, SECURITY
  DEFINER, `SET search_path=public`, re-affirmed by `20260617120000_fix_log_activity_overload.sql`).
- **Schema:** `activity_log` (`database/activity-log-schema.sql`): id, user_id,
  user_email (now always NULL), user_name (NULL), action_type, action_category,
  description, details JSONB, entity_type/id/name, ip_address (NULL), user_agent,
  created_at. RLS: admin+manager read all; user reads own; **`INSERT … WITH CHECK (true)`**;
  service_role full.
- **Read/UI:** `src/pages/admin/tabs/ActivityLogTab.tsx` + `useActivityLog.ts`. Filters:
  user / category / action type / date range; 25-row pagination.
- **PII:** `20260225120000_stop_caching_pii_in_activity_log.sql` deliberately stopped
  caching actor email/name (function writes NULL); names resolved by join at read.
  `stripPiiFromObject` strips PII from `details` before logging.

### Problems

- **Breadth:** logging fires only from auth, profile, competencies, user/org admin,
  competency definitions, document control. **Not logged:** inspection projects,
  vessels, scans/composites, vessel-model edits, file/image uploads, calibration/scan
  logs, report exports, admin config, announcements, shares, password/2FA changes.
  The `asset` category and `vessel_*`/`scan_*` action types are **defined but never called**.
- **Server-side blind spot:** edge functions (`create-user`, `delete-user`,
  `bulk-create-users`, `approve-account-request`, `admin-update-email`, password reset)
  write **no** audit row.
- **Integrity hole:** `WITH CHECK (true)` + client-supplied `p_user_id` ⇒ any
  authenticated user can forge entries or impersonate another actor.
- **No drill-down:** `details` JSONB captured but never displayed.
- **No export, no search box** (service supports `searchQuery`; UI never renders it).
- **No org isolation;** `ip_address` always null.

## Target Design

### 1. Data model & integrity

Additive migration on existing `activity_log` (keep current rows):

- `organization_id UUID NULL` — context + admin filter (not an access gate).
- `actor_role TEXT NULL` — actor's role at the time of the action.
- `details JSONB` — repurposed to carry a **before/after diff** of changed columns.
- `user_email` / `user_name` — **remain NULL/unused.** Do **not** re-introduce actor
  PII caching (respects `20260225` decision). Deleted actors render "Deleted user (·id)".
  Subject identity lives in `entity_name` (not actor PII).

Integrity hardening:

- Hardened `log_activity` ignores any client user id; actor = `auth.uid()`.
- **Revoke direct `INSERT`** on `activity_log` from `authenticated`; **drop the
  `WITH CHECK (true)` policy.** All writes go through SECURITY DEFINER funcs/triggers.
- **Immutable:** no `UPDATE`/`DELETE` policy for anyone. Only `purge_activity_logs(older_than)`
  (super_admin-gated, SECURITY DEFINER) may delete, and it writes its own audit row.
- **Read policy:** `super_admin` + `admin` only (drop manager read path).
- Indexes on `organization_id`, `actor_role` (plus existing).

### 2. Capture layer

**A. DB triggers** — one shared `audit_row_change()` `AFTER INSERT/UPDATE/DELETE`:

| Table | Category | Notes |
|---|---|---|
| `inspection_projects` | inspection | project CRUD |
| project `vessels` | inspection | vessel CRUD |
| `scans` / scan composites | inspection | scan add/change/remove |
| `vessel_models` | inspection | model edits |
| `documents` / controlled docs | document | doc + revision lifecycle |
| `employee_competencies` | competency | coexists with `competency_history`; trigger emits the activity row |
| `competency_definitions` | admin | definition/category CRUD |
| `profiles` | admin | role/status/org changes |
| `organizations` | admin | org CRUD |
| `permission_requests` / `account_requests` | admin | approvals/rejections |

Function derives `actor = auth.uid()`, `entity_type/id/name`, `organization_id` from the
row; on UPDATE writes a **diff of only meaningfully-changed columns** (skips `updated_at`-only
noise; masks PII-typed fields, e.g. `a***@x.com → b***@y.com`).

**B. Hardened RPC — semantic / non-row events:** `login_success`, `login_failed`,
`logout`, `data_exported`, `pii_revealed`, `report_generated`, `document_downloaded`,
`scan_uploaded`. Actor from `auth.uid()`. `login_failed` has no session ⇒ masked
attempted-identifier, null actor.

**C. Edge-function logging** (service role, actor = admin from JWT): `create-user`,
`delete-user`, `bulk-create-users`, `approve/reject-account-request`, permission grants,
`admin-update-email`, password reset.

### 3. PII & retention

- Actor PII never stored; subject label kept in `entity_name`.
- `details` diffs run through `stripPiiFromObject`, **except** the audited field itself,
  which is stored **masked before/after** (so "changed X's email" is provable).
- `pii_revealed` events logged (who unmasked whose data, when).
- Immutable log; only super_admin `purge_activity_logs()` deletes (and self-audits).
- Default retention **24 months** (configurable). Wire purge to a scheduled job
  (Supabase cron / pg_cron) — currently nothing schedules cleanup.

### 4. Admin viewer rebuild (`ActivityLogTab.tsx`)

- **Access:** `super_admin` + `admin` only.
- **Filters:** keep user/category/action/date; **add free-text search** (service already
  supports it), **organization filter**, **entity-type filter**.
- **Category taxonomy** reconciled across the `ActionCategory` union ↔ DB check ↔ filter
  list (single source of truth): `auth`, `security`, `inspection`, `competency`,
  `document`, `admin`, `config`, `data`.
- **Drill-down drawer/modal** on row click: full description, actor + role, entity link,
  organization, IP / user-agent, **rendered before/after diff** from `details`.
- **Export CSV** of the current *filtered* result set (server-side query, all pages).
- Page-size selector (25/50/100). Reuse `DataTable`/`SectionSpinner`/`ErrorDisplay`.
  Industrial theme tokens only — no ad-hoc CSS.
- **Optional / out of scope unless requested:** read-only "My Activity" panel on the
  profile page (uses the existing "view own activity" RLS).

### 5. Safety rules (implementation invariants)

- **Auditing must never break a real write:** trigger insert wrapped in
  `EXCEPTION WHEN OTHERS THEN` (swallow) so a logging failure cannot roll back the
  user's actual save.
- **No double-logging:** once a table is trigger-covered, remove the now-redundant
  client-side `logActivity` calls in its service (competency, user, org, document,
  definitions). Client/RPC logging remains **only** for semantic events triggers can't
  see (auth, export, PII-reveal, report-gen).

## Implementation Plan

Migrations (timestamped, `supabase/migrations/`):
1. **Schema v2** — `organization_id`, `actor_role`, indexes, category check.
2. **Integrity** — harden `log_activity`; revoke direct INSERT + drop `WITH CHECK (true)`;
   immutability; `purge_activity_logs()`; read policy admin/super_admin only.
3. **Audit triggers** — `audit_row_change()` + per-domain triggers (grouped for review).

App code:
- `activity-log-service.ts`: reconcile unions, add org/entity-type filters + CSV export
  query; keep RPC logging for semantic events only.
- `useActivityLog.ts`: export hook, org/entity filters.
- `ActivityLogTab.tsx`: search box, new filters, drill-down modal, export, page-size.
- Edge functions: add service-role audit inserts (~6 functions).
- De-dup: strip redundant client `logActivity` calls from trigger-covered services.

Rollout phases: **P1** schema+integrity+RPC hardening → **P2** triggers (+ de-dup) →
**P3** edge-fn logging → **P4** viewer rebuild → **P5** retention scheduling + docs.
P2–P4 are parallelizable; drive with a multi-agent workflow (per-domain triggers,
per-edge-fn logging, viewer rebuild as concurrent tracks with adversarial verification).

## Verification

- **SQL test script** (`database/`): insert/update/delete ⇒ exactly one correct audit
  row (real actor + diff); **forgery blocked** (authenticated cannot direct-insert);
  **immutability** (update/delete denied); **RLS** (manager cannot read).
- Extend `src/services/activity-log-service.test.ts` (filters, export shaping, taxonomy).
- `npm run build && npm run test && npm run lint`.
- Cross-domain manual QA checklist (create/edit/delete a project, vessel, scan, doc,
  competency, user; login/logout; export; PII reveal ⇒ each appears once with correct
  actor, entity, diff).

## Risks

- **Trigger noise / performance** on high-write tables (scans). Mitigate: diff only
  meaningful columns; indexes; swallow-on-error.
- **Double-logging** during the transition window — mitigated by removing client calls
  in the same phase the trigger lands.
- **Manager access removal** is a visible change — call out in PR/release notes.
- **Schema drift** between `ActionCategory` union, DB check constraint, and UI filter
  list — mitigated by a single shared source-of-truth map.

## Implementation Outcome (as built, 2026-06-26)

Migrations (apply in order):
- `20260626140000_activity_log_v2_schema.sql` — organization_id, actor_role, indexes, NOT VALID category check.
- `20260626150000_activity_log_integrity.sql` — hardened `log_activity` (actor = auth.uid()), dropped BOTH permissive INSERT policy names, revoked direct INSERT/UPDATE/DELETE, admin/super_admin read, re-asserted service-role policy, dropped legacy `cleanup_old_activity_logs`, added super_admin `purge_activity_logs`.
- `20260626160000_activity_log_audit_triggers.sql` — `audit_row_change()` + triggers on 19 tables (profiles UPDATE-only).
- `20260626170000_activity_log_retention.sql` — system `scheduled_purge_activity_logs` + commented pg_cron schedule.

Key as-built decisions / deviations:
- **Legacy asset-hierarchy tables excluded** (`vessels`, `scans`, `inspections` — TEXT PKs) as a deliberate, documented exclusion; the active workflow is project-based (`project_vessels`, `scan_log_entries`, `scan_composites`). Easy to add later.
- **profiles trigger is UPDATE-only**; user creation/deletion are audited in the edge functions (service-role writes have no `auth.uid()`), avoiding null-actor rows and double-logging. Self-profile edits categorized `profile`, admin edits of others `admin`.
- **Triggers skip null-actor (service-role) writes** for the same reason.
- **Two adversarial review passes** ran during build: P1 migrations (found + fixed the stale INSERT-policy name and the legacy ungated purge); edge-function instrumentation (found + fixed masked-email keyed under the PII field `email`, dropped by the sanitizer — renamed to `email_masked`; trimmed unused `maskEmail` imports).
- **Latent bug fixed:** the 2026-02 PII removal left the viewer reading the now-null `user_name`/`user_email`, so every actor rendered as "System". The read path now joins `profiles` for actor identity (`getActivityLogs`, `getActivityUsers`).
- Edge functions instrumented: create-user, delete-user, admin-update-email, approve-account-request, bulk-create-users, sync-users, verify-reset-code, update-password-confirm-email (via `_shared/audit.ts`).
- Client de-dup: removed redundant `logActivity` calls in admin-orgs, competency-mutations, competency-definitions, document-control-service, useUpdateProfile, and admin-users (user CRUD + account_approved). Kept account_rejected and permission_approved/rejected (RPC paths, not trigger-covered).
- UKAS compliance evidence strings updated to the new reality (admin-only read, no actor-PII caching, forgery-proof/append-only, purge_activity_logs retention).

Follow-ups (not in this change):
- Apply the four migrations to the live DB and run the cross-domain QA checklist.
- Enable pg_cron and uncomment the retention schedule (ops).
- Optional: add `report_generated` client logging at the vessel/report download sites; optional "My Activity" profile panel; optional `permission_requests`/`account_requests` triggers if RPC-path reasons aren't needed.
