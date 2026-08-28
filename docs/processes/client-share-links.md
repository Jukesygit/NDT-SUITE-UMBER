# Client Share Links

**Owner:** Jonas · **Last reviewed:** 2026-08-26

Operating the loginless published-report feature: publishing a link for a client, revoking it,
restoring it, deleting it permanently, and the housekeeping that happens automatically.

Design: `docs/plans/2026-08-17-client-sharing-design.md` · Exposure review:
`docs/plans/2026-08-26-share-exposure-report.md`

---

## Purpose

A client share link publishes a **frozen snapshot** of one or more vessel models to a URL that needs no
login: `https://www.matrixportal.io/share/<token>`. Anyone holding the URL (and the passcode, if one is
set) sees the report. This is the only anonymous surface in the product, so the operational rules
around it are stricter than anything else.

Three things that look similar and are not:

| Action | Effect | Reversible | Bundle files |
|---|---|---|---|
| **Revoke** | Stamps `revoked_at`; link stops serving | **Yes** — Restore clears the stamp | Kept |
| **Delete** | Row and all bundle objects removed | **No** | Destroyed |
| **Prune** | Automatic housekeeping of superseded revisions | n/a | Old revisions only |

The UI must not blur them, and neither should you when talking to a client. "Revoked" is a decision you
can undo; "deleted" is not.

---

## Prerequisites

- Signed in with rights over the project: the share's creator, or `editor` / `org_admin` / `admin` /
  `super_admin` in the same organisation (this is the shape of the storage DELETE policy in migration
  `20260821140000`).
- The vessel models to publish are **saved** — the bundle is built from the stored model, so unsaved
  modeler edits do not ship.
- Backend deployed: migrations `20260820120000_client_shares.sql` and
  `20260821140000_client_share_storage_delete.sql` applied, `serve-client-share` deployed
  `--no-verify-jwt`, `CLIENT_SHARE_IP_SALT` set. All live on `ntrgjqrbewbvwofupphn` since 2026-08-20.

---

## Steps

### Publish

1. Open the project → **Share with client**.
2. **Choose layers.** Layer ticks are the publish intent. **Exclusion is removal, not hiding** — an
   unticked layer's entities are deleted from the serialized model, so they are not in the file the
   client downloads. Rect `note` and `techniqueOther` fields are stripped **unconditionally**,
   regardless of ticks (hard-coded, not options).
3. **Set an expiry.** Default **90 days**; a "never" option exists
   (`src/utils/client-share-link.ts:31-39`). Prefer a real expiry — an unexpiring anonymous link is a
   permanent exposure.
4. **Set a passcode** if the report is sensitive. See below.
5. Publish. The dialog returns the URL; send that to the client.

What happens under the hood, in this order — **upload first, flip last**:

1. The bundle is built from the **sanitised** state; statistics are computed from the **full** state
   *before* sanitising, so publishing never changes a number.
2. The model file uploads as `vessels/<id>/model.json.gz` (gzip; grid values quantised to 4 dp —
   an *encoding*, not a decimation: resolution is unchanged and full-resolution grids ship).
3. Card screenshots are captured **best effort** — no WebGL or a failed readback means no screenshot,
   one warning, and the publish continues.
4. The manifest uploads **last** within the revision, then the row's `revision` flips.

That ordering means a **failed publish leaves the client's existing live link untouched**. It never
half-updates.

> A **re-publish** writes `rev-N+1` in full before bumping, then prunes. Grid rehydration is strict on
> this path: `loadVesselState` **throws** if any scan grid fails to fetch, because a bundle is the
> client's only copy and a share with missing heatmaps must not go out.

### Revoke (reversible)

Share list → the row → **Revoke**. Stamps `revoked_at`
(`src/services/client-share-service.ts:224`). The link stops serving immediately. Bundle files stay.

Use this as the default response to "take that link down" — it is instant and undoable.

### Restore

Share list → the row → **Restore**. Clears `revoked_at`
(`src/services/client-share-service.ts:236`). The same URL serves again.

**Revocation beats expiry** in status derivation (`client-share-link.ts:24-27`): a link that was pulled
reads `revoked` even after its expiry date has passed. Restoring a link whose expiry has since passed
gives you an `expired` link — extend the expiry as well if the client still needs it.

### Delete (permanent)

Share list → the row → **Delete** → confirm in the dialog. There is no undo.

> ### ⚠ The delete ordering is LOAD-BEARING — storage objects FIRST, row LAST
>
> `deleteClientShare` (`src/services/client-share-service.ts:444-452`) removes the storage objects and
> only then the row. This is not stylistic. The storage `DELETE` policy authorises an object via an
> `EXISTS` over its **owning row**. Delete the row first and every object underneath it becomes an
> orphan that **no authenticated session can ever remove** — only a service-role script could clean up.
>
> It throws on any error. A partial failure (objects gone, row alive) is a defined, retryable state:
> the link serves a dead bundle, which is no worse than revoked, and pressing Delete again finishes the
> job. `client_share_views` rows go with the row by `ON DELETE CASCADE`.
>
> Never reorder these two operations, and never add a "delete the row first, clean up storage later"
> optimisation.

### Prune (automatic)

Runs by itself after a **re-publish** — never on a first publish, and never on delete.

- Keeps the **latest two** revisions: the live one, plus one previous for a quick republish-restore
  (`revisionsToPrune`, `client-share-service.ts:469+`). Everything at `currentRevision - 2` or below is
  removed.
- Called **after** `bumpClientShareRevision`, so it sees the flipped revision.
- Wrapped in try/catch with a single warning: **a prune failure must never fail or delay a publish
  whose link is already live.** Stale `rev-N` folders are wasted storage, not a broken share.
- Folder names that are not exactly `rev-<digits>` are ignored rather than guessed at — its output
  feeds a recursive delete, so anything it cannot positively identify as superseded is left alone.
  `rev-0` is likewise ignored: revisions start at 1 per the table's CHECK constraint.

---

## Passcodes

- Set at publish time. The **hash** is stored (`client_shares.passcode_hash`); the passcode itself is
  never stored, never logged, and cannot be recovered. The UI shows only "passcode set"
  (`client-share-service.ts:53-54`).
- Format `pbkdf2$sha256$<iters>$<salt>$<hash>`. The browser side hashes
  (`src/utils/client-share-passcode.ts`), the Deno side verifies
  (`supabase/functions/serve-client-share/passcode.ts`). The two runtimes cannot import each other, so
  the duplication is held honest by a test that imports **both** and asserts each verifies the other.
  If you change one, change both and run that test.
- **Forgotten passcode → re-publish with a new one.** There is no reset.
- Send the passcode over a **different channel** than the link. A link plus its passcode in one email is
  one interception away from no passcode at all.

---

## Invariants — do not break these

**1. `serve-client-share` runs `--no-verify-jwt`.**

It is the one deliberately anonymous entry point (`serve-client-share/index.ts:5`). A plain
`supabase functions deploy serve-client-share` re-enables JWT verification and **instantly breaks every
share link in existence**. Correct command:

```bash
supabase functions deploy serve-client-share \
  --project-ref ntrgjqrbewbvwofupphn --no-verify-jwt
```

Never run a bare `supabase functions deploy` with no function name — it deploys everything, this one
included, without the flag. See `deploy.md`.

**2. Nonexistent, revoked and expired all return one byte-identical 404.**

By design (`serve-client-share/index.ts:15`, `:45`, `:60`). A client whose access was withdrawn must not
be able to tell "withdrawn" from "never existed" — that difference is an information leak about your
customers. `passcode_required` (401) is *deliberately* distinguishable, because the visitor legitimately
needs to know to type a passcode (`:20`, `:176`). Do not add a "this link was revoked" message.

**3. The function proxies bundle bytes; it does not issue signed URLs.**

That keeps the `client-shares` bucket unreachable from outside the function. Switching to signed URLs
changes that invariant and needs an explicit decision, not a refactor.

**4. `organization_id` and `bundle_path` are trigger-derived, never caller-supplied.**

`client_shares_derive_fields` discards a caller's values rather than validating them, so a share can
never point at another organisation or another share's objects.

**5. The share page ships no auth code.** `npm run verify:share-chunk` enforces it. Treat a red result
as possibly weeks old — it stayed red unnoticed from 2026-08-13 to 2026-08-25 — so check `git log`
before assuming your change caused it.

**6. `/share/*` is `noindex`.** `vercel.json` sets `X-Robots-Tag: noindex, nofollow` for `/share/(.*)`.
Share links must never enter a search index.

---

## Verification

**After any publish:**

1. Open the URL in a **private window** (no session). The report renders; if a passcode was set, it is
   demanded first.
2. Confirm the layers shown match what was ticked, and that nothing excluded is present.
3. Spot-check one number against the modeler — publishing must never change a statistic.

**After a revoke:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io/share/<token>   # page still loads (SPA)
```
The page loads; the *data* call 404s and the page shows the single withdrawn/not-found message. Confirm
in a private window that no report content renders.

**After any `serve-client-share` deploy — mandatory:**

```bash
# A real live share must still serve unauthenticated
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/serve-client-share/<live-token>"
```
`401` here means `--no-verify-jwt` was lost. Redeploy with the flag immediately.

**Byte-identical 404 gate:**

```bash
for t in definitely-not-a-token <revoked-token> <expired-token>; do
  curl -s "https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/serve-client-share/$t"; echo
done
```
All three responses must be identical, character for character.

**Bucket privacy and anon grants** (dashboard SQL editor):

```sql
select id, public from storage.buckets where id = 'client-shares';       -- public must be false
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('client_shares','client_share_views');             -- 'anon' must not appear
```

**Test suites** covering the rules above:

```bash
npm run test -- client-share            # deletion ordering, passcode cross-runtime, prune rule
npm run test -- bundle-exclusions       # greps the emitted bundle bytes for excluded content
npm run build && npm run verify:share-chunk
```

---

## Escalation / when it goes wrong

| Symptom | Cause | Action |
|---|---|---|
| **Every** share link 401s | `serve-client-share` redeployed without `--no-verify-jwt` | Redeploy with the flag; re-probe a live link. Not a breach |
| One link 404s unexpectedly | Revoked, expired, or deleted | Check the row's `revoked_at` / `expires_at`. Restore, or extend expiry, or re-publish |
| Link shows content the client should not see | Layer ticks or sanitisation defect | **Revoke immediately**, then investigate. If personal data is involved → `incident-response.md` |
| Client says the passcode does not work | No recovery path exists | Re-publish with a new passcode; send it on a separate channel |
| Publish fails partway | By design | The client's existing link is untouched. Retry |
| Delete fails partway | Objects gone, row alive | Retryable — press Delete again. The link meanwhile serves a dead bundle, equivalent to revoked |
| Storage growing unexpectedly | Prune failed silently after a re-publish | Check for a prune warning; superseded `rev-N` folders can be removed by re-publishing or manually |
| `verify:share-chunk` red | Auth/editor code reached the loginless bundle | Check `git log` first — see invariant 5 |
| Share URL found in a search engine | `X-Robots-Tag` missing or the link was posted publicly | Revoke, verify the header, re-publish a fresh token |

A share that exposed the wrong client's data is a **personal-data incident** — run
`incident-response.md` and record it in `docs/breach-register.md`, not just this checklist.

Related: `deploy.md` (the `--no-verify-jwt` rule) · `incident-response.md` · `auth-and-roles.md`.
