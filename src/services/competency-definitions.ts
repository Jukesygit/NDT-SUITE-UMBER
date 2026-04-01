/**
 * Competency Definition & Category Admin Operations
 * CRUD operations for managing competency categories and definitions (admin only).
 */
// @ts-ignore - JS module without type declarations
import supabase, { isSupabaseConfigured } from '../supabase-client';
// @ts-ignore - JS module without type declarations
import authManager from '../auth-manager.js';
import { logActivity } from './activity-log-service.ts';
import type { CompetencyCategory, CompetencyDefinition } from '../types/database.types';

export interface CategoryCreateData {
    name: string;
    description?: string | null;
}
export interface CategoryUpdateData {
    name?: string;
    description?: string | null;
    is_active?: boolean;
}
export interface DefinitionCreateData {
    name: string;
    description?: string | null;
    category_id: string;
    field_type?: CompetencyDefinition['field_type'];
    requires_document?: boolean;
    requires_approval?: boolean;
}
export interface DefinitionUpdateData {
    name?: string;
    description?: string | null;
    category_id?: string;
    field_type?: CompetencyDefinition['field_type'];
    requires_document?: boolean;
    requires_approval?: boolean;
    is_active?: boolean;
}
export interface DeleteResult { success: boolean; softDeleted: boolean; }

const DEFINITION_WITH_CATEGORY = '*, category:competency_categories(id, name)';

function ensureConfigured(): void {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
}

/** Check if current user is admin (throws if not) */
export function requireAdmin(): any {
    const currentUser = authManager.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');
    if (currentUser.role !== 'admin') throw new Error('Admin access required');
    return currentUser;
}

/** Create a new competency category (admin only) */
export async function createCategory(data: CategoryCreateData): Promise<CompetencyCategory> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const { data: existing } = await supabase
        .from('competency_categories').select('display_order')
        .order('display_order', { ascending: false }).limit(1);
    const maxOrder = existing?.[0]?.display_order ?? 0;

    const { data: result, error } = await supabase
        .from('competency_categories')
        .insert({ name: data.name, description: data.description || null, display_order: maxOrder + 1, is_active: true })
        .select().single();
    if (error) throw error;

    logActivity({
        userId: currentUser.id, actionType: 'category_created', actionCategory: 'admin',
        description: `Created competency category: ${data.name}`,
        entityType: 'competency_category', entityId: result.id, details: { name: data.name }
    });
    return result;
}

/** Update a competency category (admin only) */
export async function updateCategory(id: string, data: CategoryUpdateData): Promise<CompetencyCategory> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    const { data: result, error } = await supabase
        .from('competency_categories').update(updates).eq('id', id).select().single();
    if (error) throw error;

    logActivity({
        userId: currentUser.id, actionType: 'category_updated', actionCategory: 'admin',
        description: `Updated competency category: ${result.name}`,
        entityType: 'competency_category', entityId: id, details: updates
    });
    return result;
}

/** Delete (deactivate) a competency category (admin only) */
export async function deleteCategory(id: string, hardDelete: boolean = false): Promise<DeleteResult> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const { data: definitions } = await supabase
        .from('competency_definitions').select('id').eq('category_id', id).limit(1);
    const hasDefinitions = definitions && definitions.length > 0;

    if (hardDelete && !hasDefinitions) {
        const { error } = await supabase.from('competency_categories').delete().eq('id', id);
        if (error) throw error;
        logActivity({
            userId: currentUser.id, actionType: 'category_deleted', actionCategory: 'admin',
            description: 'Permanently deleted competency category',
            entityType: 'competency_category', entityId: id
        });
    } else {
        await updateCategory(id, { is_active: false });
    }
    return { success: true, softDeleted: hasDefinitions || !hardDelete };
}

/** Reorder categories (admin only) */
export async function reorderCategories(orderedIds: string[]): Promise<{ success: boolean }> {
    ensureConfigured();
    requireAdmin();
    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from('competency_categories').update({ display_order: i + 1 }).eq('id', orderedIds[i]);
        if (error) throw error;
    }
    return { success: true };
}

/** Create a new competency definition (admin only) */
export async function createDefinition(data: DefinitionCreateData): Promise<any> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const { data: existing } = await supabase
        .from('competency_definitions').select('display_order')
        .eq('category_id', data.category_id).order('display_order', { ascending: false }).limit(1);
    const maxOrder = existing?.[0]?.display_order ?? 0;

    const { data: result, error } = await supabase
        .from('competency_definitions')
        .insert({
            name: data.name, description: data.description || null,
            category_id: data.category_id, field_type: data.field_type || 'text',
            requires_document: data.requires_document || false,
            requires_approval: data.requires_approval || false,
            display_order: maxOrder + 1, is_active: true
        })
        .select(DEFINITION_WITH_CATEGORY).single();
    if (error) throw error;

    logActivity({
        userId: currentUser.id, actionType: 'definition_created', actionCategory: 'admin',
        description: `Created competency type: ${data.name}`,
        entityType: 'competency_definition', entityId: result.id,
        details: { name: data.name, category_id: data.category_id, field_type: data.field_type }
    });
    return result;
}

/** Update a competency definition (admin only) */
export async function updateDefinition(id: string, data: DefinitionUpdateData): Promise<any> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.category_id !== undefined) updates.category_id = data.category_id;
    if (data.field_type !== undefined) updates.field_type = data.field_type;
    if (data.requires_document !== undefined) updates.requires_document = data.requires_document;
    if (data.requires_approval !== undefined) updates.requires_approval = data.requires_approval;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    const { data: result, error } = await supabase
        .from('competency_definitions').update(updates).eq('id', id)
        .select(DEFINITION_WITH_CATEGORY).single();
    if (error) throw error;

    logActivity({
        userId: currentUser.id, actionType: 'definition_updated', actionCategory: 'admin',
        description: `Updated competency type: ${result.name}`,
        entityType: 'competency_definition', entityId: id, details: updates
    });
    return result;
}

/** Delete (deactivate) a competency definition (admin only) */
export async function deleteDefinition(id: string, hardDelete: boolean = false): Promise<DeleteResult> {
    ensureConfigured();
    const currentUser = requireAdmin();

    const { data: employeeCompetencies } = await supabase
        .from('employee_competencies').select('id').eq('competency_id', id).limit(1);
    const hasEmployeeRecords = employeeCompetencies && employeeCompetencies.length > 0;

    if (hardDelete && !hasEmployeeRecords) {
        const { error } = await supabase.from('competency_definitions').delete().eq('id', id);
        if (error) throw error;
        logActivity({
            userId: currentUser.id, actionType: 'definition_deleted', actionCategory: 'admin',
            description: 'Permanently deleted competency type',
            entityType: 'competency_definition', entityId: id
        });
    } else {
        await updateDefinition(id, { is_active: false });
    }
    return { success: true, softDeleted: hasEmployeeRecords || !hardDelete };
}

/** Reorder definitions within a category (admin only) */
export async function reorderDefinitions(
    categoryId: string, orderedIds: string[]
): Promise<{ success: boolean }> {
    ensureConfigured();
    requireAdmin();
    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from('competency_definitions').update({ display_order: i + 1 })
            .eq('id', orderedIds[i]).eq('category_id', categoryId);
        if (error) throw error;
    }
    return { success: true };
}
