---
tags:
  - security
  - database
  - aal2
  - investigation
aliases:
  - Legacy Table Investigation
---

# Legacy Table Investigation — the nine unpoliced `public` tables

**Date:** 2026-08-27
**Trigger:** a live schema dump of production (eu-west-2 `ntrgjqrbewbvwofupphn`) found 44 `public` tables, nine of which sit outside every current design discussion *and* outside the parked aal2 enforcement migration's policed set.
**Suspicion under test:** Data-Hub-era leftovers (feature removed 2026-02-06, commit `fe0f1bf`).
**Method:** schema-only dump (`npx supabase db dump -s public`, no data), plus code grep over `src/`, `supabase/functions/`, `companion/`, plus `git log -S` archaeology. **No row counts were taken** — those arrive via the nightly `db_state_snapshots` ledger and are the precondition for the drop recommendations below.

---

## 1. Headline

**The suspicion is confirmed, with one correction and two findings the brief did not anticipate.**

- All nine are **Data-Hub-era leftovers**. They form one coherent, self-contained schema family (`assets → vessels → {inspections, scans, strakes, vessel_images}` plus `shared_assets` / `asset_access_requests` / `sync_metadata`), all with `text` primary keys, and **no current-era table has a foreign key into any of them**.
- Every one of the nine is **RLS-enabled with sane, org-scoped, NULL-safe policies**. **Nothing here is `anon`-reachable.** No table earns an UNSAFE verdict.
- **Correction to the brief's premise:** the risk is *not* primarily the nine tables. It is the **eight legacy `SECURITY DEFINER` RPCs** that read them. Those bypass RLS by construction, so adding the nine tables to the aal2 policed set **would not close the bypass** — the aal2 migration is explicitly `TO authenticated`, and its own comment (line 361) notes that `SECURITY DEFINER` functions are untouched. This is the finding that matters.
- **Correction to repo docs:** `CLAUDE.md` lists "`inspection_projects` / `vessels` / `scans`" as key tables. `vessels` and `scans` are the **legacy** era. The live equivalents are `project_vessels` and `scan_composites`. The doc is half-stale and actively misleading. See §3.

**Nothing in this report requires an emergency change.** The two recommended actions are (a) a doc correction, and (b) a drop migration gated on a zero-row confirmation.

---

## 2. Verdict table

Verdicts: **LIVE** = used by current code, must join the aal2 policed set. **DORMANT** = RLS'd, unreferenced, drop candidate after a row-count check. **UNSAFE** = reachable with weak/no RLS, needs attention regardless of aal2.

| Table | Verdict | RLS | Policies | Referenced by live code? | PII shape |
|---|---|---|---|---|---|
| `assets` | **DORMANT** | on | 4 (SELECT/INSERT/UPDATE/DELETE) | No `.from()`. Nullify-only in 2 GDPR fns† | `created_by` → `auth.users`; org data |
| `vessels` | **DORMANT** | on | 4 | No | Client asset data; `ga_drawing`/`location_drawing` jsonb |
| `scans` | **DORMANT** | on | 4 | No | Inspection measurement data (`data` jsonb, `data_url`) |
| `strakes` | **DORMANT** | on | 4 | No | None direct |
| `vessel_images` | **DORMANT** | on | 4 | No | Site photographs (incidental PII plausible) |
| `inspections` | **DORMANT** | on | 4 (all `TO authenticated`) | No `.from()`. Nullify-only in 2 GDPR fns† | `inspector_id` → `auth.users`; free-text `notes` |
| `shared_assets` | **DORMANT** | on | 4 (writes admin-only) | No `.from()`. Delete-only in 2 GDPR fns† | `shared_by` → `auth.users` |
| `asset_access_requests` | **DORMANT** | on | 3 (**no DELETE policy**) | No `.from()`. Delete+nullify in 2 GDPR fns† | 3× `auth.users` FKs, free-text `message` |
| `sync_metadata` | **DORMANT** | on | 4 (all `user_id = auth.uid()`) | No | `user_id` → `auth.users`, `device_id` (per-user device tracking) |

† These are **table-name strings inside a data-driven cleanup list** in the GDPR erasure edge functions, not feature code. They are already tolerant of the tables being absent — see §6. They do **not** make a table LIVE.

**No table is LIVE. No table is UNSAFE.** All nine are DORMANT.

---

## 3. The era question — which names are live?

This overturns part of the repo's own documentation, so it is worth stating precisely.

The two eras are trivially separable by primary-key type and FK shape:

| | Legacy era (Data Hub) | Live era |
|---|---|---|
| Root | `assets` (`id text`) | `inspection_projects` (`id uuid`) |
| Vessel | `vessels` (`id text`, `asset_id text`) | `project_vessels` (`id uuid`, `project_id uuid`) |
| Scan | `scans` (`id text`, `vessel_id text`) | `scan_composites` (`id uuid`) |
| Images | `vessel_images` (`id text`) | `project_images` |
| Model | — | `vessel_models` (`id uuid`, `project_vessel_id uuid`) |

Evidence, live dump:
- `assets` — `"id" "text" NOT NULL`, comment *"Stores top-level assets (structures being inspected)"*.
- `vessels` — `"asset_id" "text" NOT NULL`, comment *"Stores vessels/components within assets"*.
- `project_vessels` — `"id" uuid DEFAULT gen_random_uuid()`, `"project_id" uuid NOT NULL`, comment *"Individual vessel inspections within a project, linked to 3D models and scan composites"*.

Decisive code evidence — the complete inventory of `.from()` targets across `src/` and `supabase/functions/` contains **`project_vessels` (7), `scan_composites` (13), `inspection_projects` (5), `vessel_models` (8), `project_images` (5)** and **zero** occurrences of `assets`, `vessels`, `scans`, `strakes`, `vessel_images`, `inspections`, `shared_assets`, `asset_access_requests` or `sync_metadata`.

> **Action:** `CLAUDE.md` § "Key Database Tables" says *"`inspection_projects` / `vessels` / `scans` — Inspection workflow"*. `inspection_projects` is correct; `vessels` and `scans` name **dead legacy tables**. Correct to `inspection_projects` / `project_vessels` / `scan_composites`. Left as-is, this line will keep re-seeding the exact confusion that prompted this investigation.

---

## 4. Live schema facts

### 4.1 Structure and containment

All nine have RLS enabled — as does **every one of the 44 live tables** (verified: the count of `ENABLE ROW LEVEL SECURITY` statements equals the count of `CREATE TABLE` statements, 44 = 44).

The FK graph is **entirely self-contained**. Every foreign key on the nine points either at another of the nine, at `organizations`, or at `auth.users`:

```
assets.organization_id        → organizations(id) ON DELETE CASCADE
assets.created_by             → auth.users(id)    ON DELETE SET NULL
vessels.asset_id              → assets(id)        ON DELETE CASCADE
inspections.vessel_id         → vessels(id)       ON DELETE CASCADE
inspections.inspector_id      → auth.users(id)    ON DELETE SET NULL
scans.vessel_id               → vessels(id)       ON DELETE CASCADE
scans.strake_id               → strakes(id)       ON DELETE SET NULL
strakes.vessel_id             → vessels(id)       ON DELETE CASCADE
vessel_images.vessel_id       → vessels(id)       ON DELETE CASCADE
shared_assets.{owner,shared_with}_organization_id → organizations(id) ON DELETE CASCADE
shared_assets.shared_by       → auth.users(id)
asset_access_requests.{user,owner,user_organization}_id → organizations/auth.users
sync_metadata.user_id         → auth.users(id)    ON DELETE CASCADE
```

**No current-era table references any of the nine, and none of the nine references a current-era table.** The family can be dropped as a unit without touching the live schema. `assets` is the single root — `DROP TABLE assets CASCADE` would take `vessels`, and transitively `inspections`/`scans`/`strakes`/`vessel_images`, via the cascade chain.

### 4.2 Triggers

Only `update_updated_at_column()` housekeeping, on `assets`, `scans`, `shared_assets`, `strakes`, `vessels`. No audit triggers, no `set_created_by`, nothing that writes elsewhere. `inspections`, `vessel_images`, `asset_access_requests` and `sync_metadata` carry no triggers at all.

Note the absence of `audit_row_change()` — these tables are **not** in the activity-log audit trail, which is itself corroborating evidence that they were abandoned before that system was built.

### 4.3 Grants

Every one of the nine carries the Supabase stock grant set:

```sql
GRANT ALL ON TABLE "public"."<t>" TO "anon";
GRANT ALL ON TABLE "public"."<t>" TO "authenticated";
GRANT ALL ON TABLE "public"."<t>" TO "service_role";
```

`GRANT ALL … TO anon` looks alarming and is worth stating plainly: **it is the Supabase default for every table in `public`, and it is not by itself a vulnerability** — RLS is the gate, and RLS is on. The relevant question is whether the *policies* admit `anon`. They do not (§5).

---

## 5. RLS risk read

### 5.1 Are these `anon`-reachable? No.

Seven of the nine have policies with **no `TO` clause**, which defaults to `TO public` — i.e. the policy is evaluated for `anon` as well as `authenticated`. That is the shape that would normally warrant alarm. It does not here, because every predicate is rooted in `auth.uid()` and **NULL-propagates to a non-true result** for an anonymous session.

`assets` SELECT — the canonical shape, quoted in full:

```sql
CREATE POLICY "Users can view accessible assets" ON "public"."assets" FOR SELECT USING (
  (( SELECT "profiles"."organization_id" FROM "public"."profiles"
      WHERE ("profiles"."id" = "auth"."uid"()))
     IN ( SELECT "organizations"."id" FROM "public"."organizations"
           WHERE ("organizations"."name" = ANY (ARRAY['SYSTEM'::text, 'Matrix'::text]))))
  OR ("organization_id" = ( SELECT "profiles"."organization_id" FROM "public"."profiles"
                             WHERE ("profiles"."id" = "auth"."uid"())))
  OR ("id" IN ( SELECT "shared_assets"."asset_id" FROM "public"."shared_assets"
                 WHERE ("shared_assets"."shared_with_organization_id"
                        = ( SELECT "profiles"."organization_id" FROM "public"."profiles"
                             WHERE ("profiles"."id" = "auth"."uid"()))))));
```

For `anon`, `auth.uid()` is NULL → each sub-select returns no row → NULL. `NULL IN (…)` is NULL, `organization_id = NULL` is NULL, `id IN (SELECT … = NULL)` is NULL. `NULL OR NULL OR NULL` is NULL, which is not `true`, so the row is filtered. **Zero rows for `anon` on all three disjuncts.** `vessels`, `scans`, `strakes` and `vessel_images` reuse this exact shape one or two joins deeper (`scans`/`strakes` join `vessels → assets`; `vessels` joins `assets`).

`sync_metadata` is the tightest of the nine — all four policies are literally `("user_id" = "auth"."uid"())`, which is NULL-safe by inspection.

`inspections` is the only one scoped explicitly:

```sql
CREATE POLICY "inspections_select_policy" ON "public"."inspections"
  FOR SELECT TO "authenticated" USING ("public"."user_can_access_vessel"("vessel_id"));
```

`shared_assets` routes through the modern SECURITY DEFINER helpers, matching current-era style:

```sql
CREATE POLICY "Users can view relevant shares" ON "public"."shared_assets" FOR SELECT USING (
  (("public"."auth_is_admin"() = true)
   OR ("owner_organization_id" = "public"."auth_user_org_id"())
   OR ("shared_with_organization_id" = "public"."auth_user_org_id"())));
```

Writes on `shared_assets` are admin-only (`auth_is_admin() = true` on INSERT/UPDATE/DELETE).

**Conclusion: no anon exposure, no weak-RLS finding, no UNSAFE verdict.** These policies are of the same quality as the live-era ones.

### 5.2 The genuine aal2 concern — and why table policies would not fix it

Two distinct exposures, and they need separating.

**(a) Table-level, conditional on rows.** The policies above admit an **authenticated** session freely. A password-only (aal1) session in the right organisation — or in an org named `SYSTEM` or `Matrix`, which the first disjunct grants a **cross-organisation read of every asset, vessel, scan, strake and image in the database** — passes them today and would keep passing after the aal2 migration is un-parked, because the nine are not in its policed set. If these tables hold rows, that is a real aal2 bypass. **If they are empty, it is a theoretical one.** This is precisely why the row-count gate below is the precondition for everything.

**(b) RPC-level, unconditional, and not fixed by adding the tables to the aal2 set.** This is the finding the brief did not anticipate.

Eight legacy RPCs read this family, **all `SECURITY DEFINER`, all owned by `postgres`, all `GRANT ALL … TO anon` *and* `TO authenticated`**:

| Function | Guarded? |
|---|---|
| `get_accessible_assets()` → `SETOF public.assets` | no explicit check; safe only by NULL-propagation |
| `get_asset_hierarchy(p_asset_id text)` → full asset+vessels+images+scans JSON | explicit org/admin/shared check |
| `get_shared_assets_for_organization(org_id uuid)` | explicit org-or-admin check |
| `get_organizations_for_shared_asset(...)` | explicit org-or-admin check |
| `get_pending_asset_access_requests_for_org(org_id uuid)` → **returns `username`, `user_email`** | explicit admin/org_admin check |
| `get_user_asset_access_requests(p_user_id uuid)` | explicit self-or-admin check |
| `approve_asset_access_request(request_id uuid)` — **writes** `shared_assets` | explicit admin/org_admin check |
| `reject_asset_access_request(request_id uuid, reason text)` — **writes** | explicit admin/org_admin check |
| `user_can_access_vessel(check_vessel_id text)` (policy helper) | org check, NULL-safe |

Two things to say about these.

**They are not currently exploitable.** Seven carry a hand-written caller check of the form:

```sql
IF NOT EXISTS (SELECT 1 FROM profiles
               WHERE id = auth.uid()
                 AND (role = 'admin' OR organization_id = org_id))
THEN RETURN; END IF;
```

For `anon`, `auth.uid()` is NULL, `EXISTS` is false, and the function returns an empty set — so the `TO anon` grant is cosmetically wrong but not exploitable. The two unguarded ones (`get_accessible_assets`, `user_can_access_vessel`) are safe by the same NULL-propagation as §5.1. These `-- SECURITY:` comments have the shape of a retro-fit from an earlier hardening pass; the guards are correct as written and NULL-safe, which matches the repo's standing rule that *SECURITY DEFINER RPCs need NULL-safe role checks*.

**But they check `role`, not `aal`.** A `SECURITY DEFINER` function runs as `postgres`, the table owner, and a table owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set. The parked migration is explicit about this at `database/parked-migrations/aal2_enforcement.sql:361` — *"TO authenticated, so postgres / service_role and the SECURITY DEFINER trigger functions are untouched."*

> **Therefore: adding the nine tables to the aal2 policed set would leave `get_accessible_assets()` and `get_asset_hierarchy()` returning org data to an aal1 session anyway.** Dropping the RPCs is strictly more effective than policing the tables, and dropping both is the only complete answer.
>
> **This generalises beyond the nine.** Any `SECURITY DEFINER` RPC that reads a *policed* table is the same hole in the aal2 gate. That question is out of scope here but should be asked before the migration is un-parked — it is a one-query audit, and the answer determines whether the aal2 gate is actually complete.

---

## 6. Code reachability

### 6.1 Query targets — zero

Complete `.from()` inventory across `src/` and `supabase/functions/` (46 `profiles`, 25 `employee_competencies`, 23 `documents`, 13 `scan_composites`, 8 `vessel_models`, 7 `project_vessels`, …). **None of the nine appears.** The only near-miss is `.from('avatars')`, which is a *storage bucket*, not a table.

`.rpc()` inventory — 8 targets, none legacy: `approve_permission_request`, `get_competencies_with_comments`, `get_documents_due_for_review`, `get_expiring_competencies`, `get_users_for_expiration_reminder`, `log_activity`, `reject_permission_request`, `update_competency_created_at`. **None of the eight legacy RPCs is called from anywhere in the codebase.**

`src/types/database.types.ts` (307 lines, 5 `Row:` blocks) contains **no** type for any of the nine.

`companion/` (the Python client) — **zero** references to any of the nine.

`transfer-asset` — **does not exist** in `supabase/functions/` (20 functions present, none named that). Consistent with the brief's note that it was a stray on the old project only.

The single textual mention anywhere in `src/` is a compliance-doc string, not a query:

- `src/pages/admin/tabs/UKASComplianceTab.tsx:104` — `evidence: 'shared_assets table with permission_level (view/edit)'`

This is a UKAS self-assessment claim citing a table the app no longer uses. Worth correcting when that tab is next touched — it is an accuracy issue in a compliance artefact, not a security one. (It also cites a column, `permission_level`, that does not exist; the live column is `permission`.)

### 6.2 The GDPR erasure functions — the one real dependency, already safe

`supabase/functions/delete-my-account/index.ts` and `supabase/functions/delete-user/index.ts` drive erasure from data-driven table lists, and four of the nine appear in them:

- `delete-my-account/index.ts:377` — `{ table: 'asset_access_requests', column: 'user_id' }` (delete)
- `delete-my-account/index.ts:378` — `{ table: 'shared_assets', column: 'shared_by' }` (delete)
- `delete-my-account/index.ts:406` — `{ table: 'assets', column: 'created_by' }` (nullify)
- `delete-my-account/index.ts:408-409` — `asset_access_requests.approved_by` / `.rejected_by` (nullify)
- `delete-my-account/index.ts:414` — `{ table: 'inspections', column: 'inspector_id' }` (nullify)
- `delete-user/index.ts:367-368, 397-398` — the same entries

**These are already tolerant of the tables being dropped.** Both functions share an identical guard:

```ts
const MISSING_RELATION_CODES = new Set(['PGRST202','PGRST204','PGRST205','42P01','42703'])
// delete-my-account/index.ts:50-56

function recordStepError(error, step, failures): boolean {
  if (!error) return false
  if (isMissingRelation(error)) {
    console.warn(`Account erasure: skipping ${step} — relation/column not present in this database`)
    return true
  }
  failures.push({ step, error: error.message ?? String(error) })
  return false
}
// delete-my-account/index.ts:68-80
```

`42P01` is `undefined_table` and `42703` is `undefined_column`; `PGRST205` is the PostgREST schema-cache table miss. A dropped table produces a warning and a skipped step, **not** a failed erasure.

There is already a live proof that this works: **both functions reference `user_asset_access`** (`delete-my-account/index.ts:376`, `delete-user/index.ts:366,396`) — **a table that does not exist in the live database.** It is not among the 44. That path is exercised on every account deletion today and is silently skipped, which is exactly the designed behaviour and matches the repo's recorded scar about adversarial SQL review catching a *deletion-bricking phantom table*.

> **Consequence for disposition: dropping these four tables does not brick account deletion.** Tidying the now-dead entries out of both lists is good hygiene and should ride along with the drop migration, but it is not a blocker and not a correctness requirement.

Note the functions use `supabaseAdmin` (service role), so RLS — including `asset_access_requests` having no DELETE policy — does not obstruct erasure.

---

## 7. History

| Commit | Date | Relevance |
|---|---|---|
| `79a26f8` | 2025-10-12 | *"Add Supabase full sync integration for cross-device data access"* — introduces `database/supabase-assets-schema.sql` (`assets`, `vessels`, `scans`, `vessel_images`, `sync_metadata`) |
| `6e25dcc` | 2025-10-15 | *"Reorganize codebase structure"* — `supabase-sharing-schema.sql` (`shared_assets`), `supabase-strakes-schema.sql` (`strakes`), `supabase-asset-access-requests-schema.sql` |
| `0b10cc4` | 2025-11-29 | *"Major architecture modernization and admin dashboard migration"* |
| `7e8522d` | 2025-12-16 | *"Inspection page, C-scan visualizer enhancements, and legacy cleanup"* — `database/migrations/add-inspections-table.sql` (`inspections`) |
| `b02cd0f` | 2026-02-03 | *"chore: Temporarily disable Data Hub feature"* |
| **`fe0f1bf`** | **2026-02-06** | **"refactor: Remove legacy tools, Data Hub, and dead code (~32,500 lines)"** — 63 files changed, 32 insertions, **30,439 deletions**. This is where every `.from()` against the family was removed. |
| `036f059` | 2026-02-09 | *"Professional polish pass"* — removed the last straggling `.from('assets')` |

`git log -S` confirms `fe0f1bf` as the removal point for `from('vessels')`, `from('scans')`, `from('strakes')`, `from('vessel_images')`, `from('inspections')` and `from('shared_assets')`; the diff shows them all on `-` lines. `from('sync_metadata')` returns **no results at any point in history** — the table was created by the sync schema but the client never queried it by that name.

**The tables were never dropped because the removal was a frontend-only cleanup.** The SQL files that define them (`database/supabase-assets-schema.sql`, `supabase-sharing-schema.sql`, `supabase-strakes-schema.sql`, `supabase-asset-access-requests-schema.sql`, `database/migrations/add-inspections-table.sql`) are still in the repo, and the tables rode through the 2026-08-17 eu-west-2 cutover in the dump/restore. **~6.5 months dormant.**

---

## 8. Disposition

### 8.1 Add to the aal2 policed set

**None.**

For completeness, the parked migration's policed set is 32 names (24 + 6 "added during authoring" + 2 login-bootstrap). Against the 44 live tables the complement is exactly 13:

```
asset_access_requests   ← the nine
assets                  ← the nine
db_state_snapshots        (deliberate — ops ledger, no org PII)
inspections             ← the nine
password_reset_codes      (deliberate — pre-auth, must work at aal1)
scans                   ← the nine
shared_assets           ← the nine
strakes                 ← the nine
sync_metadata           ← the nine
system_announcements      (deliberate — non-PII broadcast)
tab_visibility_settings   (deliberate — feature-flag config)
vessel_images           ← the nine
vessels                 ← the nine
```

The arithmetic corroborates the brief exactly: **nine legacy + four deliberate exclusions.** The policed set has no accidental omissions. If the drop below proceeds, the complement reduces to the four deliberate ones and the aal2 set needs no change at all.

### 8.2 Drop candidates — **verify zero rows via tomorrow's `db_state_snapshots` first**

All nine, as one unit, plus their RPC surface. **The row-count check is a hard gate, not a formality:** if any table holds rows, this becomes a data-retention and lawful-basis question (client asset data, inspection measurements, site photographs, and in `asset_access_requests` free-text messages tied to named users) — a *migrate-or-erase* decision for the owner, not a drop.

Ordered, because dependencies matter:

1. **Gate.** Confirm `0` rows in all nine from the `db_state_snapshots` ledger. If any is non-empty, **stop** and escalate as a retention decision.
2. **Drop the RPCs first** — they are the actual aal2 bypass, and dropping them is independently worthwhile:
   `get_accessible_assets`, `get_asset_hierarchy`, `get_shared_assets_for_organization`, `get_organizations_for_shared_asset`, `get_pending_asset_access_requests_for_org`, `get_user_asset_access_requests`, `approve_asset_access_request`, `reject_asset_access_request`, plus the path helpers `generate_3d_model_path`, `generate_scan_image_path` (×2 overloads), `generate_vessel_image_path` (×2 overloads).
   Confirmed callable from no code (§6.1).
3. **Drop the policy helper** `user_can_access_vessel(text)` — but only **after** the `inspections` policies that call it, or the drop errors on dependency.
4. **Drop the tables.** `assets` is the root; `DROP TABLE public.assets CASCADE` reaches `vessels` and transitively `inspections`/`scans`/`strakes`/`vessel_images`. `shared_assets`, `asset_access_requests` and `sync_metadata` are independent drops.
   **Note the hard dependency:** `get_accessible_assets()` is declared `RETURNS SETOF public.assets`, so `DROP TABLE assets` fails without `CASCADE` — which is why step 2 comes first, so `CASCADE` is never needed to remove a function silently.
5. **Tidy the erasure lists** — remove `assets`, `shared_assets`, `asset_access_requests`, `inspections` (and the pre-existing phantom `user_asset_access`) from `delete-my-account/index.ts` and `delete-user/index.ts`. Hygiene only; the missing-relation guard already covers it either way.
6. **Adversarial SQL review of the drop migration before pushing** — standing repo rule, and this migration is destructive.
7. Optionally retire the five now-orphaned `database/*.sql` definition files, or mark them historical.

**Reversibility note:** a table drop is not reversible from the app side. If the ledger shows zero rows the loss is nil, but the pre-drop backup should be confirmed to exist regardless.

### 8.3 Immediate action

**Nothing security-urgent.** No anon exposure, no weak RLS, no unauthenticated path. Stated plainly because the brief asked for anything weak-RLS-plus-reachable to be flagged loudly: **there is none.**

Two low-cost corrections worth making independently of the drop:

1. **`CLAUDE.md` § "Key Database Tables"** — change `inspection_projects / vessels / scans` to `inspection_projects / project_vessels / scan_composites`. This doc line is what makes the legacy names look live to anyone reading memory before searching code; it is the root cause of this investigation being necessary. (§3)
2. **`REVOKE … FROM anon`** on the eight legacy RPCs, if the drop is deferred for any reason. Not exploitable today — every one is NULL-safe — but `GRANT ALL … TO anon` on a `SECURITY DEFINER` function that reads org data is a defence-in-depth failure and matches a hardening rule the repo already applies elsewhere. Redundant if §8.2 proceeds promptly.

---

## 9. Secondary findings

**`vessel_scan_placements` — live code, no live table (the mirror image of the nine).**
The table is **not** among the 44 live tables, yet `src/services/vessel-model-service.ts` queries it three times (lines 220, 247, 265), each with an unguarded `if (error) throw error`. It is also in the aal2 policed list (`aal2_enforcement.sql:276`, already commented *"may be absent"*) and in the audit-trigger entity-token map in the live DB.

*Not currently a bug.* The three service functions reach hooks (`useVesselModels.ts:63`, `useVesselModelMutations.ts:141,157`) but **those hooks have no component consumers** — `useVesselScanPlacements`, `useSaveScanPlacement` and `useDeleteScanPlacement` are called from nowhere. So it is dead code pointing at a nonexistent table, and cannot throw at runtime. It should be deleted or the table created, but it is not urgent and it is not aal2-relevant. The aal2 migration is already safe against it: `aal2_enforcement.sql:348` skips absent tables via `to_regclass(...) IS NULL`.

**`asset_access_requests` has no DELETE policy** (only SELECT/INSERT/UPDATE). Moot given the drop recommendation, and erasure runs as service role, so GDPR deletion is unaffected.

**`assets` SELECT grants cross-org read to `SYSTEM`/`Matrix` org members** — see the first disjunct quoted in §5.1. This is a deliberate super-org pattern from the legacy era, not a defect, but it is a wider grant than anything in the live era and is worth noting as a reason not to leave these tables lying around with rows in them.

---

## Appendix — how to re-verify

```bash
# Live schema, no data (safe; run today 2026-08-27)
npx supabase db dump -s public -f <scratchpad>/public-schema.sql

# Every .from() target in the codebase
grep -rn --include=*.ts --include=*.tsx -oE "\.from\(\s*['\"\`][a-z_]+" src supabase/functions \
  | sed -E "s/.*from\(\s*['\"\`]//" | sort | uniq -c | sort -rn

# RLS coverage: these two counts must match (44 = 44)
grep -c "ENABLE ROW LEVEL SECURITY" public-schema.sql
grep -c "^CREATE TABLE" public-schema.sql

# Unpoliced complement (expects the 13 listed in §8.1)
grep "^CREATE TABLE" public-schema.sql | sed -E 's/.*"public"\."([a-z_]+)".*/\1/' | sort > live.txt
sed -n '256,333p' database/parked-migrations/aal2_enforcement.sql \
  | grep -oE "^\s+'[a-z_]+'|\['[a-z_]+'" | tr -d " '[" | sort -u > policed.txt
comm -23 live.txt policed.txt

# When each legacy table stopped being queried (expects fe0f1bf, 2026-02-06)
git log --all --oneline -S"from('vessels')" --format="%h %ad %s" --date=short -- src
```

**Not performed by this investigation, and required before any drop:** row counts for the nine, via the nightly `db_state_snapshots` ledger.
