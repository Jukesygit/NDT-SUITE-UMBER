# Local Development Setup

**Owner:** Jonas · **Last reviewed:** 2026-08-26

Getting a working NDT Suite checkout on a new machine, pointed at the live Supabase project, with the
test and lint gates running.

---

## Purpose

NDT Suite is a Vite + React + TypeScript frontend talking to a hosted Supabase backend. There is **no
local database** in the normal workflow — `npm run dev` runs against the production Supabase project
(`ntrgjqrbewbvwofupphn`, eu-west-2). That is deliberate and it has consequences: what you do in a dev
session is real data. Read the "What you are actually connected to" section before your first write.

---

## Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Node.js | `>=18.0.0` (`package.json` `engines`) | CI runs `node:20-alpine` (`.gitlab-ci.yml:11`). Node 20 is the safe target — see the Node-20 gotcha below. |
| npm | ships with Node | `package-lock.json` is committed; use `npm ci` for a reproducible install. |
| Git | any recent | — |
| Supabase project credentials | URL + anon key | From the owner, or Supabase dashboard → Project Settings → API. |
| Supabase CLI | 2.107.0+ | Only for edge functions / migrations (`deploy.md`). Not needed to run the app. |
| Docker Desktop | any recent | Only for database dump/restore (`backup-and-restore.md`). Not needed to run the app. |
| An authenticator app | Google Authenticator, Microsoft Authenticator, 1Password, … | **2FA enrollment is mandatory for every account** — see below. |

---

## Steps

### 1. Clone and install

```bash
git clone <repo-url>
cd "NDT SUITE UMBER"
npm ci          # reproducible; use `npm install` only when changing dependencies
```

### 2. Create `.env`

Copy the template and fill in the two required values:

```bash
cp .env.example .env
```

`.env` shape (`.env.example`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co     # REQUIRED
VITE_SUPABASE_ANON_KEY=<anon key>                        # REQUIRED

# VITE_APP_URL=https://your-app-domain.com               # optional
# VITE_ENABLE_ANALYTICS=false                            # optional
# VITE_MAINTENANCE_MODE=false                            # optional — see below
```

Both required values are read in `src/config/environment.ts:46` and surfaced through
`src/supabase-client.ts`. `VITE_MAINTENANCE_MODE` is read at `src/config/environment.ts:56`; when
`true` the app runs in a **tools-only PII lockdown** (data pages hidden, `/` redirects to `/cscan`) —
it is *not* a site-down switch, a misconception that cost time during the 2026-08-17 cutover.

**Never put a server-side secret in `.env`.** `.env.example:12-15` spells out the rule for
`GEMINI_API_KEY` specifically: Vite inlines every `VITE_`-prefixed variable into the client bundle, so
a `VITE_GEMINI_API_KEY` would publish the key to every visitor. Server secrets live as Supabase
function secrets — see `secrets-and-rotation.md`.

> ### ⚠ SCAR — never write `.env` with PowerShell `Out-File`
>
> On 2026-08-24 the desktop `.env` acquired a UTF-8 BOM from a PowerShell 5.1 `Out-File` redirect.
> Vite tolerated it; **every `supabase` CLI invocation failed with `unexpected character '»'`** and the
> cause was not obvious from the error. Write `.env` with an editor, or with
> `[System.IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))`. Never
> `Out-File`, never `>`, never `Set-Content` without `-Encoding utf8NoBOM`.
>
> To check an existing file for the BOM:
> ```powershell
> Format-Hex -Path .env -Count 3     # EF BB BF at offset 0 means the BOM is there
> ```
> Source: `docs/Engineering Log.md` (2026-08-24 security-remediation deploy entry).

### 3. Run the dev server

```bash
npm run dev     # Vite, default http://localhost:5173
```

To point a second instance at a *different* Supabase project without touching `.env` (process env beats
`.env` — the technique used to verify the 2026-08-17 migration target):

```powershell
$env:VITE_SUPABASE_URL="https://<other-ref>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<other anon key>"
npm run dev -- --port 5199 --strictPort
```

Full sequence: `docs/plans/2026-08-17-supabase-project-migration-runbook.md` Phase 6.

### 4. Sign in — 2FA is mandatory

Since the owner decision of 2026-08-26 there is a **hard enrollment gate for all roles, no grace
period**. `RequireTwoFactorEnrolled` wraps every protected route (`src/App.tsx:168-170`), so a signed-in
account with no *verified* TOTP factor sees only the enrollment screen and a Sign out button —
`src/components/auth/RequireTwoFactorEnrolled.tsx`. Have an authenticator app ready before your first
login, and store the backup codes the wizard issues. Details: `auth-and-roles.md`.

---

## Commands

All from `package.json`:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc && vite build` — **type check is part of the build** |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run lint` | `eslint src` |
| `npm run lint:fix` | ESLint autofix |
| `npm run format` / `format:check` | Prettier over `src/**` |
| `npm run test` | Vitest (watch mode) |
| `npm run test:ci` | `vitest run --coverage` — what CI runs |
| `npm run test:coverage` | Vitest with a coverage report |
| `npm run verify:share-chunk` | Fails if the loginless `/share` bundle reaches auth/editor code |
| `npm run precommit` | `lint && format:check && typecheck` — also runs via the Husky pre-commit hook |
| `npm run preview` | Serve the production build locally (applies the strict preview CSP) |

Before pushing anything non-trivial:

```bash
npm run build && npm run test:ci && npm run lint && npm run verify:share-chunk
```

---

## Verification

You have a working environment when all of these hold:

1. `npm run dev` serves the app and `/login` renders with no console errors other than
   `localhost:18923–18932` connection-refused noise — that is the NDT Companion port probe and is
   expected when the companion app is not running (`vite.config.js:9` allowlists that range in the dev
   CSP; the same range in production CSP is deliberate, see `vercel.json`).
2. You can sign in, pass the 2FA gate, and the header shows your name and role.
3. `npm run build` completes and `tsc` reports no errors.
4. `npm run test:ci` passes. **One known flake:** `src/hooks/__tests__/useLayoutMode.test.ts` can crash
   its worker with an out-of-memory error. It is documented across the Engineering Log as
   pre-existing and unrelated to any change; it is excluded in CI-mode runs. Any *other* failure is real.
5. `npm run verify:share-chunk` prints OK.

---

## What you are actually connected to

- **Live project:** `ntrgjqrbewbvwofupphn` — "Matrix Portal", **eu-west-2**. This is production. The
  cutover completed 2026-08-17 (`docs/plans/2026-08-17-supabase-project-migration-runbook.md`).
- **Old project `cngschckqhfpwjcvsbad`** (eu-north-1) is retained read-only —
  `ALTER ROLE authenticator SET default_transaction_read_only = true` — deliberately, as rollback and
  stale-tab protection. Never point anything at it.
- **`oxzteqqrhggdodcnngzn`** is an abandoned first cutover attempt in a different org. **Never deploy
  to it.**
- Auth sessions are stored in `localStorage` under the key `ndt-suite-auth`
  (`src/supabase-client.ts:20`). The fixed key exists because a floating key caused a shared-browser
  session clobber incident — do not change it.

Because dev talks to production: prefer reading over writing, use a test account rather than a real
person's profile, and remember that inserts are attributed server-side by trigger
(`employee_competencies.created_by`, migration `20260728130000`) and appear in the activity log.

---

## Gotchas

**Path aliases are declared but unused — do not start using them.**
`tsconfig.json:38-50` declares `@/*`, `@components/*`, `@services/*`, `@hooks/*`, `@utils/*`,
`@types/*`, `@config/*`, `@store/*`. **`vite.config.js` declares no matching `resolve.alias`**, and a
grep over `src/` finds **zero** import sites using any of them — every import in the codebase is
relative. TypeScript would resolve an aliased import; Vite would then fail to bundle it. If you want
aliases, add the matching `resolve.alias` block to `vite.config.js` first and verify with
`npm run build`, as a deliberate change — not incidentally in a feature branch.

**Node 20 vs Node 22.** The CI runner is Node 20; most dev machines here run Node 22. On 2026-08-24 a
WebCrypto test passed on every local machine and failed only in CI, because Node 20 under jsdom rejects
a detached `ArrayBuffer` copy where Node 22 accepts it. Rule of thumb: hand `crypto.subtle` a
**typed-array view**, never a `.buffer.slice()`. Also note `src/test/setup.js` installs Node's real
`webcrypto` when `crypto.subtle` is missing — never replace that with a partial mock.

**File size lint.** ESLint warns at 300 lines per file. The baseline currently carries ~408 warnings;
0 errors is the gate, not 0 warnings.

**ESLint config.** `eslint.config.js` is authoritative. A stale `.eslintrc.json` exists and is dead —
editing it does nothing.

---

## Escalation / when it goes wrong

| Symptom | Likely cause | Action |
|---|---|---|
| `supabase` CLI fails with `unexpected character '»'` | UTF-8 BOM in `.env` | Rewrite `.env` without a BOM (see scar above) |
| App loads but every request 401s | Wrong or stale anon key; JWT secret changed | Re-copy `VITE_SUPABASE_ANON_KEY` from the dashboard; all users re-login after any project change |
| Signed in but see "Two-factor authentication required" and nothing else | Working as designed — no verified TOTP factor | Enroll via the wizard. Lost the authenticator? → `auth-and-roles.md` § recovery |
| Logged in but a page shows an empty list with HTTP 200 | Org-scoped RLS, not a bug | Your account must be in the **Matrix** organization. Refuted repeatedly as a "schema" problem — do not re-raise |
| `verify:share-chunk` red | Something pulled auth/editor code into the loginless bundle | Check `git log` first — it stayed red *unnoticed from 2026-08-13 to 2026-08-25*. Do not assume your change caused it |
| Build OOMs | Large test/build memory | CI sets `NODE_OPTIONS="--max-old-space-size=6144"` (`.gitlab-ci.yml:90`); do the same locally |

Anything touching credentials, provider dashboards, or production data goes to the owner — see
`incident-response.md` and `secrets-and-rotation.md`.
