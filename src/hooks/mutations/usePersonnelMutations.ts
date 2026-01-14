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
}

export interface AddCompetencyData {
    user_id: string;
    competency_id: string;
    value?: string;
    issuing_body?: string;
    certification_id?: string;
    expiry_date?: string;
    notes?: string;
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
            const { data: updated, error } = await supabase
                .from('profiles')
                .update(data)
                .eq('id', personId)
                .select('*, organizations(*)')
                .single();

            if (error) throw error;
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
 */
export function useUpdatePersonCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            competencyId,
            data,
        }: {
            competencyId: string;
            personId: string; // For cache invalidation
            data: UpdateCompetencyData;
        }): Promise<PersonCompetency> => {
            const { data: updated, error } = await supabase
                .from('employee_competencies')
                .update(data)
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
 */
export function useAddPersonCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: AddCompetencyData): Promise<PersonCompetency> => {
            const { data: created, error } = await supabase
                .from('employee_competencies')
                .insert(data)
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
        console.error('Error exporting:', error);
        throw error;
    }
}
