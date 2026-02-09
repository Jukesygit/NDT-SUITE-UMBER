/**
 * usePersonnelMutations - React Query mutations for personnel operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { personnelKeys, Person, PersonCompetency } from '../queries/usePersonnel';

// Services - ES module imports
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
// @ts-ignore - JS module without types
import personnelService from '../../services/personnel-service.js';

// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

// Types
export interface UpdatePersonData {
    username?: string;
    email?: string;
    role?: string;
    organization_id?: string;
    // Personal details
    mobile_number?: string;
    home_address?: string;
    nearest_uk_train_station?: string;
    date_of_birth?: string;
    next_of_kin?: string;
    next_of_kin_emergency_contact_number?: string;
    vantage_number?: string;
}

export interface UpdateCompetencyData {
    value?: string | null;
    issuing_body?: string | null;
    certification_id?: string | null;
    expiry_date?: string | null;
    notes?: string | null;
    witness_checked?: boolean;
    witnessed_by?: string | null;
    witnessed_at?: string | null;
    witness_notes?: string | null;
    created_at?: string; // issued_date maps to this
    document_url?: string | null;
    document_name?: string | null;
    status?: string | null;
}

export interface AddCompetencyData {
    user_id: string;
    competency_id: string;
    value?: string;
    issuing_body?: string;
    certification_id?: string;
    expiry_date?: string;
    notes?: string;
    document_url?: string;
    document_name?: string;
}

/**
 * Update a person's profile details
 */
export function useUpdatePerson() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            personId,
            data,
        }: {
            personId: string;
            data: UpdatePersonData;
        }): Promise<Person> => {
            // Clean the data: convert empty strings to null for optional fields
            // This prevents PostgreSQL errors for DATE fields and ensures clean data
            const cleanedData: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(data)) {
                // Convert empty strings to null for nullable fields
                if (value === '' || value === undefined) {
                    cleanedData[key] = null;
                } else {
                    cleanedData[key] = value;
                }
            }

            // Ensure date_of_birth is properly formatted or null
            if (cleanedData.date_of_birth && typeof cleanedData.date_of_birth === 'string') {
                // Validate date format (should be YYYY-MM-DD)
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(cleanedData.date_of_birth as string)) {
                    // Try to parse and reformat the date
                    const parsed = new Date(cleanedData.date_of_birth as string);
                    if (isNaN(parsed.getTime())) {
                        cleanedData.date_of_birth = null;
                    } else {
                        cleanedData.date_of_birth = parsed.toISOString().split('T')[0];
                    }
                }
            }

            const { data: updated, error } = await supabase
                .from('profiles')
                .update(cleanedData)
                .eq('id', personId)
                .select('*, organizations(*)')
                .single();

            if (error) {
                if (error.code === '42703') {
                    // Column does not exist
                    throw new Error(`Database schema error: A required column is missing. Please contact support.`);
                }
                throw error;
            }
            return updated;
        },
        onSuccess: (_, variables) => {
            // Invalidate personnel list to refresh data
            queryClient.invalidateQueries({ queryKey: personnelKeys.list() });
            // Invalidate specific person if cached
            queryClient.invalidateQueries({
                queryKey: personnelKeys.detail(variables.personId),
            });
        },
    });
}

/**
 * Update a person's competency
 * If a document is being added/updated, automatically sets status to 'pending_approval'
 */
export function useUpdatePersonCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            competencyId,
            data,
            previousDocumentUrl,
        }: {
            competencyId: string;
            personId: string; // For cache invalidation
            data: UpdateCompetencyData;
            previousDocumentUrl?: string | null; // To detect if document was newly added
        }): Promise<PersonCompetency> => {
            // If a document is being added or changed, set status to pending_approval
            const updateData = { ...data };
            if (data.document_url && data.document_url !== previousDocumentUrl) {
                updateData.status = 'pending_approval';
            }

            const { data: updated, error } = await supabase
                .from('employee_competencies')
                .update(updateData)
                .eq('id', competencyId)
                .select('*, competency:competency_definitions(*)')
                .single();

            if (error) throw error;
            return updated;
        },
        onSuccess: (_, variables) => {
            // Invalidate personnel list and specific person
            queryClient.invalidateQueries({ queryKey: personnelKeys.list() });
            queryClient.invalidateQueries({
                queryKey: personnelKeys.detail(variables.personId),
            });
            // Also invalidate matrix since it depends on competencies
            queryClient.invalidateQueries({ queryKey: personnelKeys.matrix() });
            // Invalidate pending approvals since status may have changed
            queryClient.invalidateQueries({ queryKey: ['competencies', 'pendingApprovals'] });
        },
    });
}

/**
 * Delete a person's competency
 */
export function useDeletePersonCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            competencyId,
        }: {
            competencyId: string;
            personId: string; // For cache invalidation
        }): Promise<void> => {
            const { error } = await supabase
                .from('employee_competencies')
                .delete()
                .eq('id', competencyId);

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: personnelKeys.list() });
            queryClient.invalidateQueries({
                queryKey: personnelKeys.detail(variables.personId),
            });
            queryClient.invalidateQueries({ queryKey: personnelKeys.matrix() });
        },
    });
}

/**
 * Add a competency to a person
 * If a document is included, automatically sets status to 'pending_approval'
 */
export function useAddPersonCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: AddCompetencyData): Promise<PersonCompetency> => {
            // If a document is included, set status to pending_approval
            const insertData = {
                ...data,
                status: data.document_url ? 'pending_approval' : 'active',
            };

            const { data: created, error } = await supabase
                .from('employee_competencies')
                .insert(insertData)
                .select('*, competency:competency_definitions(*)')
                .single();

            if (error) throw error;
            return created;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: personnelKeys.list() });
            queryClient.invalidateQueries({
                queryKey: personnelKeys.detail(variables.user_id),
            });
            queryClient.invalidateQueries({ queryKey: personnelKeys.matrix() });
            // Invalidate pending approvals since status may have changed
            queryClient.invalidateQueries({ queryKey: ['competencies', 'pendingApprovals'] });
        },
    });
}

/**
 * Export personnel to CSV
 * This is not a mutation but a utility function
 */
export async function exportPersonnelToCSV(personnel: Person[]): Promise<void> {
    try {
        const csv = await personnelService.exportPersonnelToCSV(personnel);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `personnel-competencies-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        throw error;
    }
}
