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
import { logActivity } from './activity-log-service.ts';
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

    const competencyName = result.competency?.name || 'Unknown';
    const isNew = result.created_at === result.updated_at;
    logActivity({
        userId,
        actionType: isNew ? 'competency_created' : 'competency_updated',
        actionCategory: 'competency',
        description: `${isNew ? 'Created' : 'Updated'} competency: ${competencyName}`,
        entityType: 'competency', entityId: result.id, entityName: competencyName,
        details: { competencyId, value: data.value, hasDocument: !!data.documentUrl },
    });
    return result;
}

/** Delete a competency */
export async function deleteCompetency(competencyId: string): Promise<boolean> {
    ensureConfigured();
    const { data: existing } = await sb
        .from('employee_competencies')
        .select('competency:competency_definitions(name)')
        .eq('id', competencyId).single();
    const competencyName = (existing?.competency as any)?.name || 'Unknown';

    const { error } = await sb
        .from('employee_competencies').delete().eq('id', competencyId);
    if (error) throw error;

    logActivity({
        actionType: 'competency_deleted', actionCategory: 'competency',
        description: `Deleted competency: ${competencyName}`,
        entityType: 'competency', entityId: competencyId, entityName: competencyName,
    });
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

    const competencyName = data.competency?.name || 'Unknown';
    logActivity({
        actionType: approved ? 'competency_approved' : 'competency_rejected',
        actionCategory: 'competency',
        description: `${approved ? 'Approved' : 'Rejected'} competency: ${competencyName}${reason ? ` — ${reason}` : ''}`,
        entityType: 'competency', entityId: competencyId, entityName: competencyName,
        details: { approved, reason },
    });
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

    const competencyName = data.competency?.name || 'Unknown';
    logActivity({
        actionType: 'competency_rejected', actionCategory: 'competency',
        description: `Requested changes on competency: ${competencyName} — ${comment}`,
        entityType: 'competency', entityId: competencyId, entityName: competencyName,
        details: { action: 'changes_requested', comment },
    });
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
