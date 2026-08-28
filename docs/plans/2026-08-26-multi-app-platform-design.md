# Multi-App Platform Design — Sibling Apps on matrixportal.io Subdomains

**Date:** 2026-08-26 · **Status:** Design for owner review — blocked on the inventory questions in §2
**Origin:** senior-engineer finding F6 (2026-08-26): bring other projects (e.g. timetracking, equipment register) under the same URL as `timetracking.matrixportal.io` / `equipment-register.matrixportal.io`.
**Parent plan:** `2026-08-26-security-hardening-and-platform-ops-plan.md` Phase 4.

## 1. Goals and non-goals

**Goals:** each sibling app on its own subdomain; one sign-in shared across all apps (SSO); one identity/role/org model; the portal's security baseline (headers, RLS conventions, mandatory 2FA, audit logging) inherited rather than re-implemented; incremental — one pilot app first, no big-bang re-architecture of this repo.

**Non-goals:** merging the portal into a monorepo (revisit only if shared-package churn proves painful); a shared rendering shell or micro-frontend framework; migrating existing sibling-app data models wholesale (each app keeps its own tables, re-pointed at the shared project).

## 2. Owner inventory needed before implementation (⚠ blocking)

1. Which projects are candidates, and where does each live today (repo, stack, hosting, database)?
2. Does any candidate already hold production data that would need migrating into the shared Supabase project?
3. Do the candidate apps' users == portal users, or do they have their own account base to merge?
4. Which app is the pilot? (Recommendation: the simplest one with real daily use — likely timetracking.)

## 3. Design decisions (recommended; rationale attached)

### D1 — One shared Supabase project (`ntrgjqrbewbvwofupphn`), not per-app projects
Identity, roles, organizations, RLS helpers, audit logging, GDPR erasure/export, and now the 2FA machinery all live in the one project. A second project forks every one of those and doubles the compliance surface (the ISO-posture review already flagged supplier/processor sprawl). Per-app tables live in the shared `public` schema with an app prefix (`tt_entries`, `eq_assets`) — same org-scoped RLS conventions, same SECURITY DEFINER helpers, same adversarial-review rule for migrations. The role model extends by reusing `tab_visibility_settings`-style per-app access flags rather than minting new roles.

### D2 — Cookie sessions on `.matrixportal.io` = the SSO mechanism AND the fix for audit finding L1
localStorage is per-origin: `app.matrixportal.io` and `timetracking.matrixportal.io` cannot see each other's sessions, so SSO is impossible on the current storage. The move is a custom supabase-js `storage` adapter writing the session to a cookie with `Domain=.matrixportal.io; Secure; SameSite=Lax; Path=/` (chunked if >4KB — Supabase sessions usually are; the `@supabase/ssr` chunking approach is the reference implementation). Every app instantiates its client with the same adapter → one sign-in works everywhere, sign-out everywhere, and the L1 "sessions in localStorage" finding closes as a side effect.

**Honest limits, stated up front:** the cookie cannot be HttpOnly (supabase-js needs JS access), so this is *not* XSS-immunity — CSP remains the XSS control, and every subdomain must carry an equally strict CSP because a script injection on ANY subdomain can now read the shared session. That is the real cost of SSO and the reason D5 exists. The 12h timebox and the mandatory-2FA gate automatically span all apps (same session, same `aal` claim, and the gate ships in the shared auth package per D4).

**Sequencing note:** this storage change touches the portal's `supabase-client.ts` (fixed storageKey, no-op lock — both scarred areas). It lands as its own reviewed change in the portal FIRST, verified in isolation, before any sibling app consumes it.

### D3 — Separate repos + separate Vercel projects per app; shared code via a published package
Each sibling app: its own repo (or subfolder repo), its own Vercel project bound to its subdomain via CNAME, previews per branch (matching the portal's new dev-branch-first deploy rule). Shared code ships as a private package `@matrix/platform-auth` (supabase client factory with the cookie adapter, AuthContext, route guards, the 2FA enrollment gate + challenge components, role helpers, session-expiry banner) and later `@matrix/platform-ui` (design tokens + core components). Monorepo is deliberately deferred: this repo is large and mid-flight; forcing it into a workspace now risks the WIP for zero user-facing gain.

### D4 — The security baseline is a checklist enforced by the shared package + per-app config, not trust
A new app is not "on the platform" until: cookie-session auth via `@matrix/platform-auth` (which brings the mandatory-2FA gate with it — an app without the gate would be a 2FA bypass); its own `vercel.json` with the portal's header set (CSP tuned per app — only the portal needs the Companion localhost ports; **F-16 lesson: those ports are load-bearing for the portal and unnecessary for siblings**); org-scoped RLS on every table, adversarially reviewed; audit triggers on its sensitive tables; its subdomain added to the `ALLOWED_ORIGINS` edge-function secret and any CORS allowlists.

### D5 — Standing constraints inherited from what is already live
- **HSTS `includeSubDomains; preload` is already on and irreversible** — every subdomain serves HTTPS from first byte (Vercel does this; anything self-hosted may not).
- GitLab CI deploy stage stays inert (gated on nonexistent `main`); Vercel git integration is the deploy path for every app.
- Supabase Auth redirect-URL allowlist must gain each subdomain's callback URLs (password reset, email confirm).
- The `serve-client-share` anonymous surface stays portal-only; sibling apps get no anonymous endpoints without their own design review.

## 4. Phased delivery

| Phase | Work | Gate |
|---|---|---|
| M0 | Owner answers §2; pilot chosen | — |
| M1 | Cookie-session adapter in the portal (its own change: adapter + tests + headless-Edge drive of login/share/2FA-gate) | Portal fully green on cookie sessions in preview before master |
| M2 | Extract `@matrix/platform-auth` from the portal's auth layer; portal consumes its own package (no behavior change — byte-equivalent gate) | Suite + drive green |
| M3 | Pilot app: repo, Vercel project, subdomain DNS, D4 checklist, per-app tables + reviewed migrations | Pilot signs in via portal session; 2FA gate active; role smoke |
| M4 | Second app repeats M3; retro on the shared-package friction → monorepo go/no-go decision | — |

## 5. Risks

1. **Shared cookie widens the XSS blast radius** (D2) — mitigation: per-app CSP as a hard checklist item, and no app ships without it.
2. **Package drift** — an app pinned to an old `@matrix/platform-auth` misses a security fix. Mitigation: the package README carries a "security-critical, update within a week of release" rule; the risk register (created today) gets a standing row.
3. **Supabase Auth config is project-global** — the 12h timebox, rate limits, and email templates apply to every app identically. That is a feature here, but any future app needing different session policy forces a per-app project and breaks SSO — say no early.
4. **RLS namespace collisions** — app-prefixed table names + the adversarial-review rule are the guard; the nightly `db_state_snapshots` policy-hash ledger (landing today) will surface any policy drift a new app introduces.

## 6. Relationship to the security plan

M1 closes audit finding **L1** (localStorage sessions). D4 propagates the mandatory-2FA control (senior-eng F1) to every future app by construction. The per-app CSP requirement extends audit **M1**'s header work. The state ledger (P3.3) becomes the drift detector for multi-app RLS. Nothing in this design weakens a control that is live today.
