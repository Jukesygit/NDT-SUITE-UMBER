/**
 * Competency Mutation Operations
 * Create, update, delete operations for employee competencies,
 * documents, and bulk imports.
 */
import { supabase, isSupabaseConfigured } from '../supabase-client';
// @ts-ignore - JS module without type declarations
import authManager from '../auth-manager.js';

// Supabase is guaranteed initialized when services are called
const sb = supabase!;
import { getCompetencyDefinitions } from './competency-queries.ts';

export interface UpsertCompetencyData {
    value?: string | null;
    expiryDate?: string | null;
    issuingBody?: string | null;
    certificationId?: string | null;
    documentUrl?: string | null;
    documentName?: string | null;
    notes?: string | null;
    status?: string;
    level?: string | null;
    witnessChecked?: boolean;
    witnessedBy?: string | null;
    witnessedAt?: string | null;
    witnessNotes?: string | null;
}

export interface DocumentUploadResult {
    url: string;
    name: string;
    path: string;
}

/** A document to persist for a competency (storage path + display name). */
export interface CompetencyDocumentInput {
    document_url: string;
    document_name: string;
}

/** A persisted competency_documents row. */
export interface CompetencyDocumentRow {
    id: string;
    employee_competency_id: string;
    document_url: string;
    document_name: string;
    position: number;
    created_at?: string;
}

function ensureConfigured(): void {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
}

/** Create or update a competency for a user */
export async function upsertCompetency(
    userId: string, competencyId: string, data: UpsertCompetencyData
): Promise<any> {
    ensureConfigured();
    let status = data.status;
    if (!status) status = data.documentUrl ? 'pending_approval' : 'active';

    const competencyData = {
        user_id: userId, competency_id: competencyId,
        value: data.value || null, expiry_date: data.expiryDate || null,
        issuing_body: data.issuingBody || null, certification_id: data.certificationId || null,
        document_url: data.documentUrl || null, document_name: data.documentName || null,
        notes: data.notes || null, status, level: data.level || null,
        witness_checked: data.witnessChecked || false, witnessed_by: data.witnessedBy || null,
        witnessed_at: data.witnessedAt || null, witness_notes: data.witnessNotes || null
    };

    const { data: result, error } = await sb
        .from('employee_competencies')
        .upsert(competencyData, { onConflict: 'user_id,competency_id' })
        .select('*, competency:competency_definitions(name)')
        .single();
    if (error) throw error;

    return result;
}

/** Add a storage path to the cleanup set, skipping empties and absolute URLs. */
function collectStoragePath(paths: Set<string>, value: string | null | undefined): void {
    // Only bucket-relative paths are storage objects; http(s) values are
    // external links and null/empty means "no document".
    if (value && !value.startsWith('http')) paths.add(value);
}

/**
 * Delete a competency (row + cascade-removed competency_documents children) and
 * best-effort clean up the storage objects those rows referenced.
 */
export async function deleteCompetency(competencyId: string): Promise<boolean> {
    ensureConfigured();

    // Gather the storage paths to remove BEFORE the row is gone. document_name is
    // a display label (not a storage path), so only document_url values are kept.
    const paths = new Set<string>();
    const { data: parent } = await sb
        .from('employee_competencies')
        .select('document_url, document_name')
        .eq('id', competencyId)
        .maybeSingle();
    collectStoragePath(paths, (parent as { document_url?: string | null } | null)?.document_url);

    const { data: children } = await sb
        .from('competency_documents')
        .select('document_url')
        .eq('employee_competency_id', competencyId);
    for (const row of (children ?? []) as { document_url?: string | null }[]) {
        collectStoragePath(paths, row.document_url);
    }

    // Delete the row; cascade removes the competency_documents children.
    const { error } = await sb
        .from('employee_competencies').delete().eq('id', competencyId);
    if (error) throw error;

    // Best-effort storage cleanup — the row is already gone, so a storage failure
    // must never surface as an error (orphaned objects are acceptable).
    if (paths.size > 0) {
        try {
            await sb.storage.from('documents').remove([...paths]);
        } catch {
            // swallow
        }
    }

    return true;
}

/** Verify/approve a competency */
export async function verifyCompetency(
    competencyId: string, approved: boolean, reason: string | null = null
): Promise<any> {
    ensureConfigured();
    const currentUser = authManager.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const updateData: Record<string, any> = {
        status: approved ? 'active' : 'rejected',
        verified_by: currentUser.id, verified_at: new Date().toISOString()
    };
    if (!approved && reason) updateData.notes = reason;

    const { data, error } = await sb
        .from('employee_competencies').update(updateData).eq('id', competencyId)
        .select('*, competency:competency_definitions(name)').single();
    if (error) throw error;

    return data;
}

/** Request changes to a competency (send back to user with comment) */
export async function requestChanges(competencyId: string, comment: string): Promise<any> {
    ensureConfigured();
    const currentUser = authManager.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const { data, error } = await sb
        .from('employee_competencies')
        .update({
            status: 'changes_requested', notes: comment,
            verified_by: currentUser.id, verified_at: new Date().toISOString()
        })
        .eq('id', competencyId)
        .select('*, competency:competency_definitions(name)').single();
    if (error) throw error;

    return data;
}

/** Upload competency document */
export async function uploadDocument(
    file: File, userId: string, competencyName: string
): Promise<DocumentUploadResult> {
    ensureConfigured();
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${competencyName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;
    const filePath = `competency-documents/${fileName}`;
    const { data: _data, error } = await sb.storage
        .from('documents').upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return { url: filePath, name: file.name, path: filePath };
}

/** Delete a document from storage */
export async function deleteDocument(filePath: string): Promise<boolean> {
    ensureConfigured();
    const { error } = await sb.storage.from('documents').remove([filePath]);
    if (error) throw error;
    return true;
}

/**
 * Replace the full document set for a competency (replace-set semantics): delete
 * child rows no longer present, keep/insert the rest with `position` = array
 * index, then mirror the parent scalars to the position-first document (or NULL
 * when empty). Returns the new rows ordered by position.
 */
export async function setCompetencyDocuments(
    employeeCompetencyId: string,
    docs: CompetencyDocumentInput[]
): Promise<CompetencyDocumentRow[]> {
    ensureConfigured();
    const uploadedBy = authManager.getCurrentUser()?.id ?? null;

    const { data: existing, error: fetchError } = await sb
        .from('competency_documents')
        .select('id, document_url')
        .eq('employee_competency_id', employeeCompetencyId);
    if (fetchError) throw fetchError;

    const existingRows = (existing ?? []) as { id: string; document_url: string }[];
    const nextUrls = new Set(docs.map(d => d.document_url));

    // Delete rows no longer present in the new set
    const removedRows = existingRows.filter(row => !nextUrls.has(row.document_url));
    const toDelete = removedRows.map(row => row.id);
    if (toDelete.length > 0) {
        const { error: deleteError } = await sb
            .from('competency_documents').delete().in('id', toDelete);
        if (deleteError) throw deleteError;

        // Best-effort: remove the now-orphaned storage objects. The DB delete
        // above still throws on failure; a storage failure here is swallowed.
        const removedPaths = removedRows
            .map(row => row.document_url)
            .filter((url): url is string => !!url && !url.startsWith('http'));
        if (removedPaths.length > 0) {
            try {
                await sb.storage.from('documents').remove(removedPaths);
            } catch {
                // swallow
            }
        }
    }

    // Keep/insert the rest with position = array index
    const existingByUrl = new Map(existingRows.map(row => [row.document_url, row.id]));
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const existingId = existingByUrl.get(doc.document_url);
        if (existingId) {
            const { error: updateError } = await sb
                .from('competency_documents')
                .update({ document_name: doc.document_name, position: i })
                .eq('id', existingId);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await sb
                .from('competency_documents')
                .insert({
                    employee_competency_id: employeeCompetencyId,
                    document_url: doc.document_url,
                    document_name: doc.document_name,
                    position: i,
                    uploaded_by: uploadedBy,
                });
            if (insertError) throw insertError;
        }
    }

    // Mirror rule: parent scalars follow the position-first document
    const first = docs[0];
    const { error: mirrorError } = await sb
        .from('employee_competencies')
        .update({
            document_url: first ? first.document_url : null,
            document_name: first ? first.document_name : null,
        })
        .eq('id', employeeCompetencyId);
    if (mirrorError) throw mirrorError;

    const { data: result, error: resultError } = await sb
        .from('competency_documents')
        .select('id, employee_competency_id, document_url, document_name, position, created_at')
        .eq('employee_competency_id', employeeCompetencyId)
        .order('position', { ascending: true });
    if (resultError) throw resultError;
    return (result ?? []) as CompetencyDocumentRow[];
}

/**
 * Batch-resolve signed URLs for competency document storage paths. Returns a map
 * of input path → signed URL (valid 1 hour); already-absolute (http) paths pass
 * through unchanged, and a path that fails to sign maps to an empty string.
 */
export async function getDocumentUrls(paths: string[]): Promise<Record<string, string>> {
    ensureConfigured();
    const result: Record<string, string> = {};
    const toSign: string[] = [];
    for (const path of paths) {
        if (path.startsWith('http')) result[path] = path;
        else toSign.push(path);
    }
    if (toSign.length === 0) return result;

    const { data, error } = await sb.storage
        .from('documents').createSignedUrls(toSign, 3600);
    if (error) throw error;
    for (const item of data ?? []) {
        if (item.path) result[item.path] = item.signedUrl ?? '';
    }
    return result;
}

/** Bulk create competencies */
export async function bulkCreateCompetencies(competencies: any[]): Promise<any[]> {
    ensureConfigured();
    if (!Array.isArray(competencies) || competencies.length === 0) {
        throw new Error('Competencies array is required');
    }
    const { data, error } = await sb
        .from('employee_competencies')
        .upsert(competencies, { onConflict: 'user_id,competency_id' }).select();
    if (error) throw error;
    return data;
}

/** Bulk import competencies from CSV data */
export async function bulkImportCompetencies(
    userId: string, csvData: Record<string, any>
): Promise<any[]> {
    ensureConfigured();
    const definitions = await getCompetencyDefinitions();
    const competenciesToImport: any[] = [];

    for (const [fieldName, value] of Object.entries(csvData)) {
        if (!value || value === '') continue;
        const definition = definitions.find((def: any) =>
            def.name.toLowerCase() === fieldName.toLowerCase()
        );
        if (definition) {
            competenciesToImport.push({
                user_id: userId, competency_id: definition.id,
                value: value.toString(),
                expiry_date: definition.field_type === 'expiry_date' ? value : null,
                status: 'active'
            });
        }
    }
    if (competenciesToImport.length === 0) {
        throw new Error('No matching competencies found in CSV data');
    }
    const { data, error } = await sb
        .from('employee_competencies')
        .upsert(competenciesToImport, { onConflict: 'user_id,competency_id' }).select();
    if (error) throw error;
    return data;
}
