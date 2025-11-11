// @ts-nocheck - Hook uses JS imports that lack TypeScript definitions
import { useState, useEffect, useCallback } from 'react';
import personnelService from '../services/personnel-service.ts';
import competencyService from '../services/competency-service.ts';
import authManager from '../auth-manager.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import type { PersonnelWithCompetencies, CompetencyDefinition, Organization } from '../types/index.js';

/**
 * Hook return type
 */
interface UsePersonnelDataReturn {
    personnel: PersonnelWithCompetencies[];
    organizations: Organization[];
    competencyDefinitions: CompetencyDefinition[];
    expiringCompetencies: any[];
    pendingApprovals: any[];
    loading: boolean;
    error: string | null;
    refetch: (showSuccess?: boolean) => Promise<void>;
    updateCompetency: (personId: string, competencyId: string, updates: any) => void;
}

/**
 * Custom hook for managing personnel data fetching and state
 *
 * Handles:
 * - Loading all personnel with competencies (optimized 2-query pattern)
 * - Loading organizations
 * - Loading expiring competencies
 * - Loading competency definitions
 * - Loading pending approvals
 *
 * @returns Personnel data and refetch function
 */
export function usePersonnelData(): UsePersonnelDataReturn {
    const [personnel, setPersonnel] = useState<PersonnelWithCompetencies[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [competencyDefinitions, setCompetencyDefinitions] = useState<CompetencyDefinition[]>([]);
    const [expiringCompetencies, setExpiringCompetencies] = useState<any[]>([]);
    const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load pending approvals from database
     */
    const loadPendingApprovals = useCallback(async (): Promise<any[]> => {
        try {
            const { data, error } = await supabase
                .from('employee_competencies')
                .select(`
                    *,
                    competency:competency_definitions(id, name, category_id, category:competency_categories(name)),
                    user:profiles(id, username, email, organization_id)
                `)
                .eq('status', 'pending_approval')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Error loading pending approvals:', err);
            return [];
        }
    }, []);

    /**
     * Load all data in parallel (efficient!)
     * @param showSuccess - Whether to show success message (used after import)
     */
    const loadData = useCallback(async (showSuccess: boolean = false) => {
        if (!isSupabaseConfigured()) {
            setLoading(false);
            setError('Supabase not configured');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Load all data in parallel for optimal performance
            const [
                personnelData,
                orgsData,
                expiringData,
                competencyDefs,
                pendingData
            ] = await Promise.all([
                personnelService.getAllPersonnelWithCompetencies(),
                authManager.getOrganizations(),
                competencyService.getExpiringCompetencies(30),
                competencyService.getCompetencyDefinitions(),
                loadPendingApprovals()
            ]);

            // Update all state
            setPersonnel(personnelData);
            setOrganizations(orgsData.filter((org: any) => org.name !== 'SYSTEM'));
            setExpiringCompetencies(expiringData);
            setCompetencyDefinitions(competencyDefs);
            setPendingApprovals(pendingData);

            console.log('Personnel data loaded:', {
                personnel: personnelData.length,
                organizations: orgsData.length,
                expiring: expiringData.length,
                definitions: competencyDefs.length,
                pending: pendingData.length
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load personnel data';
            console.error('Error loading personnel data:', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [loadPendingApprovals]);

    // Load data on mount
    useEffect(() => {
        loadData();
    }, [loadData]);

    /**
     * Update a specific competency locally without full refetch
     * This prevents scroll position loss and maintains UX during updates
     */
    const updateCompetency = useCallback((personId: string, competencyId: string, updates: any) => {
        setPersonnel(prevPersonnel => {
            return prevPersonnel.map(person => {
                if (person.id !== personId) return person;

                return {
                    ...person,
                    competencies: person.competencies?.map(comp => {
                        if (comp.id !== competencyId) return comp;
                        return { ...comp, ...updates };
                    })
                };
            });
        });
    }, []);

    return {
        personnel,
        organizations,
        competencyDefinitions,
        expiringCompetencies,
        pendingApprovals,
        loading,
        error,
        refetch: loadData,
        updateCompetency
    };
}
