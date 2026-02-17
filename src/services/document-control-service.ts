/**
 * Document Control Service
 * Manages controlled documents, revisions, approval workflows, and review cycles
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient = supabaseModule.supabase;
// @ts-ignore
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

import { documentLogger } from './activity-log-service.ts';
import type {
    DocumentCategory,
    Document,
    DocumentRevision,
    DocumentReviewSchedule,
    DocumentFilters,
    DocumentStats,
    CreateDocumentData,
    UpdateDocumentData,
    ReviewDueDocument,
} from '../types/document-control';

// ============================================================================
// Categories
// ============================================================================

export async function getCategories(): Promise<DocumentCategory[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('document_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

    if (error) throw error;
    return data as DocumentCategory[];
}

export async function createCategory(name: string, description?: string): Promise<DocumentCategory> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: existing } = await supabase
        .from('document_categories')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

    const nextOrder = (existing?.[0]?.display_order ?? 0) + 1;

    const { data, error } = await supabase
        .from('document_categories')
        .insert({ name, description, display_order: nextOrder })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCategory(id: string, updates: { name?: string; description?: string; is_active?: boolean }): Promise<DocumentCategory> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('document_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCategory(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('document_categories')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function getAllCategories(): Promise<DocumentCategory[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('document_categories')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) throw error;
    return data as DocumentCategory[];
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from('document_categories')
            .update({ display_order: i + 1 })
            .eq('id', orderedIds[i]);
        if (error) throw error;
    }
}

// ============================================================================
// Documents
// ============================================================================

export async function getDocuments(filters?: DocumentFilters): Promise<Document[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    let query = supabase
        .from('documents')
        .select(`
            id, doc_number, title, description, category_id, owner_id,
            organization_id, current_revision_id, status, review_period_months,
            next_review_date, is_active, created_by, created_at, updated_at,
            category:document_categories(id, name),
            owner:profiles!documents_owner_id_fkey(id, username, email)
        `)
        .eq('is_active', true)
        .order('doc_number', { ascending: true });

    if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
    }
    if (filters?.status) {
        query = query.eq('status', filters.status);
    }
    if (filters?.ownerId) {
        query = query.eq('owner_id', filters.ownerId);
    }
    if (filters?.search) {
        const term = filters.search.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
        if (term) {
            query = query.or(`title.ilike.%${term}%,doc_number.ilike.%${term}%,description.ilike.%${term}%`);
        }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as unknown as Document[];
}

export async function getDocument(documentId: string): Promise<Document & { current_revision?: DocumentRevision }> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('documents')
        .select(`
            id, doc_number, title, description, category_id, owner_id,
            organization_id, current_revision_id, status, review_period_months,
            next_review_date, is_active, created_by, created_at, updated_at,
            category:document_categories(id, name, description),
            owner:profiles!documents_owner_id_fkey(id, username, email),
            current_revision:document_revisions!fk_documents_current_revision(
                id, revision_number, change_summary, file_path, file_name,
                file_size, file_type, status, reviewed_by, reviewed_at,
                review_comments, is_review_only, created_at
            )
        `)
        .eq('id', documentId)
        .single();

    if (error) throw error;
    return data as unknown as Document & { current_revision?: DocumentRevision };
}

export async function createDocument(docData: CreateDocumentData): Promise<Document> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Fetch caller's org for multi-tenant isolation
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
    if (!profile?.organization_id) throw new Error('User has no organization');

    const { data, error } = await supabase
        .from('documents')
        .insert({
            doc_number: docData.doc_number,
            title: docData.title,
            description: docData.description || null,
            category_id: docData.category_id,
            owner_id: docData.owner_id,
            organization_id: profile.organization_id,
            review_period_months: docData.review_period_months,
            status: 'draft',
            created_by: user.id,
        })
        .select()
        .single();

    if (error) throw error;

    documentLogger('controlled_document_created', `Created document ${docData.doc_number}: ${docData.title}`, {
        entityType: 'document',
        entityId: data.id,
        entityName: `${docData.doc_number} - ${docData.title}`,
    });

    return data;
}

export async function updateDocument(id: string, updates: UpdateDocumentData): Promise<Document> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    documentLogger('controlled_document_updated', `Updated document ${data.doc_number}`, {
        entityType: 'document',
        entityId: id,
        entityName: `${data.doc_number} - ${data.title}`,
        details: updates as Record<string, unknown>,
    });

    return data;
}

export async function withdrawDocument(id: string): Promise<Document> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('documents')
        .update({ status: 'withdrawn' })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    documentLogger('controlled_document_withdrawn', `Withdrew document ${data.doc_number}`, {
        entityType: 'document',
        entityId: id,
        entityName: `${data.doc_number} - ${data.title}`,
    });

    return data;
}

// ============================================================================
// Revisions
// ============================================================================

export async function getRevisions(documentId: string): Promise<DocumentRevision[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('document_revisions')
        .select(`
            id, document_id, revision_number, change_summary,
            file_path, file_name, file_size, file_type,
            status, submitted_by, submitted_at,
            reviewed_by, reviewed_at, review_comments,
            is_review_only, created_by, created_at, updated_at,
            reviewer:profiles!document_revisions_reviewed_by_fkey(id, username)
        `)
        .eq('document_id', documentId)
        .order('revision_number', { ascending: false });

    if (error) throw error;
    return data as unknown as DocumentRevision[];
}

export async function createRevision(
    documentId: string,
    filePath: string,
    fileName: string,
    fileSize: number,
    fileType: string,
    changeSummary?: string
): Promise<DocumentRevision> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get next revision number
    const { data: existing } = await supabase
        .from('document_revisions')
        .select('revision_number')
        .eq('document_id', documentId)
        .order('revision_number', { ascending: false })
        .limit(1);

    const nextRevision = (existing?.[0]?.revision_number ?? 0) + 1;

    const { data, error } = await supabase
        .from('document_revisions')
        .insert({
            document_id: documentId,
            revision_number: nextRevision,
            change_summary: changeSummary || null,
            file_path: filePath,
            file_name: fileName,
            file_size: fileSize,
            file_type: fileType,
            status: 'draft',
            created_by: user.id,
        })
        .select()
        .single();

    if (error) throw error;

    documentLogger('document_revision_created', `Created revision ${nextRevision} for document`, {
        entityType: 'document',
        entityId: documentId,
        details: { revision_number: nextRevision },
    });

    return data;
}

export async function submitForReview(revisionId: string): Promise<DocumentRevision> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Verify revision is in 'draft' before allowing submission
    const { data: current, error: fetchError } = await supabase
        .from('document_revisions')
        .select('status')
        .eq('id', revisionId)
        .single();

    if (fetchError) throw fetchError;
    if (current.status !== 'draft') {
        throw new Error(`Cannot submit for review: revision is currently "${current.status}" (must be "draft")`);
    }

    const { data, error } = await supabase
        .from('document_revisions')
        .update({
            status: 'under_review',
            submitted_by: user.id,
            submitted_at: new Date().toISOString(),
        })
        .eq('id', revisionId)
        .select()
        .single();

    if (error) throw error;

    // Also update parent document status
    await supabase
        .from('documents')
        .update({ status: 'under_review' })
        .eq('id', data.document_id);

    documentLogger('document_submitted_for_review', `Submitted revision ${data.revision_number} for review`, {
        entityType: 'document',
        entityId: data.document_id,
        details: { revision_id: revisionId, revision_number: data.revision_number },
    });

    return data;
}

export async function approveRevision(revisionId: string, comments?: string): Promise<DocumentRevision> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Verify revision is in 'under_review' before allowing approval
    const { data: current, error: fetchError } = await supabase
        .from('document_revisions')
        .select('status')
        .eq('id', revisionId)
        .single();

    if (fetchError) throw fetchError;
    if (current.status !== 'under_review') {
        throw new Error(`Cannot approve: revision is currently "${current.status}" (must be "under_review")`);
    }

    // 1. Approve the revision
    const { data: revision, error } = await supabase
        .from('document_revisions')
        .update({
            status: 'approved',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            review_comments: comments || null,
        })
        .eq('id', revisionId)
        .select()
        .single();

    if (error) throw error;

    // 2. Get the parent document to find previous current revision
    const { data: doc } = await supabase
        .from('documents')
        .select('id, current_revision_id, review_period_months, doc_number, title')
        .eq('id', revision.document_id)
        .single();

    if (doc) {
        // 3. Mark previous revision as superseded
        if (doc.current_revision_id) {
            await supabase
                .from('document_revisions')
                .update({ status: 'superseded' })
                .eq('id', doc.current_revision_id);
        }

        // 4. Calculate next review date
        const nextReview = new Date();
        nextReview.setMonth(nextReview.getMonth() + (doc.review_period_months || 12));
        const nextReviewDate = nextReview.toISOString().split('T')[0];

        // 5. Update document: set current revision, status, and next review date
        await supabase
            .from('documents')
            .update({
                current_revision_id: revisionId,
                status: 'approved',
                next_review_date: nextReviewDate,
            })
            .eq('id', revision.document_id);

        // 6. Create review schedule entry
        await supabase
            .from('document_review_schedule')
            .insert({
                document_id: revision.document_id,
                due_date: nextReviewDate,
                status: 'pending',
            });
    }

    documentLogger('document_revision_approved', `Approved revision ${revision.revision_number}`, {
        entityType: 'document',
        entityId: revision.document_id,
        entityName: doc ? `${doc.doc_number} - ${doc.title}` : undefined,
        details: { revision_id: revisionId, revision_number: revision.revision_number },
    });

    return revision;
}

export async function rejectRevision(revisionId: string, comments: string): Promise<DocumentRevision> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Verify revision is in 'under_review' before allowing rejection
    const { data: current, error: fetchError } = await supabase
        .from('document_revisions')
        .select('status')
        .eq('id', revisionId)
        .single();

    if (fetchError) throw fetchError;
    if (current.status !== 'under_review') {
        throw new Error(`Cannot reject: revision is currently "${current.status}" (must be "under_review")`);
    }

    const { data, error } = await supabase
        .from('document_revisions')
        .update({
            status: 'rejected',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            review_comments: comments,
        })
        .eq('id', revisionId)
        .select()
        .single();

    if (error) throw error;

    documentLogger('document_revision_rejected', `Rejected revision ${data.revision_number}`, {
        entityType: 'document',
        entityId: data.document_id,
        details: { revision_id: revisionId, revision_number: data.revision_number, reason: comments },
    });

    return data;
}

// ============================================================================
// File Upload / Download
// ============================================================================

export async function uploadDocumentFile(
    file: File,
    documentId: string,
    revisionNumber: number
): Promise<{ path: string; name: string }> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const fileExt = file.name.split('.').pop();
    const filePath = `controlled-documents/${documentId}/${revisionNumber}_${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw error;

    return { path: filePath, name: file.name };
}

export async function getDocumentFileUrl(filePath: string): Promise<string> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    if (filePath.startsWith('http')) return filePath;

    const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600);

    if (error) throw error;
    return data.signedUrl;
}

export async function deleteDocumentFile(filePath: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { error } = await supabase.storage
        .from('documents')
        .remove([filePath]);

    if (error) throw error;
}

// ============================================================================
// Review Cycle
// ============================================================================

export async function getDocumentsDueForReview(daysAhead = 30): Promise<ReviewDueDocument[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .rpc('get_documents_due_for_review', { p_days_ahead: daysAhead });

    if (error) throw error;
    return data as ReviewDueDocument[];
}

export async function getReviewSchedule(documentId: string): Promise<DocumentReviewSchedule[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('document_review_schedule')
        .select('*')
        .eq('document_id', documentId)
        .order('due_date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function completeReviewNoChanges(documentId: string, reviewNotes?: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Find the current pending/due/overdue review
    const { data: reviews } = await supabase
        .from('document_review_schedule')
        .select('id')
        .eq('document_id', documentId)
        .in('status', ['pending', 'due', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(1);

    if (reviews && reviews.length > 0) {
        await supabase
            .from('document_review_schedule')
            .update({
                status: 'completed',
                completed_by: user.id,
                completed_at: new Date().toISOString(),
                no_changes_needed: true,
                review_notes: reviewNotes || null,
            })
            .eq('id', reviews[0].id);
    }

    // Get document to calculate next review date
    const { data: doc } = await supabase
        .from('documents')
        .select('review_period_months, doc_number, title')
        .eq('id', documentId)
        .single();

    if (doc) {
        const nextReview = new Date();
        nextReview.setMonth(nextReview.getMonth() + (doc.review_period_months || 12));
        const nextReviewDate = nextReview.toISOString().split('T')[0];

        // Update document next review date
        await supabase
            .from('documents')
            .update({ next_review_date: nextReviewDate })
            .eq('id', documentId);

        // Create next review schedule entry
        await supabase
            .from('document_review_schedule')
            .insert({
                document_id: documentId,
                due_date: nextReviewDate,
                status: 'pending',
            });
    }

    documentLogger('document_review_completed', `Completed review - no changes needed`, {
        entityType: 'document',
        entityId: documentId,
        entityName: doc ? `${doc.doc_number} - ${doc.title}` : undefined,
        details: { no_changes_needed: true, review_notes: reviewNotes },
    });
}

// ============================================================================
// Stats
// ============================================================================

export async function getDocumentStats(): Promise<DocumentStats> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: docs, error } = await supabase
        .from('documents')
        .select('status, next_review_date')
        .eq('is_active', true);

    if (error) throw error;

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const stats: DocumentStats = {
        total: docs?.length || 0,
        approved: 0,
        draft: 0,
        underReview: 0,
        dueForReview: 0,
        overdue: 0,
    };

    docs?.forEach((doc: { status: string; next_review_date: string | null }) => {
        if (doc.status === 'approved') stats.approved++;
        if (doc.status === 'draft') stats.draft++;
        if (doc.status === 'under_review') stats.underReview++;

        if (doc.status === 'approved' && doc.next_review_date) {
            const reviewDate = new Date(doc.next_review_date);
            if (reviewDate < now) {
                stats.overdue++;
            } else if (reviewDate <= thirtyDaysFromNow) {
                stats.dueForReview++;
            }
        }
    });

    return stats;
}

// ============================================================================
// Export
// ============================================================================

export default {
    getCategories,
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    getDocuments,
    getDocument,
    createDocument,
    updateDocument,
    withdrawDocument,
    getRevisions,
    createRevision,
    submitForReview,
    approveRevision,
    rejectRevision,
    uploadDocumentFile,
    getDocumentFileUrl,
    deleteDocumentFile,
    getDocumentsDueForReview,
    getReviewSchedule,
    completeReviewNoChanges,
    getDocumentStats,
};
