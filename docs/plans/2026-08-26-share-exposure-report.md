# Client-share anonymous exposure report (P2.1)

**Date:** 2026-08-26
**Task:** P2.1 of `docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md`
**Question:** What is an unauthenticated visitor holding a `/share/:token` link actually exposed to?
**Tree audited:** `feature/scope-planning-suite` **including the uncommitted client-share stats WIP**
(`ShareWallLossSection.tsx`, `wall-loss-request.ts`, `bundle-builder.ts`/`bundle-types.ts` stats+wall-loss
additions, `vite.config.js` chunking edits). Two other agents were editing `src/components/auth`,
`src/hooks` and `supabase/functions` in parallel; the build snapshot below is the tree as of that moment.

---

## Executive verdict

**Nothing is exposed that shouldn't be.** No secret, no credential, no personnel identifier and no
customer data beyond the published deliverable reaches an anonymous share visitor.

The three checks that would have been findings all came back clean:

- **Old Supabase project ref `cngschckqhfpwjcvsbad`: ZERO occurrences** anywhere in `dist` — the
  region migration left no residue in the client bundle.
- **Exactly one JWT exists in the entire build**, and its decoded payload is
  `{"iss":"supabase","ref":"ntrgjqrbewbvwofupphn","role":"anon"}`. There is no `service_role` key,
  no management token, and no other high-entropy credential in any chunk. (This required decoding
  rather than grepping — `service_role` inside a JWT is base64 and a plaintext grep cannot see it.
  Both were checked; both are clean.)
- **No sourcemaps** are emitted (`vite.config.js:141` `sourcemap: false`, and `find dist -name '*.map'`
  returns nothing), so no original source is recoverable.

What an anonymous visitor *does* get beyond the report itself is **reconnaissance surface, not data**:
the SPA entry chunk carries the app's route table, the six role names, eight table names, three RPC
names and ten edge-function names. Every one of those is an identifier, not a capability — the security
boundary is RLS and the edge functions' own auth, and none of it is weakened by being named. It is,
however, exactly the material a separate HTML entry point would remove, and it is the only substantive
argument for doing that work. See the recommendation section.

Two genuinely actionable items came out of this, both low severity and neither share-specific:
**localhost dev ports baked into the production CSP**, and **`<ReactQueryDevtools>` rendered ungated**
(currently inert only because the package ships a production no-op).

**Verification gates, both green:**

| Command | Result |
| --- | --- |
| `npm run build` | ✅ built in 1m 53s, no errors (chunk-size warnings only, pre-existing) |
| `npm run verify:share-chunk` | ✅ `share chunk: ClientSharePage-vNtTL90x.js` / `static closure: 26 chunks` / `OK — no auth or editor code` |
| `npx vitest run src/components/clientShare/__tests__/bundle-exclusions.test.ts` | ✅ 5/5 passed against the WIP tree |

No transient/half-edited-file failures were encountered; no retry was needed.

---

## 1. What an anonymous visitor downloads

`vercel.json` rewrites `/((?!assets/).*)` → `/index.html`, so `/share/:token` serves the SPA shell.
`dist/index.html` unconditionally loads the entry chunk and modulepreloads three more, then React
Router lazy-loads the share route's chunk and its closure.

### 1a. Fetched immediately on page load (the app shell)

| File | Raw | Gzip | Why it loads |
| --- | ---: | ---: | --- |
| `index.html` | 0.9 kB | — | the rewrite target |
| `assets/index-DboG8o_B.js` | 228.20 kB | 56.20 kB | `<script type=module>` — the SPA entry |
| `assets/react-vendor-DP2JZq9H.js` | 158.70 kB | 53.00 kB | modulepreload (also needed by the share page) |
| `assets/supabase-vendor-a83sF5pH.js` | 163.29 kB | 41.03 kB | modulepreload — **not needed by the share page** |
| `assets/preload-helper-Bj79fh9f.js` | 1.11 kB | 0.48 kB | modulepreload (also needed by the share page) |
| `assets/index-Cu_xErKf.css` | 156.91 kB | 27.27 kB | `<link rel=stylesheet>` — the whole app's `main.css` |
| `assets/index-Bcu6C0PV.js` | 0.93 kB | 0.48 kB | entry closure |
| `assets/LoadingSpinner-C4QvyMtF.js` | 0.40 kB | 0.29 kB | entry closure (Suspense fallback) |

Note that `supabase-vendor` **is modulepreloaded from `index.html` on every route**, including
`/share/:token`. The chunk guard excludes it from the *share page's own* import closure — correctly, and
that guard is doing its job — but the HTML pulls it anyway because the entry imports it. This is the
concrete, measurable form of the "entry chunk loads on every route" limitation the guard documents.

### 1b. Then lazy-loaded for the share route (26-chunk closure)

`ClientSharePage-vNtTL90x.js` (16.75 kB) + `ClientSharePage-B-tCBLW5.css` (11.20 kB) +
`three.module` (493.85 kB), `pipeline-geometry` (52.86), `CSS2DRenderer` (14.70),
`coverage-calculator` (12.59), `dome-scan-geometry` (11.33), `vessel-serialization` (10.49),
`layer-presence` (6.46), `readonly-sync` (5.32), `body-frame` (4.96), `texture-manager` (4.91),
`outliner-tree` (4.34), `types` (3.27), `coverage-comparison` (3.04), `camera-animation` (3.02),
`vessel-coords` (2.91), `createLucideIcon` (1.83), `colorscales` (1.69), `dome-tangent` (1.05),
`texture-hydration` (0.72), `bundle-types` (0.37), `lock` (0.38), `arrow-left` (0.34),
`chevron-right` (0.30), plus the shared `react-vendor` / `preload-helper`.

All of this is geometry and rendering code the viewer legitimately needs to draw the vessel.

**Union: 30 JS chunks, 1,210 kB raw; plus 168 kB of CSS.**
For comparison, `dist/assets` in full is 144 files / 10.81 MB, so the share visitor pulls roughly
11% of the build.

### 1c. A note on "anonymous-loadable"

Two senses need separating, and the findings table below uses the strict one:

- **Auto-loaded** — fetched by the browser when you visit `/share/:token` (the 30 chunks above).
- **Publicly fetchable** — Vercel serves *every* file under `/assets/` to anyone who requests the URL.
  Hash filenames are not a secret: the entry chunk names 24 lazy chunks directly, and those name
  further chunks (e.g. `AdminPage-B2i_u5zn.js` names `NotificationsTab-BaIELdby.js`), so the whole
  graph is walkable by an anonymous crawler starting from `index.html`.

This distinction matters for exactly one finding — the real email addresses in `NotificationsTab`
(§2, F-07). They are not auto-loaded on the share page, but they are retrievable by an anonymous
person willing to walk the import graph. That is a property of any single-entry SPA, not of the
share feature, and it is the second argument for a separate HTML entry.

---

## 2. Findings

Severity: **Info** = by design / no action. **Low** = hygiene, fix when convenient.
Nothing rated Medium or above was found.

| # | Finding | Location | Auto-loaded on `/share`? | Severity | Verdict | Recommended fix |
| --- | --- | --- | :---: | --- | --- | --- |
| F-01 | Old project ref `cngschckqhfpwjcvsbad` — **zero occurrences** in all 144 dist files | — | — | — | ✅ Clean | none |
| F-02 | Supabase URL `https://ntrgjqrbewbvwofupphn.supabase.co` + **anon** JWT inlined | `index-DboG8o_B.js`, `ClientSharePage-vNtTL90x.js` | **Yes** | Info | **By design.** Only one JWT exists in the build; decoded `role: "anon"`. `client-share-client.ts:44-50` documents why the share page sends it (the Supabase gateway wants an `apikey` even on a `--no-verify-jwt` function) and that it grants nothing — the token check is the access control. | none |
| F-03 | No `service_role` / `sb_secret_` / `CRON_SECRET` / `sk-` / `ghp_` / `AKIA` / `AIza` / private-key material anywhere | full dist | — | — | ✅ Clean (plaintext grep **and** JWT-payload decode) | none |
| F-04 | Entry chunk carries the full internal route table: `/admin`, `/personnel`, `/documents`, `/profile`, `/projects/:id/edit`, `/vessel-modeler`, `/cscan`, `/topology`, `/scan-viewer`, `/downloads`, `/demos/*` (4), `/login`, `/privacy` | `index-DboG8o_B.js` | **Yes** | Info | Reconnaissance only. Every route is behind `ProtectedRoute` / `RequireAccess` / `RequireTabVisible`; knowing a path grants nothing. The `/demos/*` routes are *unauthenticated* but were already public. | Removed by a separate HTML entry (§4) |
| F-05 | Role vocabulary `super_admin, admin, manager, org_admin, editor, viewer`; table names `profiles, organizations, activity_log, employee_competencies, account_requests, permission_requests, system_announcements, tab_visibility_settings`; RPCs `log_activity, approve_permission_request, reject_permission_request`; edge fns `create-user, delete-user, bulk-create-users, sync-users, send-reset-code, verify-reset-code, manage-backup-codes, submit-account-request, approve-account-request, update-password-confirm-email` | `index-DboG8o_B.js` | **Yes** | Info | Names, not capabilities. RLS + per-function auth are the boundary; the security audit already covers those. Worth knowing that an attacker gets a free map of the admin surface. | Removed by a separate HTML entry (§4) |
| F-06 | `"Matrix Advanced Inspections"` string | `bundle-types-BRMey3Dg.js` (in the share closure) | **Yes** | Info | **By design** — `PREPARED_BY`, the attribution line printed on every published page (`bundle-types.ts:45`). | none |
| F-07 | Real addresses `jonas@matrixinspectionservices.com`, `noreply@updates.matrixportal.io` | `NotificationsTab-BaIELdby.js` | **No** — admin lazy chunk, but publicly fetchable by URL (§1c) | Low | Not a share-page exposure. Reachable only by walking the import graph. Both are business contact addresses, not credentials. | Optional: move to config/env rather than literals. A separate HTML entry does *not* fix this (the chunk stays fetchable); only removing the literals does. |
| F-08 | Placeholder emails `you@company.com` (entry), `example@company.com`, `user@example.com` | entry + `ProfilePage`, `UsersTab` | Yes (entry one) | Info | Form placeholders. Not real. | none |
| F-09 | `GEMINI` × 9 | `DrawingImportModal-E8-koIoZ.js` | No | Info | Model names (`gemini-3.5-flash`) and the edge-function name `gemini-proxy`. **No API key** — the proxy pattern is working as intended. | none |
| F-10 | `RESEND` hits | `supabase-vendor`, `plotly.min` | Yes (vendor) | Info | **False positive.** Lowercase `resend()` methods — Supabase Realtime `Push.resend()` and GoTrue `auth.resend()`. Not the Resend email API. | none |
| F-11 | `console.log` × 1 in `supabase-vendor` | `supabase-vendor-a83sF5pH.js` | **Yes** | Info | `this.logger=console.log` — a *reference* assignment inside GoTrueClient. Terser's `drop_console` removes call sites, not identifier references. No logging occurs unless `logDebugMessages` is on. The "console stripped" claim holds for call sites. | none |
| F-12 | `console.log` × 2, `sourceMappingURL` × 1 | `pdf.worker-BA9kU3Pw.mjs` | No | Info | A pre-built worker copied verbatim, not run through Terser. Its `sourceMappingURL` points at a `.map` that was never emitted (404). Never loaded by the share page. | none |
| F-13 | No sourcemaps emitted; no `.map` files in dist | — | — | — | ✅ Clean (`vite.config.js:141`) | none |
| F-14 | No React Query devtools string anywhere in dist | — | — | — | ✅ Clean at runtime — **but see F-15** | — |
| F-15 | `<ReactQueryDevtools initialIsOpen={false} />` is rendered **ungated** | `src/App.tsx:4, 407` | Yes (would be) | **Low** | Inert *only* because `@tanstack/react-query-devtools` ships a production build that exports a no-op — confirmed, the string is absent from dist. That is a dependency behaviour, not our guard. A package change or a `NODE_ENV` slip would drop a devtools panel onto the loginless client page. | Wrap in `{import.meta.env.DEV && <ReactQueryDevtools … />}` — one line, removes the reliance |
| F-16 | Production CSP `connect-src` allows `http://localhost:18923`–`18932` and their `ws://` forms (20 entries) | `vercel.json:23` | **Yes** (header on `/(.*)`) | ~~Low~~ | **REFUTED — main-loop review 2026-08-26.** These ports are the Companion app's local API, a production feature: the deployed site probes the inspector's locally-running companion service (`src/hooks/queries/useCompanionApp.ts:50` `PORT_START = 18923`; `src/types/companion.ts` documents 18923–18932). The migration runbook's live verification recorded the port probe as expected production behaviour, and the 2026-08 audit skipped `upgrade-insecure-requests` for the same reason. The "visitor's own localhost" reach is the accepted cost of the feature. | **None — do not remove.** Narrowing the header to app routes that actually use the Companion (e.g. excluding `/share/*`) is possible future polish, not a fix. |
| F-17 | CSP `object-src 'self' https://*.supabase.co blob:` | `vercel.json:23` | Yes | Low | `object-src` should be `'none'` unless plugins are needed; `blob:` there is a mild XSS-escalation aid. Likely inherited from PDF embedding. | Tighten to `'none'` if PDF viewing does not use `<object>`/`<embed>`; verify before changing |
| F-18 | Window globals `window.__THREE__`, `window.__reactRouterVersion` | `three.module`, `react-vendor` | Yes | Info | Vendor version/dedup markers. No app state on `window`. `ClientSharePage.tsx` touches no `window`, `console`, `localStorage` or `sessionStorage`. | none |
| F-19 | HTML comment: "CSP is handled by Vite server headers… For production deployment, configure CSP at the web server/CDN level" | `dist/index.html` | Yes | Info | Mildly informative (tells a reader CSP is edge-configured) and now **stale** — CSP *is* configured at the edge in `vercel.json`. | Optional: update or drop the comment |
| F-20 | Auth stack initializes on the share route | `src/App.tsx:146,158` (`/share/:token` nested inside `<AuthProvider>`); `src/auth/auth-manager.ts:83` constructor sets `initPromise = this.initialize()`; `auth-supabase.ts:25` calls `sb.auth.getSession()` | **Yes** | Info | The share *route* is outside `ProtectedRoute` and outside `Layout`, but inside `AuthProvider` — so visiting a share link boots GoTrue, reads the auth storage key and registers an `onAuthStateChange` listener. For a visitor with no stored session `getSession()` is a local read that returns `null` with **no network call and no credential transmitted**. It is wasted work and a latent coupling, not a leak. | Removed entirely by a separate HTML entry (§4) |

---

## 3. Bundle content surface (what the wire format actually ships)

Source of truth: `src/components/clientShare/bundle-types.ts` (format) and
`bundle-builder.ts:460-535` (manifest construction) / `:96-193` (sanitisation).

**`ShareManifest`** → `formatVersion`, `revision`, `publishedAt`, `preparedBy` (the fixed
`"Matrix Advanced Inspections"` line), `project`, `publishedLayers`, `vessels`.

**`ShareManifestProject`** → `name`, `number?`, `client?`, `location?`.
Customer-identifying by intent — this is the report header the client is meant to read.

**`ShareManifestVessel`** → `id`, `name`, `tag?`, `type?`, `modelPath`, `screenshotPath?`,
`bookmarks[]`, `stats[]`, `rollup`, `wallLoss?`.

**`ShareStatRow`** (WIP addition, 2026-08-25) → `key`, `label`, `targetPct?`, `achievedPct`,
`deltaPct?`, `status`, `rbaPct?`, `totalMm2?`, `targetMm2?`, `achievedMm2?`, `targetAuto?` — all numbers.

**`ShareWallLoss` / `ShareWallLossBody` / `ShareWallLossBin`** (WIP addition) → `nominalThickness`,
`binMode`, `binNames?`, per-body `bins[]` with `minPct/maxPct/minMm?/maxMm?/label?/area/areaPercent/count`,
`totalScannedArea`, `totalDataPoints`, `spurious*`. All numbers plus publisher-typed bin names.

### The one thing worth flagging

**`ShareManifestVessel.id` is `project_vessels.id`** — a live internal database UUID, shipped to the
client and used as a route key. `bundle-types.ts:208` acknowledges this ("opaque to the client, used
only as a route key"). It is an opaque v4 UUID, it is not guessable in the other direction, and every
table that references it is RLS-protected, so possessing it grants nothing. **Assessment: acceptable
as-is.** If the platform ever wants defence in depth here, the fix is a per-bundle synthetic vessel
key rather than the DB id — but that is a format change and not worth a version bump on its own.

Beyond that: **no organization id, no user id, no created_by, no email, no inspector name** appears
anywhere in the format. The `ShareSourceVessel` input carries no such fields either, so there is
nothing for the builder to leak.

### What the sanitiser removes (verified in source)

- Unpublished layer categories are **emptied, not hidden** (`bundle-builder.ts:164-171`) — a client
  cannot toggle their way to something unpublished because it is not in the file.
- `note` and `techniqueOther` are deleted from every coverage rect **unconditionally**, regardless of
  layer choices (`stripRectGuidance`, `:106-113`) — the one place free text could carry a name, a rate
  or an internal comment.
- Every `visible` flag is stripped from all layer-gated collections plus appendages (`:129-140`).
- `referenceDrawings` is set to `[]` (`:190`) — internal source documents, never published.
- Thickness grids ride through untouched (by design: the client sees the millimetre the inspector read),
  quantised for size.

### What `bundle-exclusions.test.ts` pins (5/5 passing on the WIP tree)

Runs the **worst case** — every layer ticked — and greps the real wire JSON:

1. No rect note text (`Jane Roe`, `07700 900000`, `ask Dave`) anywhere.
2. No `note` or `techniqueOther` **key** anywhere.
3. No `visible` key anywhere, though both fixtures were hidden.
4. No `created_by`, `createdBy`, `user_id`, `userId`, `organization_id`, `organizationId`, `email`,
   `inspector`, `profile` key anywhere.
5. Positive control — `Shell band A`, `Pitting cluster`, `Knockout Drum` *are* present, so the sweep
   cannot pass by publishing nothing.

**Gap between test and format (small, and not a defect):** the fixture uses
`project: { name: 'Karstoe 2026' }` only, so `project.client` / `project.location` / `project.number`
are never exercised. Those are by-design header fields, so there is nothing to assert about them
beyond "they ship" — but a reviewer should know the sweep does not currently touch them. The WIP
`stats` and `wallLoss` additions are numeric and correctly covered by the key-name assertions.

---

## 4. Response-header surface

### `vercel.json` — verified correct

The `X-Robots-Tag` block added today is **correctly placed and correctly patterned**:

```
headers[0]: source "/share/(.*)"  → X-Robots-Tag: noindex, nofollow
headers[1]: source "/(.*)"        → CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
                                     Referrer-Policy, Permissions-Policy
```

Vercel applies **all** matching `headers` entries, and the two blocks set **disjoint keys**, so there
is no override risk: a request to `/share/abc123` receives the noindex header *and* the full security
header set. Ordering is not load-bearing here. Confirmed correct, not missing.

Two small notes:

- `/share/(.*)` matches `/share/abc123` and `/share/` but **not** bare `/share`. The route is
  `/share/:token`, so a token is always present — a bare `/share` is a 404-ish SPA fallback with no
  bundle content. Not worth changing.
- The CSP is share-compatible: `connect-src` includes `https://*.supabase.co`, which is what
  `client-share-client.ts` POSTs to. `frame-ancestors 'none'` + `X-Frame-Options: DENY` means a share
  page cannot be embedded in a third-party frame — good. `default-src 'none'` is a strong baseline.
  The two weaknesses are F-16 (localhost ports) and F-17 (`object-src`), both above.

### `serve-client-share` responses — verified

`supabase/functions/serve-client-share/index.ts:218-229` sets, on success:

- `Content-Type` from the object extension
- `Cache-Control: private, no-store` for the **manifest** (the entry request) and
  `private, max-age=3600` for **assets** — correct: `private` keeps shared caches out, and the
  no-store manifest means a revoke takes effect on the next reload rather than being masked by cache.
- `X-Content-Type-Options: nosniff`
- `X-Share-Revision: <n>` — reveals the revision count, but only to a caller who already passed the
  token (and passcode) gate. Not a leak.

**No `X-Robots-Tag` on these responses** — and none is needed: they are `POST`-only JSON/binary
payloads, not crawlable documents (`index.ts:110` returns the generic 404 for any non-POST method,
so a crawler issuing `GET` gets nothing).

**CORS is origin-restricted, not wildcard** (`supabase/functions/_shared/cors.ts`): allowed origins are
`https://matrixportal.io`, `https://www.matrixportal.io` and localhost dev ports; anything else gets
`Access-Control-Allow-Origin: ''`. So a third-party site cannot fetch a bundle from a victim's browser
even if it somehow learned a token. Good.

The rest of the function matches its documented design and I found nothing to contradict it:
byte-identical 404 for nonexistent/revoked/expired (`:58-63`, `:165-172`), `passcode_required` /
`passcode_invalid` as 401s with hard rate limiting (`:174-192`), path containment before storage access
(`:195-201`), salted IP hashing and a coarse UA family for the audit row (`:74-97`), and bytes proxied
rather than signed URLs so the bucket stays unreachable (`:203-229`).

---

## 5. ⚠ The separate-HTML-entry decision

### What it would remove from the anonymous surface

A second Vite input (e.g. `share.html` → a share-only React root) plus a routing exclusion in the
rewrite rule would remove, for anonymous share visitors:

| Removed | Raw | Gzip |
| --- | ---: | ---: |
| `index-DboG8o_B.js` (SPA entry: routes, roles, table/RPC/function names) | 228.20 kB | 56.20 kB |
| `supabase-vendor-a83sF5pH.js` (auth + DB client) | 163.29 kB | 41.03 kB |
| `index-Cu_xErKf.css` (whole-app stylesheet) | 156.91 kB | 27.27 kB |
| `index-Bcu6C0PV.js` + `LoadingSpinner-C4QvyMtF.js` | 1.33 kB | 0.77 kB |
| **Total** | **549.73 kB** | **125.27 kB** |

Qualitatively it would also close **F-04, F-05, F-15 and F-20** outright: no route table, no role/table/
function vocabulary, no ungated devtools render, and no GoTrue instantiation on a loginless page. It
would make the chunk guard's documented caveat ("deliberately does NOT follow the edge into the SPA
entry chunk") obsolete — the guard could then assert the *whole* graph.

### What it would not fix

**F-07 stays.** Every file under `/assets/` remains publicly fetchable by URL, so the real email
addresses in `NotificationsTab` are still retrievable by anyone who walks the import graph from the
main app's `index.html`. Only removing those literals fixes that. Do not let the HTML-entry work be
sold as closing F-07.

### Recommendation

**Do it — but as planned platform work, not as a security fix, and not ahead of F-15/F-16.**

The reasoning:

- **Nothing currently exposed makes it urgent.** Everything the entry chunk leaks is a *name*. The
  actual boundaries — RLS, edge-function auth, the share token, the passcode — are all intact, and the
  bundle content itself is clean and test-pinned. Rated on exposure alone this is a **Low**, and it
  would be dishonest to present it otherwise.
- **The non-security case is stronger than the security case.** 125 kB gzip is a real cost on the one
  page most likely to be opened on a phone, on site, on bad signal, by a client who will judge the
  product by it. Halving the shell is a user-facing win. F-20 (booting an auth client on a loginless
  page) is also a latent-coupling smell that will keep generating audit questions until it is gone.
- **The cost is genuinely bounded** — a second `rollupOptions.input`, a share-only root component, and
  a rewrite-rule exclusion — but it is *not* free: it forks the CSS baseline (the share page currently
  free-rides on `main.css` design tokens and would need its own token subset), needs a second
  `index.html` kept in sync for meta/font/favicon, and requires the Vercel rewrite to route
  `/share/*` → `share.html` while everything else still goes to `index.html`. Budget a day, not an hour.
- **Sequencing:** land **F-15** (one line) first — after F-16's refutation (see the table and the
  addendum below) it is the only item here with an actual, if small, security delta. Then schedule the
  HTML entry as a share-page performance-and-isolation task, with the chunk guard extended to assert
  the full closure once the entry edge no longer needs excluding.

---

## 6. Honest limits

What this audit could **not** establish, and should not be read as covering:

1. **Live response headers were never observed.** Everything in §4 is read from `vercel.json` and the
   edge-function source. Vercel header-merge behaviour and the actual bytes on
   `https://matrixportal.io/share/<token>` were not fetched. **A `curl -I` against a real share URL
   should be run before this is considered closed** — in particular to confirm the new `X-Robots-Tag`
   block is deployed and that no platform default overrides `Cache-Control`.
2. **No runtime/browser verification.** F-20's "no network call for a visitor with no stored session"
   is derived from the code path (`getSession()` on empty storage returns `null` locally) and from
   supabase-js's documented behaviour — it was **not** confirmed by watching a devtools network tab.
   A real browser load of a share link would settle it.
3. **The edge function was audited as source, not as deployed.** Whether the version running on
   `ntrgjqrbewbvwofupphn` matches this file was not checked, and `--no-verify-jwt` was not re-verified
   against the live deployment.
4. **No live bundle was inspected.** The manifest/model field analysis is from the builder and the
   format module; no actual published `manifest.json` from Storage was fetched and read. A real bundle
   could in principle contain fields from an older format revision.
5. **Rate-limit efficacy untested.** `rate-limit.ts` is in-memory per edge instance; whether the
   `PASSCODE_RULE` budget actually holds across Deno isolates under concurrent load was not exercised.
   Worth a separate look if passcode brute-force is in the threat model.
6. **WIP tree, concurrent edits.** This is an uncommitted working tree with two other agents editing
   `src/components/auth`, `src/hooks` and `supabase/functions` during the audit window. The build,
   `verify:share-chunk` and the exclusion test all passed against the snapshot taken at the start, but
   files in those three areas may have changed after. Re-run all three gates before merge.
7. **Third-party chunk contents were characterised, not read.** `plotly.min` (4.58 MB) and
   `pdf.worker` were pattern-scanned, not reviewed. Neither is loaded by the share page.

---

## 7. Main-loop review addendum (2026-08-26, Fable)

Disposition of the report's findings after design review:

- **F-16 REFUTED, no change made.** The localhost CSP entries are the Companion app's production
  port range, verified against `useCompanionApp.ts` / `types/companion.ts` and the migration
  runbook's live checks. The finding's premise ("no production purpose") was wrong; the row above is
  annotated accordingly. Nothing was removed from `vercel.json`.
- **F-15 ACCEPTED.** The `ReactQueryDevtools` gate (`{import.meta.env.DEV && …}`) will be applied to
  `App.tsx` after the parallel 2FA-enrollment agent finishes its own `App.tsx` wiring, to avoid a
  concurrent-edit collision; it rides the same verification gate.
- **Limit #1 partially closed same day.** `Invoke-WebRequest -Method Head` against
  `https://www.matrixportal.io/share/probe-check` returned HTTP 200 with the live CSP
  (`default-src 'none'; script-src 'self'; …`), HSTS (`max-age=63072000; includeSubDomains;
  preload`), `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` — and **no
  `X-Robots-Tag`**, which is expected: the noindex block was added to `vercel.json` today and is not
  yet deployed. Re-probe after the next production deploy to confirm noindex; `Cache-Control` was
  not captured and stays open.
- **F-17 (`object-src`) deferred** pending verification of whether PDF viewing uses
  `<object>`/`<embed>` — scheduled with the Phase 5 residual backlog, not changed blind.
- **F-07 (contact emails in `NotificationsTab`)** accepted as Low; moving the literals to config is
  backlog polish.
- **Separate-HTML-entry recommendation adopted as framed**: platform/performance work, queued behind
  the Phase 1 auth hardening, not treated as a security fix.
