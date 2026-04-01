/**
 * Competency Query Operations
 * Read/fetch operations for competencies, categories, and definitions.
 */
// @ts-ignore - JS module without type declarations
import supabase, { isSupabaseConfigured } from '../supabase-client';
// @ts-ignore - JS module without type declarations
import authManager from '../auth-manager.js';
import type { CompetencyCategory } from '../types/database.types';

function ensureConfigured(): void {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
}

/** Get all active competency categories */
export async function getCategories(): Promise<CompetencyCategory[]> {
    ensureConfigured();
    const { data, error } = await supabase
        .from('competency_categories')
        .select('id, name, description, display_order, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
    if (error) throw error;
    return data;
}

/** Get competency definitions by category */
export async function getCompetencyDefinitions(categoryId: string | null = null): Promise<any[]> {
    ensureConfigured();
    let query = supabase
        .from('competency_definitions')
        .select(`
            id, name, description, field_type, category_id, display_order,
            is_active, requires_document, requires_approval,
            category:competency_categories(id, name, description)
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/** Get all competency definitions (without category filter) */
export async function getAllCompetencyDefinitions(): Promise<any[]> {
    return getCompetencyDefinitions(null);
}

/** Get competencies for a specific user */
export async function getUserCompetencies(userId: string): Promise<any[]> {
    ensureConfigured();
    const { data, error } = await supabase
        .from('employee_competencies')
        .select(`
            id, user_id, competency_id, value, expiry_date, document_url,
            document_name, notes, status, witness_checked, witnessed_by,
            witnessed_at, witness_notes, level, created_at, updated_at,
            competency:competency_definitions!inner(
                id, name, description, field_type, is_active,
                category:competency_categories(id, name)
            )
        `)
        .eq('user_id', userId)
        .eq('competency_definitions.is_active', true)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

/** Get competencies grouped by category for a user */
export async function getUserCompetenciesByCategory(userId: string): Promise<any[]> {
    const competencies = await getUserCompetencies(userId);
    const categories = await getCategories();
    const grouped: Record<string, { category: CompetencyCategory; competencies: any[] }> = {};
    categories.forEach((cat: CompetencyCategory) => {
        grouped[cat.id] = { category: cat, competencies: [] };
    });
    competencies.forEach((comp: any) => {
        const catId = comp.competency?.category?.id;
        if (catId && grouped[catId]) grouped[catId].competencies.push(comp);
    });
    return Object.values(grouped);
}

/** Get competency history for a user */
export async function getCompetencyHistory(userId: string): Promise<any[]> {
    ensureConfigured();
    const { data, error } = await supabase
        .from('competency_history')
        .select(`
            id, user_id, competency_id, action, old_value, new_value,
            changed_by, created_at, competency:competency_definitions(name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return data;
}

/** Get signed URL for a competency document (valid for 1 hour) */
export async function getDocumentUrl(filePath: string): Promise<string> {
    ensureConfigured();
    if (filePath.startsWith('http')) return filePath;
    const { data, error } = await supabase.storage
        .from('documents').createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
}

/** Check if current user can manage competencies for target user */
export async function canManageCompetencies(targetUserId: string): Promise<boolean> {
    const currentUser = authManager.getCurrentUser();
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.id === targetUserId) return true;
    if (currentUser.role === 'org_admin') {
        const { data: targetProfile } = await supabase
            .from('profiles').select('organization_id').eq('id', targetUserId).single();
        return targetProfile?.organization_id === currentUser.organizationId;
    }
    return false;
}

/** Get all competencies pending document approval */
export async function getPendingApprovals(): Promise<any[]> {
    ensureConfigured();
    const { data: competencies, error: compError } = await supabase
        .from('employee_competencies')
        .select(`
            id, user_id, competency_id, value, expiry_date, document_url,
            document_name, notes, status, created_at, updated_at,
            issuing_body, certification_id,
            competency:competency_definitions(
                id, name, description, field_type,
                category:competency_categories(id, name)
            )
        `)
        .eq('status', 'pending_approval')
        .not('document_url', 'is', null)
        .order('created_at', { ascending: false });
    if (compError) throw compError;
    if (!competencies || competencies.length === 0) return [];

    const userIds = [...new Set(competencies.map((c: any) => c.user_id))];
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, email, avatar_url, organization_id, organizations(id, name)')
        .in('id', userIds);
    if (profileError) throw profileError;

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return competencies.map((comp: any) => ({
        ...comp,
        user: profileMap.get(comp.user_id) || null
    }));
}

/** Get expiring competencies */
export async function getExpiringCompetencies(
    daysThreshold: number = 30, includeComments: boolean = false
): Promise<any[]> {
    ensureConfigured();
    const functionName = includeComments
        ? 'get_expiring_competencies_with_comments'
        : 'get_expiring_competencies';
    const { data, error } = await supabase.rpc(functionName, { days_threshold: daysThreshold });

    if (error && error.message?.includes('function')) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysThreshold);
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('employee_competencies')
            .select(`
                id, user_id, competency_id, value, expiry_date, status,
                profiles!employee_competencies_user_id_fkey(username, email),
                competency_definitions!employee_competencies_competency_id_fkey(name)
            `)
            .not('expiry_date', 'is', null)
            .gte('expiry_date', new Date().toISOString())
            .lte('expiry_date', futureDate.toISOString())
            .eq('status', 'active')
            .order('expiry_date', { ascending: true });
        if (fallbackError) throw fallbackError;

        return (fallbackData || []).map((item: any) => ({
            user_id: item.user_id, username: item.profiles?.username,
            email: item.profiles?.email, competency_id: item.id,
            competency_name: item.competency_definitions?.name,
            expiry_date: item.expiry_date,
            days_until_expiry: Math.ceil(
                (new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            ),
            ...(includeComments && {
                comment_count: 0, latest_comment: null,
                latest_comment_type: null, has_renewal_in_progress: false
            })
        }));
    }
    if (error) throw error;
    return data || [];
}

/** Get all categories (including inactive) for admin view */
export async function getAllCategories(includeInactive: boolean = true): Promise<CompetencyCategory[]> {
    ensureConfigured();
    let query = supabase.from('competency_categories').select('*')
        .order('display_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/** Get all competency definitions (including inactive) for admin view */
export async function getAllDefinitions(
    includeInactive: boolean = true, categoryId: string | null = null
): Promise<any[]> {
    ensureConfigured();
    let query = supabase.from('competency_definitions')
        .select('*, category:competency_categories(id, name)')
        .order('display_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/** Get usage count for a definition (how many employees have this cert) */
export async function getDefinitionUsageCount(definitionId: string): Promise<number> {
    ensureConfigured();
    const { count, error } = await supabase
        .from('employee_competencies')
        .select('*', { count: 'exact', head: true })
        .eq('competency_id', definitionId);
    if (error) throw error;
    return count || 0;
}
