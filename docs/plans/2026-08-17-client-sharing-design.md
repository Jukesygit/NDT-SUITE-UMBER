# Client Sharing Design (Loginless Published Snapshots)

- **Date:** 2026-08-17
- **Status:** Design locked (wayfinder tickets [#13](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/13), [#14](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/14), [#15](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/15), [#16](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/16), map [#6](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/6)); implementation not started.
- **Companion specs:** `2026-08-13-layers-system-design.md` (layer vocabulary), `2026-08-17-coverage-comparison-design.md` (stats the bundle carries).

## Architecture (locked at charting)

Sharing is an **explicit publish act producing an immutable snapshot bundle**, served to a loginless client through **one token-validating edge function**. The client page never reads the database — directly or by proxy. A live DB path (edge-function query proxy) was explicitly considered and **rejected** (#14): it converts a static file server into an anonymous query API over production data (validation/enumeration/injection surface, schema-change leak risk) and breaks the published-deliverable model. Post-audit posture holds: **no RLS escape hatches; production tables are never reachable from an unauthenticated context.**

Share unit = **project**. Clients see exactly what was published, never WIP; updates require re-publishing.

## Security model (#15)

- **Token:** 128-bit unguessable opaque id in the URL path. Backed by a `client_shares` row:
  `{ token/id, project_id, bundle_path, expires_at, revoked_at, passcode_hash?, created_by, created_at }`.
  Not a JWT — revocation needs state anyway; the row gives revocation + audit + listing in one primitive.
- **Lifecycle:** default 90-day expiry, selectable at publish (30/90/365/none); revocable any time from the project page; re-publish updates the bundle behind the same link.
- **Passcode:** optional per share, hashed; attempts rate-limited.
- **Serving:** ONE edge function is the only anonymous entry — validates token → expiry → revocation → passcode → serves assets from a **private** bucket prefix. Per-IP rate limiting. Service-role access scoped to exactly one table + one storage prefix.
- **`client_shares` RLS:** org-scoped for authenticated management (create/list/revoke); the edge function's service-role read is the sole anonymous path.
- **View audit:** successful views log to the activity trail — share id, timestamp, coarse user-agent, hashed IP ("viewed 3× this week" without PII harvesting).

## Bundle format (#14)

`client-shares/<shareId>/rev-<N>/` in the private bucket:

- `manifest.json` — project meta, vessel list, publish-time layer selection, per-feature stats tables (targets/achieved/status + rollups), revision info.
- Per vessel: serialized model JSON (same spec-serialization as saves) · pre-baked heatmap textures (`textures/*.png`, from the publishing browser session) · **decimated thickness grids** (`grids/*`, downsampled — powers client hover readouts) · publish-time screenshots (vessel cards) · camera bookmark poses.
- **Never included:** rect planning notes (#8), inspector identities, personnel data, any PII (hard-coded exclusions — not toggles).

**Revisioning:** each publish writes `rev-N+1`; the link serves the latest; prior revisions are kept as the audit trail. Publish dialog shows "Rev N · published <date>".

## Publish flow (#14)

"Share with client" on `ProjectDetailPage` → dialog:
1. Vessels included (those with linked models).
2. Layer picker — defaults ON: model, planned coverage, achieved heatmaps, stats; OFF: annotations, inspection images.
3. Expiry select (default 90 days) + optional passcode.
4. Publish: bakes/bundles client-side from the current saved state, uploads to the next `rev-N`, mints/updates the `client_shares` row, presents the link.

## Client page (#16)

- **Route:** public `/share/:token` — **its own lazy chunk that never imports `VesselModeler.tsx` or auth** (#13 chunk-separation; the viewport/engine path is verified auth-clean). Passcode gate first when required.
- **Chrome:** minimal branded header (logo · project name · "Prepared by Matrix Advanced Inspections" · revision + publish date); no app navigation; footer contact line.
- **Structure:** landing lists the project's vessels as cards (screenshot + achieved-vs-target rollup chip) → vessel view: full-bleed `ReadOnlyViewport` with layer toggles **limited to published layers**, camera-bookmark shortcuts, hover thickness tooltip (decimated grids), per-feature stats table.
- **Mobile:** fully responsive; touch orbit; table stacks; nothing hidden on small screens.
- **Edge states:** expired / revoked / nonexistent tokens all render the same friendly "This link is no longer active — contact your Matrix representative" (no state leakage); wrong-passcode messaging with rate-limit awareness; progressive bundle loading.
- **Non-goals:** no raw-bundle download, no PDF export (reports remain their own deliverable), no client annotations/comments.

## Viewer dependency (#13)

`ReadOnlyViewport` — the new thin component (see #13 resolution): `{ vesselState, textureObjects, layers, initialPose?, onHover? }`, composed from `SceneManager`, `buildVesselScene`, texture placement fns, label builders, camera animation, structural-hash + settled-snapshot gating, with a new orbit+hover-only pointer handler. The client page hydrates `vesselState`/textures/grids from the bundle and passes the published layer mask.

## Invariants

- The edge function is the **only** unauthenticated entry; the bucket prefix is never publicly readable.
- PII exclusions are hard-coded at bundle-build time, not publish-dialog options.
- Token comparison constant-time; expired/revoked/nonexistent responses indistinguishable.
- The client chunk's import graph contains no supabase-auth, no editor code (enforceable by a bundle-analysis check).

## Out of scope

Live client views · client commenting/annotations · PDF/report export from the client page · per-vessel share links (ride later on the same bundle) · bundle cleanup automation · client-view analytics beyond the activity-trail log.

## Amendment (2026-08-20, implementation rulings — binding)

**Bundle contents: decimated grids only, no pre-baked PNGs.** The spec listed both "pre-baked heatmap textures" and "decimated thickness grids". The read-only viewport already builds its heatmaps from a composite's `data` (a canvas bake, no renderer needed), so a bundle carrying decimated grids inside the serialized model gives the client BOTH the heatmap and the hover readout from one artifact. Pre-baking PNGs as well would have required a headless GL capture at publish time plus a new "externally supplied texture" path through `ReadOnlyViewport` — i.e. the viewer diverging from the modeler for no gain. Decimation is **min-pooled**, so a coarser published grid can never hide a thin spot.

**Publish-time screenshots are not implemented.** `ShareManifestVessel.screenshotPath` exists and the viewer honours it; nothing captures one yet, and the landing page falls back to typographic cards. Adding capture later needs no format change.

**PII exclusions, as implemented:** an unpublished layer's entities are REMOVED from the serialized model (not hidden), and coverage-rect `note` + `techniqueOther` are stripped unconditionally. The `technique` enum survives — it is a closed vocabulary and it is what makes a published coverage plan legible. `referenceDrawings` are never published.

**Chunk separation, honestly scoped.** The share page's own static closure contains no auth, no supabase-js and no editor code, and `npm run verify:share-chunk` enforces it after a build. The SPA **entry** chunk loads on every route, including `/share`, and does contain auth — that is inherent to a single-entry SPA and would need a separate HTML entry point to change. Scar: a dynamic `import()` in the share page made Vite place its preload helper in the supabase-vendor chunk, pulling supabase-js into the logged-out page; the page's imports are static for that reason.

**Ordering:** a re-publish uploads rev-N+1 in full BEFORE bumping the row, so a failed publish leaves the client's live link serving the previous revision; within a revision the manifest uploads last, so a partial upload reads as a dead link rather than a half-published project.

## Verification plan (implementation gate)

- `npm run build`, `npm run test`, `npm run lint`.
- Security-behavioral: revocation takes effect on the next request; expired/revoked/nonexistent are byte-identical responses; passcode brute-force hits the rate limit; the bucket rejects direct unauthenticated reads; a published bundle contains no `note` fields, no personnel identifiers (automated grep over a test bundle); the `/share` chunk's module graph excludes auth/editor modules; token entropy ≥128 bits.
- UX: a published project renders on mobile; hover shows thickness from decimated grids; only published layers appear as toggles.
