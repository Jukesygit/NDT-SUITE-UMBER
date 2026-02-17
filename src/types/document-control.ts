// Document Control System Types

export type DocumentStatus = 'draft' | 'under_review' | 'approved' | 'superseded' | 'withdrawn';
export type RevisionStatus = 'draft' | 'under_review' | 'approved' | 'rejected' | 'superseded';
export type ReviewScheduleStatus = 'pending' | 'due' | 'overdue' | 'in_progress' | 'completed' | 'skipped';

export interface DocumentCategory {
    id: string;
    name: string;
    description: string | null;
    display_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Document {
    id: string;
    doc_number: string;
    title: string;
    description: string | null;
    category_id: string;
    category?: DocumentCategory;
    owner_id: string;
    owner?: { id: string; username: string; email: string };
    organization_id: string;
    current_revision_id: string | null;
    current_revision?: DocumentRevision;
    status: DocumentStatus;
    review_period_months: number;
    next_review_date: string | null;
    is_active: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface DocumentRevision {
    id: string;
    document_id: string;
    revision_number: number;
    change_summary: string | null;
    file_path: string;
    file_name: string;
    file_size: number | null;
    file_type: string | null;
    status: RevisionStatus;
    submitted_by: string | null;
    submitted_at: string | null;
    reviewed_by: string | null;
    reviewer?: { id: string; username: string };
    reviewed_at: string | null;
    review_comments: string | null;
    is_review_only: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface DocumentReviewSchedule {
    id: string;
    document_id: string;
    due_date: string;
    status: ReviewScheduleStatus;
    completed_by: string | null;
    completed_at: string | null;
    resulting_revision_id: string | null;
    no_changes_needed: boolean;
    review_notes: string | null;
    reminder_sent_at: string | null;
    overdue_reminder_sent_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface DocumentFilters {
    categoryId?: string;
    status?: DocumentStatus;
    search?: string;
    ownerId?: string;
}

export interface DocumentStats {
    total: number;
    approved: number;
    draft: number;
    underReview: number;
    dueForReview: number;
    overdue: number;
}

export interface CreateDocumentData {
    doc_number: string;
    title: string;
    description?: string;
    category_id: string;
    owner_id: string;
    review_period_months: number;
}

export interface UpdateDocumentData {
    title?: string;
    description?: string;
    category_id?: string;
    owner_id?: string;
    review_period_months?: number;
}

export interface CreateRevisionData {
    document_id: string;
    change_summary?: string;
    file: File;
}

export interface ReviewDueDocument {
    document_id: string;
    doc_number: string;
    title: string;
    category_name: string;
    owner_username: string;
    owner_email: string;
    next_review_date: string;
    days_until_review: number;
    is_overdue: boolean;
}
