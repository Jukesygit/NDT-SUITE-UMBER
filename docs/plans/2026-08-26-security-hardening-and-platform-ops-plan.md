# Security Hardening & Platform Ops Plan

**Date:** 2026-08-26 · **Status:** Proposed — awaiting owner sign-off on flagged decisions
**Inputs:** senior-engineer review (2026-08-26), ISO 27001-style posture assessment (2026-08-26, evidence sweep with file:line grounding), security audit appendix (`docs/security-audit-2026-08-12.md` §Remediation status).
**Execution model:** standard repo orchestration — Fable decomposes/reviews, opus agents implement; no third-party skill packs. Every SQL change goes through adversarial review (standing repo rule). Subagents never run git state-changing commands.

---

## Merged findings ledger

| # | Source | Finding | Lands in |
|---|--------|---------|----------|
| F1 | Senior eng | 2FA must be enforced (not optional) | Phase 1 |
| F2 | Senior eng | 12-hour session cap — users re-authenticate every 12h | Phase 1 |
| F3 | Senior eng | Client share link: audit what the served HTML/JS exposes | Phase 2 |
| F4 | Senior eng | Scripted backup + restore for DR / business continuity | Phase 3 |
| F5 | Senior eng | Interval-based DB state logging alongside backups | Phase 3 |
| F6 | Senior eng | Sibling apps under subdomains (timetracking.matrixportal.io, equipment-register.matrixportal.io) | Phase 4 |
| F7 | Senior eng | Process READMEs so other engineers can run these systems | Phase 5 |
| A1 | 27001 assessment | Migration teardown due ~2026-08-31, zero completion evidence (old keys, DB passwords, session tokens, PII dump folder) | Phase 0 |
| A2 | 27001 assessment | No evidence backups/PITR enabled on ntrg; DEPLOYMENT_CHECKLIST backup boxes unchecked | Phase 0 + 3 |
| A3 | Audit M2 | No RLS references `aal2` — password-only session bypasses 2FA at the API | Phase 1 |
| A4 | Audit gap | `admin-reset-2fa` + `manage-backup-codes` invoked by client, source absent from repo — unreviewed account-takeover surface | Phase 1 (prerequisite) |
| A5 | Audit L3 | GoTrue server-side rate limits never verified (client limiter is cosmetic) | Phase 1 (same auth-config session) |
| A6 | Audit M8 | Retention purge cron commented out — log PII retained indefinitely; 730d-vs-3y window drift | Phase 3 |
| A7 | Audit M12 | Effective RLS policy set not provable from source — only a live `pg_policies` dump proves it | Phase 3 (state logging solves this continuously) |
| A8 | Audit L1 | Sessions in localStorage (accepted with CSP) — also blocks cross-subdomain SSO | Phase 4 (cookie migration is the SSO enabler) |
| A9 | 27001 assessment | Breach register has zero entries incl. the real 2026-07-28 incident; supplier record wrong ("no other processors" while Vercel/Resend/GitLab/Google in use; Supabase DPA uncountersigned); compliance docs full of placeholders | Phase 5 |
| A10 | Audit residuals | Avatars public bucket (M11), npm major bumps (H6 tail), role smoke tests, org_admin approval defect, 4 stray dashboard edge fns | Phases 2/5 |

---

## Phase 0 — Deadline-bound ops (THIS WEEK, before ~2026-08-31)

Live-ops work: owner + main loop, not delegable to agents (provider dashboards, credentials).

### P0.1 Migration teardown
The 7-item checklist currently lives only in `docs/Engineering Log.md:31` (the runbook it claims to live in has just a 3-line Rollback note — fix that doc bug as part of this task by copying the checklist into the runbook):
1. Delete old provider keys at Resend + Google AI Studio (this also completes the audit's key-rotation item).
2. Delete dry-run project `oxzteqqrhggdodcnngzn`.
3. Pause (then later delete) old project `cngschckqhfpwjcvsbad`.
4. Re-reset ALL DB passwords (they transited chat during the migration session).
5. Revoke the two session tokens (Management API owner token, Vercel REST token).
6. Delete `C:\Users\jonas\supabase-migration` (production PII + password hashes) and empty the recycle bin.
7. Raise ntrg global storage upload limit, then re-add 100 MB per-file caps on `project-files` / `scan-data`.

**Verification:** each item ticked with evidence in the Engineering Log; runbook updated to carry the checklist.

### P0.2 Platform backups on ntrg
- Confirm project plan tier; enable/confirm **daily automated backups** in the dashboard.
- **DECIDED 2026-08-26 (owner):** daily backups, no PITR add-on — revisit only if a client contract ever demands RPO < 24h. Predicated on Phase 3's weekly logical dumps + state ledger landing.
- Record the resulting configuration in the deployment checklist (tick the three backup boxes as they become true — the third box, "document recovery steps", is delivered by P3.2).

**Verification:** dashboard backup config captured (screenshot or Management API read) and recorded in `docs/DEPLOYMENT_CHECKLIST.md`.

---

## Phase 1 — Auth hardening: mandatory 2FA + 12-hour sessions (F1, F2, A3, A4, A5)

**Ordering is load-bearing:** P1.1 → P1.2 → P1.3. Enforcing `aal2` at the data layer before every account is enrolled hard-locks non-enrolled users out of their data; enforcing enrollment before the admin reset path is reviewed leaves no recovery route for lost authenticators.

### P1.1 Recover and review the two missing 2FA edge functions (prerequisite)
- `admin-reset-2fa` and `manage-backup-codes` are called by the client (`src/auth/auth-manager.ts:238`, `src/services/two-factor-service.ts`) but absent from `supabase/functions/`. Pull the deployed source from ntrg (`supabase functions download`), review, bring under version control, redeploy from repo.
- **Design constraints:** reset must be role-rank gated via `_shared/role-rank.ts` (admin+ only, strictly-greater so peers can't reset peers); backup codes hashed at rest; every reset writes an activity-log event (it's an account-takeover-shaped action).
- **Files in scope:** `supabase/functions/admin-reset-2fa/`, `supabase/functions/manage-backup-codes/`, `supabase/functions/_shared/`.
- **Verification:** code review against the role-rank pattern; deploy + smoke test (admin resets a test account, non-admin gets 403); `npm run test`.

### P1.2 Mandatory enrollment rollout
- Client gate: route any signed-in user with **no verified TOTP factor** into `TwoFactorSetupWizard` with no path to the app. *(As shipped: implemented as the new `RequireTwoFactorEnrolled` component — exploration found the legacy `Require2FA` was dead code never mounted by App.tsx; it was deleted 2026-08-27.)*
- **DECIDED 2026-08-26 (owner): immediate hard gate for ALL roles — no grace period.** Every signed-in user without a verified TOTP factor is routed into enrollment and cannot reach the app. Consequence: P1.3's aal2 migration can follow as soon as live factor counts confirm full enrollment.
- **Files in scope:** `src/components/auth/Require2FA.tsx`, `src/contexts/AuthContext.tsx`, `src/services/two-factor-service.ts`, `src/components/two-factor/`, login flow.
- **Verification:** `npm run build && npm run test`; manual smoke as each of the 6 roles (this also finally executes the audit's outstanding role-smoke-test item).

### P1.3 Data-layer enforcement — closes audit M2
- One migration adding **restrictive** policies on PII/sensitive tables using the canonical Supabase pattern ([MFA via RLS](https://supabase.com/blog/mfa-auth-via-rls), [MFA docs](https://supabase.com/docs/guides/auth/auth-mfa)):
  ```sql
  create policy "Enforce MFA" on <table>
    as restrictive to authenticated
    using ( (select auth.jwt()->>'aal') = 'aal2' );
  ```
- Target tables: `profiles`, `employee_competencies`, `competency_documents`, `documents` + revisions, `activity_log`, `organizations`, `permission_requests`, `account_requests`, inspection tables — final list settled at design review of the migration.
- **Deploy only after live factor counts confirm every active user has a verified TOTP factor** (rollout is immediate for all roles, so this should be within days). The created-after-cutoff variant remains available if stragglers need a window.
- **Known gotchas to document in the migration header:** dashboard user-impersonation defaults to aal1 and will return zero rows on these tables (expected, not a bug); restrictive policies layer on top of the existing permissive ones (nothing widens); `(select …)` wrapper for RLS performance; service-role/edge functions are unaffected (they bypass RLS).
- **Verification:** adversarial SQL review (mandatory per repo scar history); manual probes with an aal1 vs aal2 session against a PII table; full role smoke.

### P1.4 12-hour session cap — closes F2, executes A5 in the same sitting
- Set **Time-box user sessions = 12h** in ntrg Auth settings (Pro-plan feature — [Supabase session docs](https://supabase.com/docs/guides/auth/sessions)); push via Management API like the cutover auth-config (SMTP-first ordering scar applies to that API).
- **Honest semantics to record:** the timebox is enforced at the next token refresh, so effective max session ≈ 12h + JWT TTL (~1h). It forces re-login every ~12h; it is not a hard instant kill.
- ⚠ **OWNER DECISION:** additionally set an inactivity timeout? The current `SESSION_CONFIG` in `src/config/security.ts` *declares* a 30-min timeout that nothing enforces server-side. Recommendation: timebox 12h only for now (matches the ask); align or delete the dead SESSION_CONFIG constants so the code stops claiming a control that doesn't exist.
- **Client UX — data-loss guard (required in the same change):** a forced logout mid-modeling-session can eat unsaved vessel work. AuthContext must handle refresh-failure with a clean "session expired, sign in again" screen (not a crash), and the modeler needs a pre-expiry warning (~30 min before, computed from sign-in time) plus its existing unsaved-changes prompt wired to the expiry path.
- While in the Auth settings: **verify GoTrue server-side rate limits and minimum password length** (audit L3 — the client-side limiter is cosmetic; this makes the real control confirmed-configured).
- **Files in scope:** `src/contexts/AuthContext.tsx`, `src/lib/session-manager.ts`, `src/config/security.ts`, modeler save-prompt wiring.
- **Verification:** Management API GET showing the timebox value; forced-expiry manual test (revoke session server-side, observe clean client behavior); `npm run build && npm run test`.

---

## Phase 2 — Client share-link exposure review (F3, part of A10)

### P2.1 Exposure investigation (opus agent, read-only)
Enumerate everything an **unauthenticated visitor with a share link** receives, and write it up as a short report in `docs/plans/`:
- `dist/` inventory of the share route's network waterfall: index.html, entry chunk, share chunk, CSS — grep the actual built bytes for org names, emails, internal hostnames, tokens beyond the (public-by-design) anon key.
- Confirm: sourcemaps absent in prod, console stripped, no `.map` files deployed.
- Bundle content: manifest fields shipped to the client (vessel names are intended; verify no org identifiers/internal IDs beyond what the page displays; rect `note`/`techniqueOther` stripping is already test-pinned — confirm the test still covers the full field list).
- Response headers on `/share/:token`: CSP applies, and **add `X-Robots-Tag: noindex` for `/share/*`** (share links must never end up in a search index).
- Edge function behavior: byte-identical 404 for dead/revoked/expired already verified — re-probe post-deploy.
- The **known documented limit**: the SPA entry chunk loads on every route and contains auth code. Quantify what that actually exposes (code, not data — but confirm).

### P2.2 Fixes from the report
- ⚠ **OWNER DECISION (after report):** if entry-chunk exposure is deemed a problem, implement the documented fix — a **separate Vite HTML entry point** for `/share/*`, which removes all app/auth code from the anonymous surface. This is the only change that alters that invariant; `verify:share-chunk` already guards everything short of it.
- Close the outstanding dashboard residual while here: confirm no `anon` grants exist on `client_shares` tables beyond design.
- **Verification:** `npm run build && npm run verify:share-chunk`; curl of live headers; exposure report committed.

---

## Phase 3 — DR/BC: scripted backup + restore, interval state logging (F4, F5, A2, A6, A7)

Design stance: **platform backups (P0.2) are primary; scripted logical dumps are secondary/off-platform; the state ledger is drift-detection and audit evidence.** GitLab CI deliberately holds no Supabase credentials — automation runs from the owner machine via Task Scheduler, keeping the blast radius unchanged.

### P3.1 Backup script
- `scripts/db-backup.ps1`: wraps the migration runbook's proven 5-dump sequence (`supabase db dump` roles/schema/data/history-DDL/history-data — the 5th is required or migration history restores empty) + storage sync (`rclone --checksum` over the S3 endpoints) + a manifest (per-table row counts, bucket object counts, sha256 of each artifact).
- Output to an **encrypted archive outside the repo and outside OneDrive** (PII + password hashes — same handling rule as the migration dumps). Retention: keep last 4 weekly.
- Schedule weekly via Windows Task Scheduler.
- **Scars to honor:** never write `.env` via `Out-File` (BOM breaks the CLI); PS5.1 `[string]` cast before `ConvertTo-Json`.
- **Verification:** one real run producing a manifest whose counts match live; script committed.

### P3.2 Restore script + runbook
- `scripts/db-restore.ps1` + `docs/processes/disaster-recovery.md`: dockerized `postgres:17` psql, `--single-transaction --ON_ERROR_STOP`, `session_replication_role = replica` between schema and data, **storage-policy catalog regeneration step included** (storage policies do NOT survive dumps — 0/33 in the dry run; the regen SQL is in the migration runbook), verification-gate queries at the end.
- This document *is* the third unchecked box in the deployment checklist ("Document backup recovery steps").

### P3.3 Interval DB state logging — F5, and continuous closure of M12 + M8
- New migration: `db_state_snapshots` table + a **nightly pg_cron job in pure SQL** (no HTTP call — sidesteps the silent-401 cron scar entirely) capturing: per-table row counts, `pg_policies` count **and an md5 of the aggregated policy definitions** (RLS drift becomes visible and historically provable — the continuous answer to audit M12), storage object counts per bucket, migration-ledger tail.
- RLS on the snapshot table: super_admin read, no client writes (cron writes as postgres).
- **Same migration schedules `scheduled_purge_activity_logs`** (closes M8 — the function exists, only the schedule was commented out). ⚠ **OWNER DECISION:** retention window — recommend 730 days (the activity-log migration's value) and amend `database/data-retention.sql`'s 3-year figure to match, single-sourcing the window.
- **Verification:** adversarial SQL review; `cron.job` shows both jobs; first snapshot row present next morning; `supabase migration list` local == remote.

### P3.4 Restore test (the DR evidence)
- Execute P3.2 against a real P3.1 dump into local docker (or a scratch project), diff the manifest, record the result in `docs/processes/disaster-recovery.md` with date + outcome. This converts the migration dry-run's one-off proof into a repeatable, evidenced DR test — the artifact an auditor (and the senior engineer) actually asks for.

---

## Phase 4 — Multi-app platform under matrixportal.io subdomains (F6, A8)

**Design-first: this phase's deliverable is a decision document + a pilot, not a big-bang build.** Produce `docs/plans/2026-XX-multi-app-platform-design.md` covering:

1. **Inventory** — ⚠ **OWNER INPUT:** which projects are candidates (timetracking, equipment register — where does each live today, what stack, what data).
2. **Auth/SSO — the pivotal decision.** localStorage sessions are **per-origin**: subdomains do NOT share a session today. Moving to cookie-based session storage with `Domain=.matrixportal.io` enables single sign-on across all apps **and closes audit L1 (localStorage) in the same stroke** — these must be one workstream, done here, not piecemeal in Phase 1. Honest note: with client-side supabase-js the cookie can't be HttpOnly; the win is SSO + tighter scoping, not XSS-immunity (CSP remains the XSS control).
3. **One Supabase project, shared** (recommendation): reuse `profiles`/`organizations`/roles/RLS and the tab-visibility model; per-app tables with their own RLS. A second project would fork identity and double every compliance surface.
4. **Repo/deploy shape** (recommendation): keep this repo as-is; new apps as separate Vercel projects on their own subdomains, sharing a published package for auth glue + design tokens. Revisit monorepo only if shared-package churn proves painful.
5. **Standing constraints:** HSTS `includeSubDomains; preload` is **already live and irreversible** — every subdomain must serve HTTPS from day one (Vercel does); each app needs its own `vercel.json` CSP; the `ALLOWED_ORIGINS` edge-function secret must gain each new origin.
6. **Pilot:** one app (suggest timetracking) end-to-end — DNS, Vercel project, shared auth cookie, one RLS-scoped table — before generalizing.

---

## Phase 5 — Process READMEs + the ISMS paper layer (F7, A9, A10)

### P5.1 `docs/processes/` — human-engineer-facing runbooks
Drafted by opus agents from existing material (migration runbook, deployment checklist, audit doc, Engineering Log scars); Fable reviews each for accuracy against source. Uniform shape: purpose → prerequisites → steps → verification → escalation. Set:
- `local-dev-setup.md` · `deploy.md` (frontend + edge fns + migrations, incl. the `--include-all` ordering scar and the `.env` BOM scar) · `auth-and-roles.md` (6-role model, route guards, RLS helpers, 2FA once Phase 1 lands) · `backup-and-restore.md` (from P3) · `disaster-recovery.md` (P3.2) · `incident-response.md` (links the breach plan + register, names the actual first steps) · `client-share-links.md` (publish/revoke/delete/prune lifecycle) · `cron-jobs.md` (what runs, the 401 scar, secret rotation in BOTH places) · `secrets-and-rotation.md`.
- **Verification:** each README spot-checked by executing at least its verification section; `npm run lint` unaffected (docs only).

### P5.2 ISMS artifacts (the Stage-1 gap)
- **Breach register:** create `docs/breach-register.md` on the 13-field schema already defined in `data-breach-response-plan.md` §4; **enter the 2026-07-28 competency incident** with severity classification and the ICO / data-subject notification decisions recorded (even if the decision is "no notification required — human error, single record, corrected same day", it must be *recorded*).
- **Supplier record:** countersign the Supabase DPA (owner action); rewrite `docs/third-party-dpa.md` to list **Vercel, Resend, GitLab, GitHub, Google (Gemini)** with role, data touched, and DPA/terms link; delete the now-false "No Other Third-Party Processors" claim; state **eu-west-2** as the hosting region in the compliance docs (currently only the engineering runbook names it).
- **Doc refresh:** fill the `[YOUR COMPANY NAME]`-class placeholders across ropa/sar/dpo/LIA/training docs; update the DPIA to 6 roles + named assessor; get `data-retention-schedule.md` out of Draft with the P3.3 window decision.
- **Thin spine:** a 2-page information-security policy; convert the audit severity register into a living `docs/risk-register.md` (owner, treatment, acceptance status per item — the audit's "accepted" residuals become *signed* acceptances); Statement of Applicability only if certification is actually pursued (⚠ owner: is certification a goal, or is audit-readiness the goal?).

### P5.3 Scheduled audit residuals (backlog, not blocking)
Avatars signed-URL refactor (M11 — 4-step plan already written in migration `20260812122000`); npm semver-major bumps (nanoid/exceljs/react-router/uuid) with regression runs; org_admin `approve_permission_request` defect (⚠ decision: fix trigger interaction or restrict approvals to admin+); retire the 4 dashboard-stray edge functions after owner confirmation; the remaining dashboard SQL checks (NULL-org managers, profiles SELECT shape).

---

## Sequencing

```
Week 1 (now)      P0.1 teardown + P0.2 backups  [hard deadline ~08-31]
                  P1.1 recover 2FA fns  ∥  P2.1 exposure investigation   (independent, parallel opus tasks)
Week 2            P1.2 enrollment gate live (immediate, all roles — owner decision 2026-08-26)
                  P3.1–P3.3 backup/restore scripts + state-logging migration (parallel)
Week 3–4          P1.3 aal2 migration (once enrollment confirmed complete) → P1.4 timebox + L3 verify
                  P2.2 share fixes  ·  P3.4 restore test
Then              P4 design doc + pilot (owner inventory first)
Continuous        P5.1 READMEs as each phase lands its process · P5.2 ISMS docs · P5.3 backlog
```

**Dependency spine:** P1.1 → P1.2 → P1.3 (recovery path before enrollment before enforcement). P0.2 → P3.4. Cookie-session work belongs to P4 only. Everything else is parallelizable.

## Risks & interactions (the reasons behind the ordering)

1. **aal2 before full enrollment = org-wide data lockout.** The restrictive policy denies every aal1 session; enforcement date must trail the last enrollment.
2. **12h forced logout vs unsaved modeler work.** The expiry-warning + save-prompt UX ships in the same change as the timebox, or field engineers lose vessel edits at hour 12.
3. **Timebox semantics:** enforced at refresh — effective cap ≈ 12h + JWT TTL. State it honestly in the process doc; don't promise a hard 12h.
4. **Dashboard impersonation goes dark under aal2 policies** (returns zero rows at aal1) — expected behavior, must be documented or it will be re-reported as a bug.
5. **HSTS preload is irreversible** and already covers all subdomains — a constraint on Phase 4, not a choice.
6. **Backup automation stays off CI** — GitLab holding no Supabase credentials is a deliberate control; the scheduled task keeps it that way.
7. **Every migration in this plan** (P1.3, P3.3) goes through adversarial SQL review — this repo's audit history shows that review catching deployment-bricking defects twice.

## Execution status (2026-08-26, same-day)

**Phase 1 — substantially executed:**
- **P1.1 DONE + DEPLOYED, premise corrected:** the two "missing" 2FA functions had **never existed anywhere** (not on ntrg, not on the old project, never in git history) — the admin "Reset 2FA" button had 404'd in production for its entire life, backup codes had no backing store, and authenticator loss was a hard permanent lockout. Both functions were authored from scratch (role-rank + no-self-reset gating; hashed single-use codes, batch-salt PBKDF2, aal2-gated minting), adversarially reviewed (verdicts: migration SHIP; function DO-NOT-SHIP until the delete-then-insert lockout window was inverted to insert-first; deployed admin-reset needs no fix), then deployed: migration `20260826120000_two_factor_backup_codes` pushed, `admin-reset-2fa` and `manage-backup-codes` live and 401-probed.
- **Recovery semantics (owner-ratified design ruling):** successful backup-code redemption is a **self-service 2FA reset** — server deletes all TOTP factors then consumes the whole code set (factors-first ordering; a failure consumes nothing). Rationale: the app derives 2FA-cleared solely from the JWT `aal` claim, which an edge function cannot mint, so "mark used and return success" was a proven dead end; reset composes with the enrollment gate (redeem → sign in → gate forces fresh enrollment → aal2 restored) and with the future P1.3 aal2 policies. Break-glass for super_admin (nothing outranks it, self-reset refused): Supabase dashboard factor deletion — document in the incident-response process doc.
- **P1.2 + P1.2b DONE in working tree (not yet shipped to users):** `RequireTwoFactorEnrolled` gate wraps every protected route (immediate, all roles); wizard now issues backup codes at enrollment (acknowledge-before-done, 409/failure paths non-dead-end); unverified-factor cleanup before enroll; `TwoFactorChallenge` on login with the "use a backup code" recovery path; `FunctionsHttpError` scar fixed in the service and in `adminReset2FA`. Runtime-verified in headless Edge (6/6 scenarios: gate blocks with zero app-shell leak, spinner covers the whole factors-query window, sign-out escape reachable after fixup, verified pass-through, share-page F-20 = zero /auth/v1/ requests, evidenced by captured network log). **The gate reaches users only when the frontend deploys (commit + merge to master → Vercel) — owner's call on timing.**
- **P1.3 still pending:** aal2 restrictive-policy migration waits on confirmed full enrollment after the frontend ships.
- **P1.4 CLIENT HALF DONE in working tree; SERVER SETTING NOT SET.** The graceful-expiry UX ships ahead of the switch so the switch is never the first thing users meet: a server-ended session now redirects to `/login?reason=session-expired` (hard navigation, with a sessionStorage fallback for when a dirty scan viewer's `beforeunload` cancels it) and the login page explains itself; a dismissible banner warns at 11.5h, tracked from a `localStorage` session start that survives reloads (`src/lib/session-timebox.ts`, `SessionExpiryWarningBanner` in LayoutNew). `SESSION_TIMEBOX` in `src/config/security.ts` drives ONLY that warning and is documented as following the server value — the dead 30-minute `SESSION_CONFIG` block it replaces had zero consumers and was deleted. Deliberate sign-out is deliberately silent. Still to do: set **Time-box user sessions = 12h** on ntrg (Management API), verify GoTrue rate limits + minimum password length (L3), and run the forced-expiry manual test against a server-revoked session.
- **Scars recorded this execution:** auth-js 2.78 `listFactors` buckets only *verified* factors into `data.totp` — everything lives in `data.all`; mocks that invent `data.totp` shapes hide dead code (regression-tested now, selection rules single-sourced in `src/services/mfa-factor-shape.ts`). `src/styles/reset.css` strips all button styling — any bare `<button>` renders invisible; design-system classes are load-bearing. `btn--secondary` on light panels reproduces white-on-light (components-new.css hardcodes white text).

**Phase 2 — done:** exposure report at `docs/plans/2026-08-26-share-exposure-report.md` (verdict: clean; F-16 localhost-CSP finding REFUTED — Companion app production ports; F-15 devtools gate applied; `X-Robots-Tag: noindex` added to vercel.json for /share/*, live-probe pending next deploy). Separate-HTML-entry adopted as platform/perf work, queued behind Phase 1.

**Phase 0 — still owner-blocked:** teardown (~08-31) and backup confirmation remain manual dashboard/provider actions. Decisions recorded: immediate all-roles 2FA rollout; daily backups, no PITR.

**Backups UNPINNED — destination decided (senior engineer via owner, 2026-08-27):** off-site copies go to **partitioned prefixes in an S3 bucket in the owner's AWS account**, not local disk. Design: date-partitioned keys (`ndt-backups/db/year=/month=/day=/`) for the client-side-AES-256-encrypted dump archives + manifests; an rclone mirror prefix for Supabase storage bytes (Supabase S3 endpoint → AWS S3 directly); **write-only IAM credentials** (Put/List, no Delete — a compromised backup host cannot destroy history), retention enforced server-side by S3 lifecycle (Deep Archive at 30d, expire at 90d ≈ 13 weekly copies), bucket versioning on, separate offline read credentials for restore. Local disk demotes to a working cache (keep 1-2 sets). Owner console tasks: create bucket + the two IAM users from the provided policy JSON, drop keys into the secrets file. The platform-backup dashboard confirmation (P0.2) and the P3.4 restore test remain on the owner queue.

**Deployment decision (owner, 2026-08-26 late):** frontend does NOT ship yet. When it ships, it goes to a **dev branch first** (Vercel per-branch preview deployment) for verification before any merge to master reaches production. Note for the executor: GitLab CI's deploy stage is gated on a branch named `main`, which does not exist — production frontend deploys happen via Vercel's own git integration, so the dev-branch push produces a preview URL and only the master merge goes live. The 12h session timebox (P1.4 server side) and the aal2 migration (P1.3) both key off the production ship, not the preview.

**Live-schema finding (2026-08-27, CLI schema dump of production):** the public schema holds **44 tables**, including a set absent from every current design discussion and NOT covered by the parked aal2 migration's 31-table policed set: `assets`, `shared_assets`, `asset_access_requests`, `strakes`, `sync_metadata`, `inspections`, `scans`, `vessels`, `vessel_images` — plausibly Data-Hub-era/legacy (Data Hub was removed 2026-02-06; a stray `transfer-asset` edge fn existed on the old project). **RESOLVED 2026-08-27** (`docs/plans/2026-08-27-legacy-table-investigation.md`): all nine are DORMANT Data-Hub-era leftovers — zero live code references, one self-contained FK family, no anon exposure (all policies NULL-propagate closed), and the aal2 policed set has NO accidental omissions. Disposition: **drop all nine plus their legacy SECURITY DEFINER RPCs** (fifteen functions — the authoring pass found a TENTH reader, `can_access_vessel(text)`, anon-granted with no search_path pin; RPCs first — `get_accessible_assets` RETURNS SETOF assets is a hard dependency), gated on zero-row confirmation. **GATE RUN 2026-08-28: FAILED — six of nine tables hold real data** (assets 18, vessels 14, inspections 3, strakes 12, scans 42, vessel_images 3 = 92 rows of Data-Hub-era records; asset_access_requests/shared_assets/sync_metadata are empty). The parked migration's abort-if-rows backstop would have refused to apply — working as designed. **DROP EXECUTED 2026-08-31** (owner chose (a) archive-then-drop 2026-08-28; explicit push authorization 2026-08-31): full archive sealed first (`C:\Users\jonas\ndt-backups\legacy-data-hub-archive-2026-08-28\`, sha256 manifest + apply-log.txt), then migration `20260831120000_legacy_data_hub_drop.sql` applied — twice adversarially reviewed (final review caught BLOCKER-1: four live `storage.objects` policies depended on `assets`/`shared_assets` and would have failed the un-CASCADEd drop; fixed by Phase 1.5 narrowing them to their own-org branch, provably access-neutral at `shared_assets`=0). Post-apply verified: public tables 44→35, all 15 legacy definer functions gone, four storage policies recreated referencing nothing dropped, every current-era table present. Remaining from this thread: the 107 orphaned storage objects (inventory in the archive README — separate owner-timed cleanup) and retiring the five orphaned `database/*.sql` files that defined the family. GDPR deletion functions already tolerate the missing relations (proven by an existing phantom they skip today). **The un-parking review's real added step: audit every SECURITY DEFINER RPC that reads a POLICED table** — definer RPCs check role, not aal, and run as owner, so they sit outside the aal2 gate by construction (the parked migration's own line 361 notes this). Interim cheap hardening if the drop slips: `REVOKE ... FROM anon` on the eight RPCs. Also found: `vessel-model-service.ts` references nonexistent `vessel_scan_placements` (dead hooks, harmless — cleanup backlog); the stale CLAUDE.md key-tables line that caused the legacy names to look live is corrected.

**Deferred/backlog added this execution:** shared `Modal` title contrast (needs live diagnosis, don't blind-edit shared UI); `SECURITY DEFINER` RPC for atomic batch replace (gold version, needs migration); F-17 object-src verification; F-07 contact-email literals; share-page `ndt_admin_configuration` localStorage write; dev StrictMode double-counts share views (prod unaffected); live smoke items — TOTP replay window on regenerate, refresh-token-chain perturbation, role smoke across 6 roles.

## References
- [Supabase — User sessions (time-box / inactivity / single session)](https://supabase.com/docs/guides/auth/sessions)
- [Supabase — MFA guide](https://supabase.com/docs/guides/auth/auth-mfa) · [MFA enforcement via RLS](https://supabase.com/blog/mfa-auth-via-rls)
- `docs/security-audit-2026-08-12.md` (findings + remediation appendix) · `docs/plans/2026-08-17-supabase-project-migration-runbook.md` (proven dump/restore sequence)
