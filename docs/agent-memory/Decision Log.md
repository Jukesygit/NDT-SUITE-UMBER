---
tags:
  - agent-memory/decisions
  - ndt-suite
aliases:
  - Decision Log
---

# Decision Log

Use this for durable decisions that affect future work. Keep entries short and link to fuller notes when needed.

## 2026-05-07 - Obsidian Memory Layer

Decision: maintain a small agent-facing memory layer in `AGENTS.md` and `docs/agent-memory/`.

Reasoning: future agents should get project orientation from curated notes before searching the whole repository. The notes are a map, not a replacement for reading source code.

Consequences:

- `AGENTS.md` is the first file for agents to read.
- `docs/agent-memory/Project Brief.md` stores stable project context.
- `docs/agent-memory/Module Map.md` stores feature-to-file ownership.
- `docs/agent-memory/Decision Log.md` stores durable decisions.
- Temporary session state belongs in dated handoff notes under `docs/plans/`.

## 2026-05-07 - Memory-First Agent Instructions

Decision: make the memory-first workflow explicit in both Codex and Claude instruction files.

Reasoning: the memory layer only saves context if agents reliably read it before broad repository search. The practice should be part of the agent operating contract, not a one-off prompt.

Consequences:

- Codex-style agents start from `AGENTS.md`.
- Claude agents start from root `CLAUDE.md`, then `.claude/CLAUDE.md` when present locally.
- Both instruction files require agents to read `Project Brief`, `Module Map`, and `Engineering Log` before non-trivial work.
- Agents should update memory or a dated handoff note when a task changes project shape or leaves important unfinished context.

## 2026-05-08 - Companion CSV Exports Use Explicit Thickness Filters

Decision: companion C-scan CSV export paths should not implicitly apply the NDE file's thickness-process `min`/`max` limits. Those limits remain metadata and may be applied only when a user or API request explicitly supplies export filter values.

Reasoning: a May 2026 Judy SO2 data check showed the NDE `RawCScan` contained sub-5 mm readings, while exported CSVs hid them because the batch/API export paths silently applied the file's 6.25-28.0 mm thickness process range and converted lower readings to `ND`.

Consequences:

- Batch export leaves thickness filter fields blank by default and logs detected NDE process limits as guidance.
- The `/cscan-export` API uses only request-provided `thicknessMin`/`thicknessMax`.
- Future OmniPC-match workflows that need process-limit filtering must opt in explicitly.

## 2026-06-22 - Flattened (2D) View Circumferential Convention

Decision: the developed/flattened vessel view (`FlattenedView/`) is cut at TDC — circumferential Y = 0 is 12 o'clock at the top, increasing clockwise (3 o'clock = ¼, 6 o'clock = ½, 9 o'clock = ¾). All circumferential placement flows through `geometry-projection.ts`:

- `angleToCircumMm(vesselAngle)` takes the **vessel** convention (90° = TDC). Feed geometry feature angles (nozzle/weld/saddle/lug `.angle`, which are already 90° = TDC) straight in — do NOT subtract 90.
- `datumToCircumMm(datumAngleDeg)` takes the **user** convention (0° = TDC) and adds +90 internally — the same conversion the 3D path uses (`datumAngleDeg + 90` in texture-manager, scan-gizmo, scan-sampling, wall-loss). Use it for scan composites.

Reasoning: scan-0 was rendering 90° (¼ circumference) off from 12 o'clock in the 2D view while correct in 3D. Two earlier "fixes" (`13a4196` removed the heatmap +90, `328c24f` shifted feature angles -90 to match) made heatmap and geometry mutually consistent but rotated the whole axis so TDC sat ¼ of the way down instead of at the top. Root cause was the call sites feeding `angleToCircumMm` a user-convention angle when it expects a vessel angle.

Consequences:

- A datum-0 scan and a 12-o'clock nozzle both land at Y = 0 (verified by `geometry-projection.test.ts`).
- Any new flattened overlay must use these two helpers, never re-introduce a manual ±90 shift.
- Regression guard: `geometry-projection.test.ts` asserts TDC/scan-datum-0 → Y = 0 and bottom → Y = circumference/2.

## 2026-06-22 - Flattened (2D) View Feature Marker Rendering

Decision: developed-view feature markers (nozzles today; lugs/annotations should follow) are drawn with **per-axis pixel radii** and **seam wrapping**, not as a single-radius circle.

- Per-axis radii: the view scales axial (X) and circumferential (Y) independently, so a round bore must use `rxPx` from `toCanvasX` and `ryPx` from `toCanvasY` and be drawn with `ctx.ellipse`. A single radius (the old `ctx.arc` using only the X scale) made nozzles bulge/shrink circumferentially — a display distortion of the true footprint.
- Seam wrapping: `geometry-projection.ts → wrapCircumCenters(cyMm, radiusMm, circumference)` returns the base centre plus a ±circumference copy when the marker crosses the TDC cut (Y=0 / Y=circumference). Draw the marker once per returned centre; the viewport clip trims each copy. This stops 12-o'clock nozzles being clipped to half-circles at the top boundary.

Reasoning: nozzles near TDC were clipped in half, and large nozzles overflowed their footprint because the circle was sized only by the axial scale. Both are correctness issues (see the no-display-distortion inspection-integrity constraint).

Consequences:

- `wrapCircumCenters` is pure and unit-tested in `geometry-projection.test.ts` (interior = no wrap; top/bottom seam = one wrapped copy; non-positive circumference = base only).
- The interactive marker and the selection glow in `FlattenedViewport.tsx` share this treatment; the report/export path reuses the same canvas via `exportImage()`, so no separate fix is needed there.

## 2026-06-22 - Flattened (2D) View Axial Axis Orientation

Decision: the developed view's horizontal axis is the **scan index** — 0 = scan start on the left, increasing right — not raw vessel axial position. Orientation comes from the first confirmed composite with data (`getAxialOrientation`), the same reference the colour legend uses.

- A **forward** scan keeps the natural left-tangent-on-the-left layout (no change).
- A **reverse** scan (index 0 at a high vessel position) **mirrors** the axis (`axialFrac` with `reversed`), so the scan start still lands on the left.
- Both the heatmap row→pixel mapping and `toCanvasX`/`fromCanvasX` apply the same mirror, so scan data and feature overlays move together.
- The axial scale labels show **index distance from the scan start** via `axialToIndexMm` (negative before the scan start); `drawAxialScale` takes an optional `labelFor` mapper.
- With no confirmed scan, the axis falls back to raw vessel position (0 = left tangent).

Reasoning: a reverse-direction scan put the scan start (e.g. nozzle N7) on the far right of the developed view while the 3D view and the inspector's reading have it at the index start. The 2D faithfully used vessel position (0 = left tangent), which is correct geometrically but not the C-scan reading convention. User chose "scan index, 0 on left."

Consequences:

- `getAxialOrientation`, `axialToIndexMm`, `axialFrac` are pure and unit-tested in `geometry-projection.test.ts`.
- Multi-composite vessels orient to the first confirmed composite; revisit if mixed forward/reverse scans need independent axes.

## 2026-06-22 - Flattened (2D) View Is To-Scale (1:1 Aspect)

Decision: the developed view uses **one pixel-per-mm scale on both axes** (`fitScale` → `min(drawWidth/length, drawHeight/circumference)`), letterboxing the looser axis (centred via `marginX`/`marginY`). It no longer stretches each axis independently to fill the canvas.

Reasoning: independent axis scaling rendered round nozzle bores as ovals (the per-axis ellipse markers were faithful to a distorted view) and geometrically distorted scan footprints — a display distortion. A to-scale view makes `rxPx === ryPx` (circles render round) and preserves true proportions, consistent with the no-display-distortion inspection principle.

Consequences:

- `toCanvasX`/`toCanvasY`/`fromCanvasX`/`fromCanvasY` and the heatmap row/col mapping all use the shared `pxPerMm` + margins; the wrap-skip threshold is now `circumference·pxPerMm·zoom/2`.
- The plot is centred with margins (does not fill the full width when aspect ratios differ) — intentional. Pan/zoom and Fit still work.
- Scale anchoring: the circumferential scale and the "12 o'clock (TDC)" label anchor to `Math.min(x0, x1)` (the true left edge) because a mirrored axial axis makes `toCanvasX(0)` the right edge.
- `fitScale` is pure and unit-tested in `geometry-projection.test.ts`.

## 2026-06-23 - Flattened (2D) View Couples Circumferential Flip to the Axial Mirror

Decision: when the axial axis is mirrored (`reversed`, i.e. a reverse-index scan read from the far end), the circumferential axis is **also** flipped via `circumDisplayMm(mm, circ, reversed)` — a 180° rotation about the vertical axis (TDC and BDC stay fixed; 3 o'clock ↔ 9 o'clock swap).

Reasoning: mirroring only the axial axis turned the developed view into a **reflection** (mirror image), so the circumferential read backwards ("vertically flipped"). Flipping both axes makes it a proper rotation = genuinely viewing from the other end, and keeps TDC at the top.

Consequences:

- `circumDisplayMm` is its own inverse; applied in `toCanvasY`, `fromCanvasY`, and the heatmap `colPy` so features and scan share one orientation.
- The circumferential scale is drawn with a **plain linear** 0→circumference placement (NOT the flipping `toCanvasY`) — distance-from-TDC is identical in either handedness, and routing it through the flip would scramble the tick order.
- `circumDisplayMm` is pure and unit-tested (TDC/BDC fixed, quarter points swap, self-inverse).
- Gotcha: the plot outline/clip rect must derive its vertical extent **linearly** (top = 0, bottom = circumference·pxPerMm·zoom), NOT from `toCanvasY(circumference)`. Under the flip the seam wraps (`circumference ≡ 0 ≡ TDC`), so `toCanvasY(circumference)` returns the top — collapsing the rect and its clip to zero height and hiding the heatmap. (Regressed once; fixed by computing y0/y1 linearly.)

## 2026-06-25 - "Expiring Competencies" RPCs Include Already-Expired Certs

Decision: `get_expiring_competencies` and `get_expiring_competencies_with_comments` return certs that expire on or before `NOW() + days_threshold`, **including already-expired ones**. The previous `AND ec.expiry_date > NOW()` lower bound was removed (migration `supabase/migrations/20260625120000_expiring_competencies_include_expired.sql`). Both keep `status = 'active'` and `SET search_path = public`.

Reasoning: the admin "Send to Individual" expiry-reminder picker (`ExpiryRemindersSettings.tsx` → `useExpiringCompetencies(180)`) built its candidate list from these RPCs, so a user whose only flagged cert was already expired never appeared as an option. This contradicted the rest of the feature, which is designed to include expired certs: the threshold UI offers a "0 = Expired / This Month" option, the `send-expiration-reminders` edge function (single-user mode) selects with `.lte('expiry_date', now+180d)` and **no** lower bound, and the reminder email has a dedicated "Expired" section. The candidate-list RPC and the send path disagreed; the RPC was wrong.

Consequences:

- The Personnel → "Expiring Certifications" tab (`useExpiringCompetencies(30)`, the same plain RPC) now also surfaces already-expired certs; `ExpiringView` already renders negative `days_until_expiry` and labels ≤7-day items URGENT, so no UI change was needed.
- `days_until_expiry` is negative for expired certs — any new consumer must tolerate negatives.
- Invariant: the candidate-list RPC and the edge-function send query must agree on "expiring" (both include expired, both require `status='active'`). Don't re-add an `expiry_date > NOW()` filter to one without the other.
- Base schema snapshots (`database/competency-schema.sql`, `database/add-competency-comments.sql`) still show the old `> NOW()` body — per repo convention they are historical; the migration is authoritative. A fresh rebuild must run migrations to get the fix.

## 2026-06-25 - Competency Delete: Audit Trigger Must Not Reference the Deleted Row

Decision: deleting an `employee_competencies` row must never fail because of its own audit trail. Two rules, applied in migration `supabase/migrations/20260625130000_fix_competency_history_delete_fk.sql`:

- The `AFTER DELETE` branch of `log_competency_change()` inserts the `'deleted'` history row with `employee_competency_id = NULL` (the parent id is gone in the same statement). It still records `user_id`, `competency_id`, `old_value`, `old_expiry_date` for audit.
- `competency_history_employee_competency_id_fkey` is `ON DELETE SET NULL` (was `ON DELETE CASCADE`), so a competency's prior history survives its deletion instead of being cascade-wiped. The column is nullable, so SET NULL is valid.

Reasoning: every profile-page competency delete returned `409` / Postgres `23503` — `insert or update on table "competency_history" violates foreign key constraint "competency_history_employee_competency_id_fkey"` (key not present in `employee_competencies`). The trigger was inserting a `'deleted'` audit row pointing at the row being deleted. This is the classic self-referential AFTER DELETE bug; PostgREST surfaces the integrity error as HTTP 409.

Migration drift caveat (verify live, don't trust files): the live trigger was the **base** `competency-schema.sql` version (writes `employee_competency_id = OLD.id`, `action` values `created/updated/deleted`, TEXT `old_value`). The Feb-2026 security migration `20260209120000_security_fix_definer_functions.sql` contains a *different* rewrite of `log_competency_change` (writes `competency_id`, JSONB `old_value`, an `organization_id` column, `action` values `create/update/delete`) that never actually took on this database. A loose fix script (`database/fix-competency-delete-policy.sql`) had the right idea (NULL on delete) but was never committed as a migration. The new migration matches the live base shape; do not assume the `20260209` body is what runs.

Consequences:

- No client/service change: `deleteCompetency()` in `src/services/competency-mutations.ts` was already correct (plain `.delete()`, throws on error).
- Migration must be applied to the DB to take effect (`supabase db push` or run the SQL in the SQL editor). Verify by deleting a test competency and confirming a `'deleted'` row with NULL `employee_competency_id` appears.
- Any future audit/history table on a deletable parent should use a nullable, `ON DELETE SET NULL` back-reference and a trigger that does not write the parent id on DELETE.

## 2026-06-25 - Personnel Email Change: Admins May Edit Their Own Login Email

Decision: an admin/super_admin may change **their own** login email through the personnel manager. The self-edit guard (`userId === auth.user.id` → 400 "Cannot change your own email through admin tools") was removed from `supabase/functions/admin-update-email/index.ts`. Two client fixes in `useUpdatePerson` (`src/hooks/mutations/usePersonnelMutations.ts`): (1) only invoke `admin-update-email` when the new email actually differs from the stored `profiles.email`; (2) surface the edge function's real error via the new shared helper `src/utils/edge-function-error.ts` (`extractFunctionErrorMessage`).

Reasoning: a super_admin editing their own row got a bare "Edge Function returned a non-2xx status code" toast. Root cause was three-layered: the personnel form always **resubmits the current email**, so the hook called `admin-update-email` on *every* self-save (role/mobile/anything) → the self-edit guard fired a 400; and supabase-js's `FunctionsHttpError.message` is the generic non-2xx string — the real `{ error }` body lives on `error.context` (the `Response`) and was never read. User chose to allow all admins to change their own email (`email_confirm: true`, so no verification round-trip).

Consequences:

- Recurring constraint: the **admin panel** user editor (`EditUserModal` → `admin-users.updateUser`) writes **only `profiles.email`**, never `auth.users`. The personnel manager's `admin-update-email` edge function is the **only** in-app path that syncs the actual login credential. So `profiles.email` can drift from the login email if a profile email is edited via the admin panel — prefer the personnel manager for real email changes.
- `extractFunctionErrorMessage` is reusable by any `supabase.functions.invoke` caller that wants the server message instead of the generic non-2xx string; unit-tested in `src/utils/edge-function-error.test.ts`.
- The edge function must be redeployed (`supabase functions deploy admin-update-email`) for the guard removal to take effect.
- Tradeoff: with the guard gone and `email_confirm: true`, a typo changes the login email without a confirmation step. Acceptable for admin-only tooling; revisit if non-super_admin abuse is a concern.

## 2026-06-26 - Activity Log → Server-Authoritative Audit Trail

Decision: the admin Activity Log was reworked from a partial, client-trusted feed into a tamper-resistant, full-breadth audit trail. Design + as-built notes: `docs/plans/2026-06-26-activity-log-true-audit-trail-design.md`. Migrations `20260626140000`–`20260626170000`.

Capture model (hybrid):

- **DB triggers** (`audit_row_change()`, migration `…160000`) audit every create/update/delete on the core domain tables (inspection_projects, project_vessels, vessel_models, scan_composites, scan_log_entries, calibration_log_entries, inspection_procedures, project_files, project_images, documents + revisions/review/categories, employee_competencies, competency_definitions/categories, organizations, **profiles UPDATE-only**). Actor = `auth.uid()`; the trigger **skips null-actor (service-role) writes** and **swallows errors** so auditing never breaks a user write.
- **Edge functions** log user lifecycle (create/delete/email/approve/bulk/sync/password-reset) via `supabase/functions/_shared/audit.ts` with the JWT-verified admin as actor (service-role writes have no `auth.uid()`).
- **Client `logActivity`** now logs ONLY semantic, non-row events (login/logout, data_exported, pii_revealed, report_generated). `log_activity` RPC forces actor from `auth.uid()` (client-supplied id ignored).

Recurring constraints (do not regress):

- **No double-logging:** never re-add a client `logActivity` call for a table that a trigger covers (org/competency/definition/document/profile CRUD were removed for this reason). Kept client calls: `account_rejected`, `permission_approved/rejected` (RPC paths, no trigger).
- **Immutable / append-only:** only `purge_activity_logs()` (super_admin, self-auditing) and `scheduled_purge_activity_logs()` (system/cron, self-auditing) may delete. Never add an ungated, non-auditing deleter (the legacy `cleanup_old_activity_logs` was dropped for exactly that). Default retention 730 days.
- **Read access is super_admin + admin only** (managers lost access). The old policy used `('admin','manager')` and omitted super_admin.
- **Actor PII is never cached.** `entity_name` holds the *subject* label (not actor PII). The viewer resolves actor identity by **joining `profiles`** (`getActivityLogs`/`getActivityUsers`); the `user_name`/`user_email` columns are always NULL — reading them shows everyone as "System" (a bug fixed in this change). PII in update diffs is redacted; masked emails in edge-fn details must use a non-PII key (e.g. `email_masked`), since `email` is stripped by the sanitizer.
- **Taxonomy single source of truth:** the `ActionCategory` union (`activity-log-service.ts`), the DB `activity_log_action_category_check`, and the UI category filter must list the same 10 values (auth, security, profile, competency, admin, asset, inspection, document, config, data).
- **Legacy asset-hierarchy tables excluded** (`vessels`, `scans`, `inspections` — TEXT PKs) as a deliberate exclusion; the active workflow is project-based.

Consequences: migrations must be applied to the live DB and edge functions redeployed; enable pg_cron and uncomment the schedule in `…170000` for automated retention; run the cross-domain QA checklist before relying on coverage.

## 2026-06-29 - Competency Document Review 400 (storage RLS role omission)

Decision: fixed "Failed to load document" (HTTP 400) in the personnel document-review modal. Migration `20260629120000_fix_competency_document_storage_policies.sql`; manual source `database/storage-policies.sql` updated to match.

Root cause: same `super_admin` omission class as the table-policy fix in `20260618120000`, but on **`storage.objects`**. `getDocumentUrl` (`competency-queries.ts`) signs `competency-documents/<uploaderId>/…` via `createSignedUrl`, which is gated by the storage SELECT policy. That policy only granted owner / exact `role='admin'` / same-org `org_admin` — it omitted `super_admin` and `manager`. So a super_admin/manager reviewer could read the competency **row** (details render, table policy was fixed in `…180000`) but the **object** was RLS-invisible → sign returns 400 → modal shows the catch-all error. Provably the reviewer was super_admin/manager (an org_admin able to see details is same-org, so the storage org_admin branch would already pass).

Recurring constraints (do not regress):

- **RLS role-list changes must be applied to BOTH the table policy AND the matching `storage.objects` policy.** Role additions (`super_admin`, later `manager`) have now been missed in `activity_log`, `employee_competencies`, and the competency-document storage policies. When touching access for a feature that stores files, grep `storage.objects` for that feature's folder.
- The private **`documents` bucket is shared**: `competency-documents/<userId>/…` (competency certs) and `controlled-documents/<docId>/…` (document control) each have their **own folder-scoped** policies. The competency policies are now scoped via `(storage.foldername(name))[1] = 'competency-documents'` (matching the existing INSERT policy and the document-control policies); keep them folder-scoped so the two features never cross-grant.

Consequences: apply the migration to the live DB (`supabase db push`, or run the SQL in the dashboard). Verify by reopening a pending document as a super_admin/manager — the PDF/image preview should render and the 400 disappear.
