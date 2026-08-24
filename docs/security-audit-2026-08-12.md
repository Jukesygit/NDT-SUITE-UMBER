# NDT Suite — Security & GDPR Audit

**Date:** 2026-08-12
**Scope:** Full-codebase security review with a GDPR emphasis on **personnel records** and **login permissions**, plus all adjacent attack surface (RLS/multi-tenant isolation, edge functions, auth/sessions, storage/PII, secrets/config, dependencies, GDPR data lifecycle).
**Method:** Six specialised review agents over the source tree, followed by an independent adversarial-verification pass that re-checked every Critical/High finding against source (file:line evidence) and resolved two severity-deciding questions. All findings below are **source-verified**, not speculative. Items that cannot be proven from source (live-project dashboard settings) are called out explicitly.
**Status of this document:** assessment + prioritised remediation plan. No code was changed as part of this audit.

---

## Executive summary

The application has a **genuinely strong security foundation** that has been hardened across many 2026 security migrations: row-level security is enabled on every PII/tenant table, role self-escalation is blocked by a database trigger, the signup path is safe, `created_by` is tamper-proof, password-reset codes are locked to the service role, no secrets are committed, the client ships only the anon key, there is a real privacy-policy + compliance-doc suite (DPIA, ROPA, breach plan), and CI runs blocking secret/SAST scans.

However, the audit found **2 Critical, 7 High, and 12 Medium** issues. The dominant real-world risks cluster in four areas:

1. **A live API key is handed to every logged-in user** (`gemini-proxy` does not proxy — it vends the raw `GEMINI_API_KEY`). Requires key rotation now.
2. **Multi-tenant isolation has holes at the role and storage layers** — the `manager` role reads *every* organisation's personnel PII; controlled documents in storage are readable across tenants; `org_admin` can read/tamper other orgs' competency history and comments.
3. **GDPR right-to-erasure is incomplete** — deleting an account leaves the person's certificate/document/avatar files in Storage, and the deletion routine reports success even on partial failure.
4. **A stored XSS in vessel annotations** persists into org-shared model data and executes in any colleague's browser (including admins), with **no production CSP** to contain it and long-lived session tokens in localStorage to steal.

None of these is a reason for alarm about the architecture — the bones are good — but several are cross-tenant PII exposures and GDPR-material gaps that should be closed before the platform can be called "bulletproof." A prioritised remediation roadmap is at the end.

**Overall risk posture:** Moderate. The core login/identity controls are sound; residual risk is concentrated in over-broad privileged roles, storage-layer tenant isolation, secret handling in one edge function, and erasure completeness.

---

## Severity register

| # | Severity | Finding | Area |
|---|----------|---------|------|
| C1 | **Critical** | `gemini-proxy` returns the live `GEMINI_API_KEY` to any authenticated user (incl. `viewer`) | Edge / Secrets |
| C2 | **Critical** | `manager` role reads ALL organisations' personnel PII (profiles, competencies, certificate docs) — no org scoping; `manager` is a normally-assignable role | RLS / Multi-tenant |
| H1 | High | Controlled documents in Storage readable across tenants (storage SELECT policy has no org scope) | Storage / Multi-tenant |
| H2 | High | `vessel-annotations` is a public bucket with `bucket_id`-only RLS + no MIME limit (cross-tenant read/write/delete + stored-XSS/malware vector) | Storage |
| H3 | High | Stored DOM-XSS in vessel annotation labels (unescaped user fields → `innerHTML`), persisted + org-shared | Frontend / XSS |
| H4 | High | GDPR right-to-erasure never deletes Storage objects — certificate/document/avatar PII orphaned after account deletion | GDPR |
| H5 | High | `org_admin` cross-org read of competency history + update/delete of any org's competency comments | RLS / Multi-tenant |
| H6 | High | `npm audit`: 9 High advisories (all dev/build-chain, all fixable; not in the shipped browser bundle) | Dependencies |
| M1 | Medium | No production CSP / HSTS / security headers on Vercel (they exist only in `vite dev`/`preview`) | Config |
| M2 | Medium | 2FA/AAL2 not enforced at the data layer — an AAL1 (password-only) session can hit protected tables directly | Auth |
| M3 | Medium | Edge privilege-boundary gaps: `admin` can delete a `super_admin`, change a `super_admin`'s login email (→ takeover), and mint other `admin`s | Edge |
| M4 | Medium | `sync-users` trusts client-controllable `user_metadata.role` when recreating a profile (escalation path) | Edge |
| M5 | Medium | `send-email` is an authenticated arbitrary-recipient mail relay from the brand domain (phishing/spam + header injection) | Edge |
| M6 | Medium | GDPR erasure **and** export both omit `documents` / `competency_documents` tables + storage | GDPR |
| M7 | Medium | Account deletion swallows per-table errors and returns success (silent partial erasure, no atomicity) | GDPR |
| M8 | Medium | Retention-purge functions exist but pg_cron schedules are commented out — PII may be retained indefinitely | GDPR |
| M9 | Medium | Password-reset user-enumeration oracle (429-vs-200 + response timing) | Edge |
| M10 | Medium | Any authenticated user (incl. `viewer`) can self-create/self-edit their own competency records — no verified/approved gate | RLS / Integrity |
| M11 | Medium | `avatars` & `vessel-images` bucket public-flag is contradicted across scripts; `avatars` accepts PDF "for certificates" (latent world-readable-cert vector) | Storage |
| M12 | Medium | Non-reproducible migration pipeline (empty baseline + DROP-by-name) — effective live policy set not provable from source | Assurance |
| L1 | Low | Session tokens (incl. refresh) in `localStorage` — XSS yields full session theft | Auth |
| L2 | Low | Logout uses `scope:'local'` — refresh token not server-revoked | Auth |
| L3 | Low | Client-only login rate-limiting + client-only password-strength enforcement (real enforcement depends on GoTrue config) | Auth |
| L4 | Low | Profile `role`/`organization_id` guarded on UPDATE (trigger) but not INSERT | RLS |
| L5 | Low | Restore scripts (`restore-rls-from-csv-export.sql`, `pii-lockdown-restore.sql`) re-introduce weaker/older policies (regression footgun) | Assurance |
| L6 | Low | Non-constant-time comparison of cron secret and reset code | Edge |
| L7 | Low | `submit-account-request` unthrottled + `organization_id` unvalidated; `approve-account-request` silently overwrites an existing account matching the email | Edge |
| L8 | Low | Upload validation gaps (content-type/size) on controlled-docs & avatar uploads; PII (recipient email) may reach Resend error logs | Edge / Storage |

**Audit gap:** two 2FA edge functions — `admin-reset-2fa` and `manage-backup-codes` — are invoked by the client but are **not present in the repository**, so their server-side authorization could not be reviewed. 2FA reset is a classic account-takeover surface and must be pulled into the repo and audited.

---

## Critical findings

### C1 — `gemini-proxy` vends the live Gemini API key to every authenticated user
**Location:** `supabase/functions/gemini-proxy/index.ts:24-35`; consumed at `src/components/VesselModeler/services/gemini-proxy.ts:40-52, 88-90`
**Verified:** The function gates on `requireAuth` (any authenticated user — `viewer` included; not `requireAdmin`), reads `Deno.env.get('GEMINI_API_KEY')`, and returns it in the JSON body. The client caches it and places it directly in the Gemini request URL (`...:generateContent?key=${apiKey}`). There is **no** server-side proxy of the actual model call — vending the key is the whole function.
**Impact:** Any logged-in account can extract a live Google Gemini API key (network tab, memory, or the outbound URL — query strings are widely logged). Unbounded off-platform billing/abuse; a single XSS (see H3) exfiltrates it silently. Violates the project's own non-negotiable "never return API keys to the client." The exposure persists until the key is rotated.
**Remediation:**
1. **Rotate `GEMINI_API_KEY` now** (assume compromised).
2. Convert `gemini-proxy` into a real proxy: accept the prompt/payload server-side, call Gemini from the edge function, return only the model output. Never return the key. If payload size/timeout was the original concern, stream the response from the edge function rather than exposing the key.

### C2 — `manager` role reads every organisation's personnel PII (cross-tenant)
**Location:** `supabase/migrations/20260408120000_add_super_admin_and_tab_visibility.sql:81-94` (profiles SELECT); `supabase/migrations/20260618120000_fix_super_admin_competency_access.sql:30-54` (employee_competencies SELECT); `supabase/migrations/20260728120000_competency_multi_documents.sql:55-85` (competency_documents SELECT)
**Verified:** The `manager` branch of each SELECT policy has **no `organization_id` predicate** (unlike the sibling `org_admin` branch). `manager` is a normal, labelled option in both the Create-User and Edit-User dropdowns ("Manager – Full access except Admin tools"), assignable by any global admin; additionally, a tenant `org_admin` can promote an in-org user to `manager` through `approve_permission_request` (`20260224120000_security_audit_remediation.sql:84-112`, no role allowlist).
**Impact:** Any `manager` reads **every** organisation's profiles (names, emails, personal fields), employee competencies, and uploaded **certificate documents** — a cross-tenant personal-data breach reachable within a customer's own normal admin workflow. GDPR Art. 5 data-minimisation / cross-controller exposure. (Honest limiter: an admin-tier actor must grant `manager`; a plain `viewer` cannot self-escalate.)
**Remediation:** Decide whether `manager` is a **vendor-internal** role or a **customer** role.
- If customer-facing: add `AND p.organization_id = <target>.organization_id` to the `manager` branch on all three tables (mirror the `org_admin` predicate).
- If vendor-internal only: gate `manager` behind the Matrix/SYSTEM-org check used for assets, remove it from tenant-facing role dropdowns, and add it to the `approve_permission_request` denylist so an org_admin can't grant it.
- Note the same over-broad `manager` was already de-scoped for the *activity log* (`20260626150000`), so this is an inconsistency, not intent.

---

## High findings

### H1 — Controlled documents readable across tenants (storage layer)
**Location:** policy `database/migrations/document-control-schema.sql:346-352` (effective; identical in the two restore scripts, no later override); upload path `src/services/document-control-service.ts:474`
**Verified:** The `storage.objects` SELECT policy for controlled documents checks only `bucket_id='documents' AND foldername[1]='controlled-documents'` — **no org join, no role check**. Upload path is `controlled-documents/<documentId>/...` with no org segment. No later migration scopes it.
**Impact:** Any authenticated user (any org) can mint a signed URL for **any** controlled document if they obtain its `documentId` (a UUID). Controlled documents include personnel procedures, signed reports, and quality records. The `documents` *table* is org-scoped, so foreign IDs aren't trivially listable in-app — which is the only thing keeping this from Critical — but it is a genuine cross-tenant IDOR.
**Remediation:** Add an org predicate to the SELECT policy — join `documents d ON d.id = (storage.foldername(name))[2]::uuid AND d.organization_id = auth_user_org_id()` — or embed the org id in the path (`controlled-documents/<orgId>/<documentId>/...`) and scope on `foldername[2]`.

### H2 — `vessel-annotations` public bucket with `bucket_id`-only RLS
**Location:** `database/annotation-storage-setup.sql:11-36`; `src/services/annotation-attachment-service.ts:23-27, 39`
**Verified:** Bucket created `public = true`, no `allowed_mime_types`, no `file_size_limit`. INSERT/SELECT/DELETE policies check only `bucket_id` — no owner/org/folder scope. Client uploads with `contentType` taken straight from `file.type` and serves via permanent `getPublicUrl`.
**Impact:** (a) Every annotation object is world-readable via a permanent public URL, no auth. (b) Any authenticated user can overwrite or delete another org's annotation objects (integrity/availability). (c) No MIME restriction + `file.type` passthrough lets a user store `text/html`/`image/svg+xml` served inline from the storage origin — stored-XSS/malware distribution.
**Remediation:** Set the bucket **private**, serve via `createSignedUrl`; scope INSERT/DELETE to the caller's org folder; add `allowed_mime_types` (images only) + `file_size_limit`; validate `file.type`/size client-side.

### H3 — Stored DOM-XSS in vessel annotation labels
**Location:** `src/components/VesselModeler/engine/annotation-labels.ts:158-172` (`el.innerHTML`); persisted via `engine/vessel-serialization-spec.ts:159,173,174` → `src/services/vessel-model-service.ts:84-113`; org-wide read RLS `database/scan-composite-schema.sql:133-142`
**Verified:** `config.name`, `config.restrictionNotes`, and `config.restrictionImage` (the latter into an `src="..."` attribute) are interpolated into `innerHTML` with **no escaping**, even though `escapeHtml` exists elsewhere in the repo. All three fields serialize into `vessel_models.config`, whose SELECT policy is **org-wide** (any authenticated user in the same org).
**Impact:** A payload authored by one user saves into shared model data and executes in **any same-org user's browser**, including managers/admins. Chained with L1 (session tokens in `localStorage`) and M1 (no production CSP), this is a realistic path to admin session theft / account takeover.
**Remediation:** Escape `name`/`restrictionNotes` with the existing `escapeHtml`; validate `restrictionImage` scheme (allow `https:` / `data:image/` only) and set it via `img.src`/`encodeURI` rather than string-built `innerHTML`. Ship a production CSP (M1) as defence-in-depth.

### H4 — GDPR right-to-erasure never deletes Storage objects
**Location:** `supabase/functions/delete-my-account/index.ts`, `supabase/functions/delete-user/index.ts` (no `storage.from().remove` anywhere in `supabase/functions/**`)
**Verified:** Both deletion functions delete/nullify DB rows and the auth user but perform **no** storage cleanup. The only storage-removal code lives in the per-competency edit path (`competency-mutations.ts`), which account deletion bypasses by bulk-deleting `employee_competencies` in SQL.
**Impact:** After a right-to-erasure request, the person's certificate/competency files (`documents/competency-documents/<userId>/...`) and avatar (`avatars/<userId>/...`) remain in Storage indefinitely. Article 17 erasure is incomplete — the exact concern that motivated this audit.
**Remediation:** Before deleting the auth user, enumerate and remove all objects under the user's folders and all objects referenced by `employee_competencies.document_url` / `competency_documents` / `documents` / `profiles.avatar_url`. Make erasure cover the same data the export covers (see M6).

### H5 — `org_admin` cross-org access to competency history + comments
**Location:** `supabase/migrations/20260618120000_fix_super_admin_competency_access.sql:128-138` (history SELECT), `:195-205` (comment UPDATE), `:209-219` (comment DELETE)
**Verified:** These three policies list `org_admin` in a flat role list with **no organisation predicate**, even though the same file correctly scopes `org_admin` to the target org for `employee_competencies` and for competency-comment SELECT/INSERT. No later migration fixes them.
**Impact:** An `org_admin` in Org A can read Org B's competency change history (cert types, dates, verifier identity) and **edit or delete any org's competency comments** — cross-tenant read + tamper of an audit-relevant field.
**Remediation:** Scope the `org_admin` branch to the subject's org on all three, matching the pattern already used elsewhere in the same file, e.g. `... AND role='org_admin' AND organization_id = (SELECT organization_id FROM profiles WHERE id = competency_history.user_id)`.

### H6 — Dependency advisories (dev/build chain)
**Location:** `package.json` / lockfile — `npm audit` reports **0 Critical / 9 High / 6 Moderate**, all with fixes available.
**Verified:** All 9 High are build/dev-toolchain packages (`vite`, `rollup`, `postcss`, `ws`, `brace-expansion`, `js-yaml`, `nanoid`, `picomatch`, `tmp`) — not in the shipped browser bundle. Risk is developer-machine / CI (malicious CSS/YAML/WS during build). The CI `npm audit` gate is scoped to `--omit=dev --audit-level=critical`, so these pass silently.
**Remediation:** Run `npm audit fix` (bump vite/rollup/postcss/ws et al.). Consider widening the CI audit gate to include high-severity dev advisories, or accept them explicitly.

---

## Medium findings (summary + remediation)

- **M1 — No production security headers.** CSP/HSTS/X-Frame-Options/X-Content-Type-Options exist only under `vite.config.js` `server.headers`/`preview.headers` (dev). `vercel.json` has only `rewrites`; no `public/_headers`. → Add a `headers` block to `vercel.json` mirroring the strict `preview.headers` CSP + HSTS; verify on `matrixportal.io`. (Also the only mitigation for H3.)
- **M2 — 2FA not enforced at the data layer.** No RLS policy references `aal2` (grep across all SQL is empty); policies key off `auth.uid()`/role/org only. An AAL1 (password-only) session can read/write protected tables directly via the API — 2FA is an app-side gate. → If 2FA is a security control (not just UX), require `(auth.jwt()->>'aal')='aal2'` on the most sensitive tables (personnel/admin/competency), or enforce AAL2 at the edge functions for privileged ops.
- **M3 — Role-hierarchy gaps in edge functions.** `delete-user` has only a self-delete guard, so an `admin` can delete a `super_admin`; `admin-update-email` lets an `admin` change a `super_admin`'s login email (`email_confirm:true`) → password-reset takeover; `create-user`/`bulk-create-users` let an `admin` mint other `admin`s. → Enforce a role rank: a caller may only act on users strictly below their own role; reserve actions on `super_admin` to `super_admin`.
- **M4 — `sync-users` trusts `user_metadata.role`.** `sync-users/index.ts:53-66` reads `metadata.role || 'viewer'` when recreating a missing profile; a user can set their own `user_metadata`. The `handle_new_user` trigger deliberately forces `viewer` — sync should too. → Force `role='viewer'` (or a trusted source) on sync-created profiles.
- **M5 — `send-email` arbitrary-recipient relay.** `send-email/index.ts` lets an `org_admin` send attacker-controlled HTML + arbitrary custom headers to any recipient from the verified brand domain — no allow-list, no cap, no rate limit. → Constrain recipients (internal/known or template allow-list), drop/whitelist the `headers` passthrough, add per-caller rate limiting.
- **M6 — Erasure & export omit `documents`/`competency_documents`.** Neither delete function references those tables; `gdpr-service.ts exportUserData` selects only profiles/competencies/history/activity_log/permission_requests. Contradicts the DPIA's "full self-service" claim. → Add both tables (+ storage) to both flows; make export a superset of deletion.
- **M7 — Deletion reports success on partial failure.** Every table op is wrapped in `try/catch → console.warn`; the function returns `{success:true}` as long as `auth.admin.deleteUser` succeeds, with no atomicity across ~26 ops. → Aggregate failures and fail loudly, or wrap in one transactional RPC; log which tables failed.
- **M8 — Retention purge not scheduled.** `data-retention.sql` and `20260626170000_activity_log_retention.sql` define purge functions but the `cron.schedule(...)` blocks are commented out. Project history shows a prior retention/reminder cron silently 401'd for months. → Confirm pg_cron jobs are enabled in the live project; add an ops check. Single-source the retention window (currently 3y vs 730d drift, finding L-adjacent).
- **M9 — Password-reset enumeration oracle.** `send-reset-code` returns a generic 200 for non-existent users but a `429` (and extra DB+HTTP latency) for existing users — two requests distinguish accounts. → Apply the rate-limit/response shape identically regardless of account existence; consider IP-scoped limiting to normalise timing.
- **M10 — Self-service competency editing.** RLS lets any user (incl. `viewer`) create/update their **own** `employee_competencies` (`user_id = auth.uid()`), with no verified/approved gate (`created_by` is server-set and cross-user forgery is blocked, so this is integrity, not confidentiality). → If self-service upload-for-review is intended, add a `verified`/`status` column only admins can set (enforced by trigger) so self-created rows are inert until verified; otherwise remove `user_id = auth.uid()` from the INSERT/UPDATE checks.
- **M11 — Public-bucket contradictions.** `avatars` and `vessel-images` are set `public=true` by create/restore scripts and `public=false` by the 2026-02 pen-test fix — the effective flag can't be resolved from files. `avatars` was widened to accept `application/pdf` "for certificates," so if it is public and a cert ever lands there, it's world-readable. (Confirmed: no current code writes certs to `avatars` — competency certs go to the private `documents` bucket — so this is *latent*.) → Confirm both buckets are **private** in the Supabase dashboard; remove `application/pdf` from `avatars` allowed types; remove the `TO public` avatars SELECT from the restore script.
- **M12 — Non-reproducible migration pipeline.** The baseline snapshot `20251104120414_remote_schema.sql` is empty (0 bytes); base tables/policies live only in hand-run `database/*.sql` scripts, and migrations `DROP POLICY IF EXISTS "<name>"` by exact name, so differently-named older policies survive and OR-widen. The effective live policy set can only be proven by querying production `pg_policies`. GDPR Art. 5(2) accountability gap. → Snapshot `SELECT * FROM pg_policies WHERE schemaname='public'` from prod, diff against expectations, delete stale duplicates, and capture a real baseline so the chain is self-contained.

---

## Low findings (summary)

- **L1 — Tokens in `localStorage`** (`src/supabase-client.ts:19-20`): access + refresh tokens readable by any script; an XSS (H3) exfiltrates a long-lived session. Accept as a documented tradeoff *with* a strong CSP, or migrate to httpOnly cookie sessions (`@supabase/ssr`).
- **L2 — Logout `scope:'local'`** (`auth-supabase.ts:322`): refresh token not revoked server-side. Use `scope:'global'` for user-initiated logout.
- **L3 — Client-only rate-limiting & password strength** (`config/security.ts`, `LoginPageNew.tsx`): the in-memory 5-attempt limiter resets on refresh and is bypassed by calling GoTrue directly; `isValid` omits the user-info/consecutive checks and the reset flows hand-roll a weaker check. Treat GoTrue server limits as the real control (verify they're configured); route all password entry through one validator gated on `feedback.length===0`.
- **L4 — INSERT-side role guard gap** (`protect_role_escalation` is `BEFORE UPDATE` only): mitigated (profiles.id FKs to auth.users; user creation is service-role-only; signup forces `viewer`). Extend the trigger to `BEFORE INSERT OR UPDATE` for defence-in-depth.
- **L5 — Restore scripts re-introduce weaker policies** (`restore-rls-from-csv-export.sql`, `pii-lockdown-restore.sql`): re-running them after the hardening migrations re-opens avatars public read, re-adds the `WITH CHECK (true)` activity-log INSERT, and re-breaks super_admin/manager document review. Align them to current effective policy or retire them.
- **L6 — Non-constant-time comparisons** of cron secret (`_shared/auth.ts:181`) and reset code (`verify-reset-code`). Use `crypto.timingSafeEqual`.
- **L7 — `submit-account-request`** is unthrottled and doesn't validate `organization_id`; **`approve-account-request`** silently overwrites a pre-existing account matching the request email. Add rate-limiting + org validation; refuse/warn on approval when the email already belongs to an active account.
- **L8 — Upload validation & PII in logs:** `uploadDocumentFile` and avatar upload lack content-type/size validation; Resend error payloads may echo recipient emails into function logs. Add explicit client type+size checks; mask emails before logging (the repo already has `maskEmail`/`redactEmails`).

---

## Verified-clean / positive controls (what is solid)

These were checked and confirmed sound — worth recording for the compliance file:

- **RLS enabled on every PII/tenant table**; no table is RLS-on-with-zero-policies for its intended access.
- **Role self-escalation via `profiles` UPDATE is blocked** by the `protect_sensitive_profile_fields()` `BEFORE UPDATE` trigger (self role/org change denied; role changes restricted to admin/super_admin; granting `super_admin` restricted to `super_admin`). This was the single scariest hypothetical and it is **closed**.
- **Signup path** (`handle_new_user`) hardcodes `role='viewer'`, validates `organization_id`, sets `search_path`.
- **`created_by` is tamper-proof** (server `set_created_by()` trigger); non-admins cannot set another user's `user_id`.
- **`password_reset_codes`** restricted to `service_role` only — not client-readable.
- **`documents`/`document_revisions`/`inspection_projects`/`project_vessels`/`project_files`** are org-isolated (no `USING(true)` on tenant tables).
- **Activity log** is append-only, admin-only readable, actor PII no longer cached; competency certificates live in the **private** `documents` bucket served via short-lived (1h) signed URLs — never `getPublicUrl`.
- **No committed secrets**; `.env` is git-untracked; the client bundle ships only the **anon** key (verified `role=anon`); no `service_role` anywhere in `src/`; Vite prod build disables sourcemaps and strips `console`.
- **GDPR:** data export exists and is RLS-scoped to the requester; self-deletion is self-only + sole-admin-guarded; activity logs are anonymised (not deleted) on self-delete; a routed privacy policy and a full compliance-doc suite (DPIA, ROPA, breach-response plan, LIAs) are present.
- **Edge functions verified sound:** `delete-my-account` (self via JWT, no IDOR), `verify-reset-code` (attempt-capped, single-use, generic messages), `update-password-confirm-email` (identity from verified token), `create-user` (role-gated, super_admin reserved), `send-expiration-reminders` (cron-secret **or** admin JWT). The shared auth layer (`_shared/auth.ts`) reads the caller's role server-side from `profiles` — never from the request body.
- **No open redirects / SSRF in `src/`**; CI runs blocking `gitleaks` + `semgrep` (owasp-top-ten/security-audit).
- **Anonymous sign-in** is declared **off** in `supabase/config.toml` (`enable_anonymous_sign_ins = false`) and unused in code (verification withdrew an earlier escalation premise) — *confirm the live-project auth setting matches.*

---

## Items to confirm in the live project (not provable from source)

1. **Rotate `GEMINI_API_KEY`** and confirm the new key is not vended (after C1 fix).
2. **`avatars` and `vessel-images` `public` flags** — set private in the Supabase dashboard (M11).
3. **Anonymous sign-in disabled** in the hosted Auth settings (matches `config.toml`).
4. **pg_cron retention jobs enabled** and firing (M8).
5. **GoTrue server-side rate limits / min-password policy** configured (L3).
6. **`documents` bucket `allowed_mime_types` / `file_size_limit`** (set via dashboard, not in SQL) (L8).
7. **Effective `pg_policies` dump** diffed against expectations (M12).
8. **Pull `admin-reset-2fa` + `manage-backup-codes`** into the repo and audit them (audit gap).

---

## Prioritised remediation roadmap

**Immediate (do now — live exposure):**
- Rotate `GEMINI_API_KEY`; convert `gemini-proxy` to a true server-side proxy (C1).
- Add an org predicate to the `manager` role policies, or make `manager` vendor-only + denylist it in the approval RPC (C2).
- Add the org scope to the controlled-documents storage SELECT policy (H1).

**Short term (this cycle — cross-tenant / GDPR / XSS):**
- Escape annotation label fields + validate `restrictionImage`; make `vessel-annotations` private with scoped RLS and MIME limits (H2, H3).
- Add Storage erasure to account deletion; add `documents`/`competency_documents` to erasure + export; make deletion atomic/fail-loud (H4, M6, M7).
- Scope `org_admin` on competency history/comments (H5).
- Ship production CSP/HSTS via `vercel.json` (M1).
- `npm audit fix` (H6).

**Medium term (hardening / assurance):**
- Enforce role hierarchy in `delete-user`/`admin-update-email`/`create-user`; fix `sync-users` role trust; constrain `send-email` (M3, M4, M5).
- Enforce AAL2 at the data/edge layer if 2FA is a security control (M2).
- Enable + monitor retention cron; single-source the window (M8).
- Normalise reset-code enumeration/timing (M9); decide the self-service competency model (M10).
- Reproducible migrations + retire the weakening restore scripts; dump/diff `pg_policies` (M12, L5).
- Move to cookie sessions or accept localStorage + CSP; `scope:'global'` logout; constant-time compares; upload validation; enumeration hygiene (L1–L8).
- Confirm all live-project settings above; pull and audit the two missing 2FA edge functions.

---

*Methodology note: findings were produced by six parallel domain review agents and then independently re-verified against source (file:line evidence) with an adversarial pass that corrected one over-escalation (anonymous sign-in) and confirmed the `manager` role's cross-tenant reach. Severities reflect that verification.*
