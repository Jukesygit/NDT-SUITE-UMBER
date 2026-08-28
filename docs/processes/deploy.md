# Deploy

**Owner:** Jonas · **Last reviewed:** 2026-08-26

---

## Purpose

NDT Suite has **three independent deploy surfaces**. They are not deployed together, they have
different triggers, and a change that spans two of them has an ordering requirement. Getting the
ordering wrong has broken production before.

| # | Surface | Trigger | Rollback |
|---|---|---|---|
| 1 | **Frontend** (React/Vite bundle) | Vercel git integration — push to a branch | Redeploy previous deployment in Vercel |
| 2 | **Edge functions** (Deno, Supabase) | Manual `supabase functions deploy` | Redeploy previous source from git |
| 3 | **Database migrations** | Manual `supabase db push` | None automatic — forward-fix only |

**Ordering rule:** when a change spans surfaces, the database goes first, then edge functions, then
the frontend. A frontend that expects a column the database does not have is a broken app; a database
with an unused column is harmless. Precedent: migration `20260728120000` had to be applied *before*
the frontend deploy or the nested embed 400'd.

---

## Prerequisites

- `npm ci` complete; `npm run build` green locally.
- Supabase CLI 2.107.0+, logged in (`supabase login`). The CLI stores its token in the Windows
  credential store, so arbitrary pre-flight SQL needs the dashboard SQL editor on that machine.
- `.env` with no BOM — see `local-dev-setup.md`. A BOM makes every CLI call fail with
  `unexpected character '»'`.
- Production project ref: **`ntrgjqrbewbvwofupphn`** (eu-west-2). Never `cngschckqhfpwjcvsbad`
  (old, read-only) or `oxzteqqrhggdodcnngzn` (abandoned attempt, different org).
- For migrations: the change has passed **adversarial SQL review**. This is a standing repo rule, not
  a formality — adversarial review has caught deployment-bricking defects twice (a phantom table that
  would have bricked every account deletion; a `profiles` policy that reintroduced the RLS-recursion
  scar).

---

## Surface 1 — Frontend (Vercel)

### How it actually deploys

Vercel's own **git integration** builds and deploys. `master` is production
(`https://www.matrixportal.io`); any other branch produces a **preview deployment** at its own URL.

> **GitLab CI does not deploy.** `.gitlab-ci.yml` has a `deploy` stage, but its rule is
> `if: $CI_COMMIT_BRANCH == "main"` (`.gitlab-ci.yml:30`) and **no branch named `main` exists** in
> this repository — locally or on either remote (`gitlab`, `origin`); both use `master`. The deploy and
> `post-deploy` health-check jobs have therefore never run. The **quality gates do** run per branch:
> `install → gitleaks, semgrep, npm audit → lint, typecheck → test (+coverage) → build`, on merge
> requests and on `main|master|dev|dev-refactor|feature/*` (`.gitlab-ci.yml:23-26`). Treat CI as a gate,
> never as the deployer.

### Steps

**Owner decision, 2026-08-26: ship to a dev branch preview BEFORE master.**

```bash
# 1. Gates, locally, on the integrated tree
npm run build && npm run test:ci && npm run lint && npm run verify:share-chunk

# 2. Push the feature/dev branch — Vercel builds a PREVIEW deployment
git push origin <branch>
git push gitlab <branch>          # keep both remotes fast-forward

# 3. Verify on the preview URL (see Verification below)

# 4. Only then merge to master — that is what reaches users
git checkout master && git merge <branch>
git push origin master && git push gitlab master
```

Both remotes are kept in sync deliberately (masters reconciled 2026-08-17). Pushing only one leaves
them divergent and the next person's push non-fast-forward.

### What ships in the bundle

- `vercel.json` carries the production response headers: CSP, `Strict-Transport-Security`
  (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and `X-Robots-Tag: noindex, nofollow` scoped to `/share/(.*)`
  so published client links never enter a search index.
- **HSTS preload is irreversible and covers all subdomains.** Any future `*.matrixportal.io` app must
  serve HTTPS from day one.
- The CSP `connect-src` allowlists `http://localhost:18923–18932` and the matching `ws://`. Those are
  the **NDT Companion app's production ports** — a 2026-08-26 finding that they were a dev leak was
  **REFUTED**. Never remove them.
- Source maps are off (`vite.config.js:141`) and `console`/`debugger` are stripped by Terser
  (`vite.config.js:93-98`).

> ### ⚠ Do not return `manualChunks` to object form
> `vite.config.js:117` uses the **function form** on purpose, pinning `vite/preload-helper` to its own
> chunk. The object form makes Rollup park that shared helper inside `supabase-vendor`, giving every
> chunk that contains a dynamic `import()` a static ESM edge onto supabase-js — which dragged the
> auth client onto the loginless `/share` page. That regression sat **undetected from 2026-08-13 to
> 2026-08-25**. Re-run `npm run verify:share-chunk` after any chunking change.

---

## Surface 2 — Edge functions

19 functions live in `supabase/functions/` (plus `_shared/`). They deploy **individually and manually**
— there is no CI path.

### Steps

```bash
supabase functions deploy <function-name> \
  --project-ref ntrgjqrbewbvwofupphn \
  --use-api
```

`--use-api` avoids the Docker bundling path and is what the 2026-08-24 twelve-function deploy used.
Deploy only the functions you changed.

> ### 🚨 NEVER redeploy `serve-client-share` carelessly
>
> `serve-client-share` is the **one deliberately anonymous entry point** and is deployed with
> `--no-verify-jwt` (`supabase/functions/serve-client-share/index.ts:5`;
> `supabase/migrations/20260820120000_client_shares.sql:23`). Every other function runs
> `verify_jwt: true`.
>
> **A plain `supabase functions deploy serve-client-share` resets it to JWT-verified and instantly
> breaks every client share link in existence** — anonymous visitors have no JWT. If you genuinely
> need to redeploy it:
>
> ```bash
> supabase functions deploy serve-client-share \
>   --project-ref ntrgjqrbewbvwofupphn --no-verify-jwt
> ```
>
> Then immediately re-probe an unauthenticated share URL. This is why the 2026-08-24 bulk deploy
> deployed 12 functions and left this one untouched. Never use a bare
> `supabase functions deploy` with no function name — it deploys *everything*, including this one,
> without the flag.

### Function secrets

Set separately from deployment; see `secrets-and-rotation.md`. The three project secrets are
`RESEND_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, plus `CLIENT_SHARE_IP_SALT` for the share function.
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

---

## Surface 3 — Database migrations

Migrations live in `supabase/migrations/` as `<timestamp>_<name>.sql`.

### Steps

```bash
# 1. Confirm which project the CLI is linked to
supabase link --project-ref ntrgjqrbewbvwofupphn

# 2. See what the remote believes it has applied
supabase migration list

# 3. Apply
supabase db push
#   ...or, when step 4 applies:
supabase db push --include-all

# 4. Verify the ledger: local and remote must match
supabase migration list
```

> ### ⚠ SCAR — the `--include-all` ordering trap
>
> `supabase db push` applies migrations whose timestamp sorts **after** the last applied one. If you
> author a migration with a timestamp that sorts **before** something already applied, plain
> `db push` silently skips it.
>
> This bit on 2026-08-24: the security-remediation migrations `20260812120000..124000` sort before the
> already-applied client-share migrations `20260820120000` / `20260821140000`, so they needed
> `supabase db push --include-all`. It happens whenever branches are developed in parallel and merged
> out of timestamp order.
>
> **`supabase migration list` is the check.** If a migration you expect is missing from the remote
> column after a push, this is why. Source: `docs/Engineering Log.md`, 2026-08-24 entry.

### Standing rules for migrations

1. **Adversarial SQL review before every push.** No exceptions. Two production-bricking defects were
   caught this way.
2. Policies on `profiles` must route through the `SECURITY DEFINER` helpers (`get_my_role()`,
   `auth_is_admin()`, `auth_user_org_id()`) — never an inline `profiles` sub-select, which re-enters
   RLS on `profiles` and is this codebase's recurring recursion scar.
3. `SECURITY DEFINER` RPCs need NULL-safe role checks and an explicit `REVOKE ... FROM anon`.
4. Enable RLS on every new table.
5. Put the deploy checklist in the migration's own header comment — see
   `supabase/migrations/20260820120000_client_shares.sql:6-27` for the pattern.
6. **Storage policies do not survive a `supabase db dump`** (0/33 in the 2026-08-17 dry run). If a
   migration adds storage policies, they must be re-applied explicitly after any restore — the
   catalog-regeneration SQL is in the migration runbook, and the procedure is in
   `backup-and-restore.md`.

---

## Verification

### Frontend

```bash
# Headers (production or a preview URL)
curl -sI https://www.matrixportal.io | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type"

# Share routes must be noindex
curl -sI https://www.matrixportal.io/share/anything | grep -i x-robots-tag

# Root and login both 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io
curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io/login
```

Then in a browser: sign in (2FA challenge appears), load one data page, perform one write, download one
storage object. Confirm the deployed bundle references only `ntrgjqrbewbvwofupphn` — the check used to
settle the 2026-08-24 "did prod ever flip?" question:

```bash
curl -s https://www.matrixportal.io/assets/<entry-chunk>.js | grep -o "cngschckqhfpwjcvsbad" | head   # must be EMPTY
```

### Edge functions

```bash
supabase functions list --project-ref ntrgjqrbewbvwofupphn
```

Probe the auth gate — a call with no/invalid credentials must be rejected, not served:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/gemini-proxy   # expect 401
```

If `serve-client-share` was touched, open a **real live share link unauthenticated** and confirm it
still serves. A 401 there means the `--no-verify-jwt` flag was lost.

### Migrations

```bash
supabase migration list          # local column == remote column
```

Plus whatever the migration itself asserts — e.g. for `20260820120000`, that the `client-shares`
bucket is private and `anon` appears in no grant:

```sql
select id, public from storage.buckets where id = 'client-shares';                    -- public must be false
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('client_shares','client_share_views');                          -- no 'anon'
```

---

## Escalation / when it goes wrong

| Symptom | Cause | Action |
|---|---|---|
| Every share link returns 401 | `serve-client-share` redeployed without `--no-verify-jwt` | Redeploy **with** the flag immediately; re-probe a live link |
| Migration missing on remote after `db push` | Timestamp sorts before an applied migration | `supabase db push --include-all`, re-verify with `migration list` |
| CLI: `unexpected character '»'` | BOM in `.env` | Rewrite `.env` without a BOM (`local-dev-setup.md`) |
| Site up, data pages empty | Org-scoped RLS with no super_admin override | Expected for out-of-org accounts. Not a deploy defect — do not re-raise |
| A manager suddenly sees nobody | NULL `organization_id` after the role-scoping migrations | Assign that account an organization |
| Frontend deployed but backend not | Wrong ordering | Deploy the migration/function now; if the app is broken, roll the frontend back in Vercel first |
| Need to undo a frontend release | — | Vercel dashboard → Deployments → promote the previous production deployment |
| Need to undo a migration | No automatic path | Forward-fix with a new migration. If data is lost → `disaster-recovery.md` |

Production credential or provider-dashboard work is owner-only. Database loss or corruption →
`disaster-recovery.md`. Suspected security incident → `incident-response.md`.
