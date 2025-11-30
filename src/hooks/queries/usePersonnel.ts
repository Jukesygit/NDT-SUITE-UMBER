/**
 * usePersonnel - React Query hooks for personnel data
 */

import { useQuery } from '@tanstack/react-query';

// Services - ES module imports
import personnelService from '../../services/personnel-service.js';
import authManager from '../../auth-manager.js';

// Types
export interface Organization {
    id: string;
    name: string;
    slug?: string;
}

export interface PersonCompetency {
    id: string;
    competency_id: string;
    user_id: string;
    value?: string;
    issuing_body?: string;
    certification_id?: string;
    expiry_date?: string;
    created_at?: string;
    notes?: string;
    status?: 'active' | 'expired' | 'pending' | 'pending_approval';
    witness_checked?: boolean;
    witnessed_by?: string;
    witnessed_at?: string;
    witness_notes?: string;
    competency?: {
        id: string;
        name: string;
        category: string;
        is_certification?: boolean;
    };
}

export interface Person {
    id: string;
    username: string;
    email: string;
    role: string;
    organization_id?: string;
    organizations?: Organization;
    competencies?: PersonCompetency[];
    avatar_url?: string;
}

export interface CompetencyStats {
    total: number;
    active: number;
    expiring: number;
    expired: number;
}

export interface CompetencyMatrixEntry {
    person_id: string;
    person_name: string;
    competencies: Record<string, boolean>;
}

export interface CompetencyDefinition {
    id: string;
    name: string;
    description?: string;
    field_type?: string;
    category_id?: string;
    category?: { id: string; name: string; description?: string };
}

export interface CompetencyMatrix {
    competencies: CompetencyDefinition[];
    personnel: Array<{
        id: string;
        username: string;
        email: string;
        organization_id?: string;
        role: string;
        competencies: PersonCompetency[];
    }>;
}

/**
 * Query keys for personnel data
 */
export const personnelKeys = {
    all: ['personnel'] as const,
    list: () => [...personnelKeys.all, 'list'] as const,
    detail: (id: string) => [...personnelKeys.all, 'detail', id] as const,
    matrix: () => [...personnelKeys.all, 'matrix'] as const,
    organizations: () => ['organizations'] as const,
};

/**
 * Fetch all personnel with their competencies
 */
export function usePersonnel() {
    return useQuery({
        queryKey: personnelKeys.list(),
        queryFn: async (): Promise<Person[]> => {
            const data = await personnelService.getAllPersonnelWithCompetencies();
            return data || [];
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch a single person's details
 */
export function usePersonDetail(personId: string | undefined) {
    return useQuery({
        queryKey: personnelKeys.detail(personId || ''),
        queryFn: async (): Promise<Person | null> => {
            if (!personId) return null;
            // Use compliance report to get single person with competencies
            const report = await personnelService.getPersonnelComplianceReport(personId);
            return report?.person || null;
        },
        enabled: !!personId,
        staleTime: 1 * 60 * 1000, // 1 minute
    });
}

/**
 * Fetch organizations (filtered to exclude SYSTEM)
 */
export function useOrganizations() {
    return useQuery({
        queryKey: personnelKeys.organizations(),
        queryFn: async (): Promise<Organization[]> => {
            const orgs = await authManager.getOrganizations();
            // Filter out SYSTEM organization
            return (orgs || []).filter((org: Organization) => org.name !== 'SYSTEM');
        },
        staleTime: 5 * 60 * 1000, // 5 minutes - orgs change rarely
    });
}

/**
 * Fetch competency matrix for all personnel
 */
export function useCompetencyMatrix() {
    return useQuery({
        queryKey: personnelKeys.matrix(),
        queryFn: async (): Promise<CompetencyMatrix> => {
            const matrix = await personnelService.getCompetencyMatrix();
            return matrix;
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Calculate competency stats for a person
 * This is a pure function, not a hook - used for derived data
 */
export function getCompetencyStats(competencies: PersonCompetency[]): CompetencyStats {
    const total = competencies.length;
    const active = competencies.filter(c => c.status === 'active').length;
    const expiring = competencies.filter(c => {
        if (!c.expiry_date) return false;
        const daysUntilExpiry = Math.ceil(
            (new Date(c.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
    }).length;
    const expired = competencies.filter(
        c => c.status === 'expired' || (c.expiry_date && new Date(c.expiry_date) < new Date())
    ).length;

    return { total, active, expiring, expired };
}

export default usePersonnel;
