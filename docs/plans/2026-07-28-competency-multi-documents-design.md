# Competency Multi-Document Support (Certifications) — Design

Date: 2026-07-28
Status: Approved for implementation
Owner: Fable (orchestrator) — implementation delegated per orchestration policy

## Problem

Certifications frequently span multiple files: front/back of a card photographed separately, a multi-page certificate scanned page-by-page, or a cert plus supporting evidence. Today `employee_competencies` holds exactly one document (`document_url` + `document_name` scalars), and every surface — the shared `EditCompetencyModal` upload slot, `CompetencyCard`'s single "View Certificate" button, both review modals, `CertificateDetailModal`, `CompetencySection` — assumes one document per certification.

## Decision

**New child table `competency_documents`** is the source of truth for a certification's document set. The legacy scalar columns on `employee_competencies` are kept **mirrored to the first document** (by position) so unmigrated consumers and "has a document" gating checks keep working, and rollback is trivial.

Rejected alternatives: JSONB array column (loses relational integrity, messier RLS-free auditing); parallel `text[]` columns (fragile).

## Schema (new Supabase migration)

```sql
CREATE TABLE competency_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_competency_id uuid NOT NULL
    REFERENCES employee_competencies(id) ON DELETE CASCADE,
  document_url  text NOT NULL,  -- storage path in 'documents' bucket: competency-documents/<userId>/...
  document_name text NOT NULL,
  position      int  NOT NULL DEFAULT 0,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON competency_documents(employee_competency_id);
```

- **RLS**: enable, with policies that delegate to the parent row via `EXISTS (SELECT 1 FROM employee_competencies ec WHERE ec.id = employee_competency_id AND <parent predicate>)`. The predicate must mirror the parent policies **exactly** as fixed in `supabase/migrations/20260618120000_fix_super_admin_competency_access.sql` (self + admin/super_admin/manager/org_admin via the `auth_is_admin()`-style helpers). Per the storage-RLS-role-omission lesson: role lists must match the parent everywhere — read that migration, don't reconstruct from memory.
- **Backfill**: `INSERT INTO competency_documents (employee_competency_id, document_url, document_name, position) SELECT id, document_url, document_name, 0 FROM employee_competencies WHERE document_url IS NOT NULL;`
- **Storage**: paths are unchanged (`competency-documents/<userId>/…` in the private `documents` bucket) → **no storage policy changes needed**.

## Invariants

1. **Mirror rule**: `employee_competencies.document_url/document_name` always equal the position-first document, or NULL when the set is empty. Maintained by ONE service-layer function used by every mutation path (no duplicated logic).
2. **Re-review rule**: any add/remove/replace of documents that leaves ≥1 document ⇒ `status = 'pending_approval'` (same trigger semantics as today's single-doc rule). Removing all documents ⇒ default status `'active'` (nothing left to review). Reordering alone does not trigger review. This decision lives in ONE shared helper; today's duplicated rule (`upsertCompetency` line ~46 vs `usePersonnelMutations` lines ~193/263) converges on it.
3. Documents are ordered by `position` (array order at save time). The UI treats them as "pages".

## Contract (data layer → UI)

```ts
// src/hooks/queries/usePersonnel.ts (canonical types)
export interface CompetencyDocument {
  id: string;
  employee_competency_id: string;
  document_url: string;   // storage path
  document_name: string;
  position: number;
  created_at?: string;
}
// PersonCompetency gains: documents?: CompetencyDocument[];
```

Service additions (`src/services/competency-mutations.ts`, exported via `competency-service.ts` barrel):

- `uploadDocument(file, userId, competencyName)` — unchanged single-file upload primitive; UI calls it once per file.
- `setCompetencyDocuments(employeeCompetencyId, docs: {document_url, document_name}[])` — replaces the set (delete removed rows, upsert kept/new rows, position = array index), then applies the mirror rule to the parent row. Returns the new rows.
- `getDocumentUrls(paths: string[])` — batched signed URLs via `storage.createSignedUrls(paths, 3600)`; surfaces touched by this feature use it instead of adding a 5th ad-hoc `createSignedUrl` copy.

Pure helpers (new `src/utils/competency-documents.ts`, unit-tested):

- `normalizeCompetencyDocuments(competency)` — returns the document list, synthesizing a one-element list from legacy scalars when child rows are absent (belt-and-braces on top of backfill).
- `documentsRequireReview(previous, next)` — implements the re-review rule.

Hook changes:

- `useUpdatePersonCompetency` / `useAddPersonCompetency` (`usePersonnelMutations.ts`) and the create/update mutations in `useCompetencyMutations.ts` accept `documents?: {document_url, document_name}[]` and call `setCompetencyDocuments` after the upsert; pending-approval decided by `documentsRequireReview`. Query invalidations unchanged.
- Queries (`usePersonnel.ts`, `competency-queries.ts`) add nested `documents:competency_documents(...)` ordered by position.

## UI

- **`EditCompetencyModal`**: replace the single-slot document state with a document-list editor extracted to a new `CompetencyDocumentsField` component (multi-select file input + multi-file drag-drop, per-item remove, existing 10 MB/type validation per file). Modal is already 449 lines — the extraction must shrink it, not grow it.
- **`CompetencyCard`** (profile): "View Certificate" gated on non-empty normalized list; viewer modal gets a page navigator (Page N of M) reusing its existing image/PDF/download branches per document.
- **`DocumentReviewModal`** + **`PersonDocumentReviewModal`**: show all documents for the competency under review (per-document preview selection); approve/reject/request-changes still act on the competency as a whole.
- **`CertificateDetailModal`**, **`CompetencySection`**: list all documents.
- All touched surfaces resolve URLs via `getDocumentUrls`.

## Out of scope (pre-existing, recorded, not fixed here)

- Storage INSERT policy excludes `super_admin`/`manager` for upload-for-others (`fix-admin-document-upload-policy.sql`).
- `competency-definitions.ts::requireAdmin()` excludes `super_admin`.
- The orphaned standalone `useUploadCompetencyDocument.ts` duplicate.
- Consolidating the remaining untouched signed-URL reimplementations.

## Phases

1. **Data layer** (opus): migration + backfill + RLS, types, services, pure helpers + unit tests, hooks. Verify: `npm run typecheck`, targeted vitest.
2. **UI surfaces** (opus): edit modal + documents field, card viewer, review modals, detail modal/section. Verify: `npm run typecheck`, `npm run lint`.
3. **Verification** (sonnet): `npm run build`, `npm run test`, `npm run lint`.

Migration must be applied to the live Supabase project by the user (or `supabase db push`) — the app tolerates the pre-migration state via `normalizeCompetencyDocuments`, but multi-doc saves require the table.
