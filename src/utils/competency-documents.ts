/**
 * Pure helpers for competency multi-document support.
 *
 * No Supabase / React imports — these are unit-tested pure functions shared by
 * the query, mutation, and (Phase 2) UI layers so the "mirror" and "re-review"
 * rules live in exactly one place.
 */
import type { CompetencyDocument } from '../hooks/queries/usePersonnel';

/**
 * Minimal shape needed to normalize a competency's document set: the canonical
 * child rows when present, otherwise the legacy scalar columns.
 */
export interface NormalizableCompetency {
    id: string;
    documents?: CompetencyDocument[] | null;
    document_url?: string | null;
    document_name?: string | null;
}

/**
 * Return the certification's documents as a position-ordered list.
 *
 * Prefers the `competency_documents` child rows. When none are present but the
 * legacy `document_url` scalar is set, synthesizes a single position-0 element
 * from the scalars (belt-and-braces on top of the migration backfill, and
 * tolerant of the pre-migration state). Returns an empty list when there is no
 * document at all.
 */
export function normalizeCompetencyDocuments(
    competency: NormalizableCompetency
): CompetencyDocument[] {
    const docs = competency.documents;
    if (docs && docs.length > 0) {
        return [...docs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    if (competency.document_url) {
        return [
            {
                id: `legacy-${competency.id}`,
                employee_competency_id: competency.id,
                document_url: competency.document_url,
                document_name: competency.document_name ?? competency.document_url,
                position: 0,
            },
        ];
    }

    return [];
}

/**
 * Map a competency to the `{ document_url, document_name }[]` shape that the edit
 * form and mutation layer consume (page-ordered). Shared by the profile and
 * personnel edit surfaces so seeding + previous-set derivation live in one place.
 */
export function toDocumentInputs(
    competency: NormalizableCompetency
): { document_url: string; document_name: string }[] {
    return normalizeCompetencyDocuments(competency).map(d => ({
        document_url: d.document_url,
        document_name: d.document_name,
    }));
}

/**
 * Re-review rule: any add/remove/replace of documents that leaves at least one
 * document requires re-approval. Reordering alone does NOT trigger review, and
 * removing every document (empty `next`) does not either (nothing left to
 * review). Comparison is by the SET of `document_url` values, so order and
 * duplicates are ignored.
 */
export function documentsRequireReview(
    previous: { document_url: string }[],
    next: { document_url: string }[]
): boolean {
    if (next.length === 0) return false;

    const prevSet = new Set(previous.map(d => d.document_url));
    const nextSet = new Set(next.map(d => d.document_url));

    const setsDiffer =
        prevSet.size !== nextSet.size || [...nextSet].some(url => !prevSet.has(url));

    return setsDiffer;
}

/**
 * True iff `error` is the specific PostgREST failure raised when a read embeds
 * `competency_documents` but that relationship is not in the schema cache — the
 * migration has not been applied yet, or the cache is stale. PostgREST rejects
 * the whole request with code `PGRST200` and a message naming the missing
 * relationship. Read paths use this to retry the same select without the embed.
 *
 * Defensive: never throws on odd shapes (null, primitives, missing fields).
 */
export function isMissingCompetencyDocumentsRelationship(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const record = error as Record<string, unknown>;
    return (
        record.code === 'PGRST200' &&
        typeof record.message === 'string' &&
        record.message.includes('competency_documents')
    );
}
