import { useState, useMemo } from 'react';
import type { PersonnelWithCompetencies } from '../types/index.js';

/**
 * Filter state interface
 */
export interface FilterState {
    searchTerm: string;
    filterOrg: string;
    filterRole: string;
    filterCompetencies: string[];
}

/**
 * Hook return type
 */
interface UsePersonnelFiltersReturn {
    filteredPersonnel: PersonnelWithCompetencies[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterOrg: string;
    setFilterOrg: (org: string) => void;
    filterRole: string;
    setFilterRole: (role: string) => void;
    filterCompetencies: string[];
    setFilterCompetencies: (competencies: string[]) => void;
    clearFilters: () => void;
}

/**
 * Custom hook for filtering personnel based on multiple criteria
 *
 * Filters include:
 * - Search term (username/email)
 * - Organization
 * - Role
 * - Competencies (must have ALL selected competencies)
 *
 * Uses useMemo for performance optimization
 *
 * @param personnel - Array of personnel to filter
 * @returns Filtered personnel and filter controls
 */
export function usePersonnelFilters(
    personnel: PersonnelWithCompetencies[]
): UsePersonnelFiltersReturn {
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [filterOrg, setFilterOrg] = useState<string>('all');
    const [filterRole, setFilterRole] = useState<string>('all');
    const [filterCompetencies, setFilterCompetencies] = useState<string[]>([]);

    /**
     * Apply all filters to personnel list
     * Memoized for performance - only recalculates when dependencies change
     */
    const filteredPersonnel = useMemo(() => {
        return personnel.filter(person => {
            // Filter by search term (username or email)
            const matchesSearch = !searchTerm ||
                person.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                person.email?.toLowerCase().includes(searchTerm.toLowerCase());

            // Filter by organization
            const matchesOrg = filterOrg === 'all' || person.organization_id === filterOrg;

            // Filter by role
            const matchesRole = filterRole === 'all' || person.role === filterRole;

            // Filter by competencies - person must have ALL selected competencies
            // and they must be active or not expired
            const matchesCompetencies = filterCompetencies.length === 0 ||
                filterCompetencies.every(compId =>
                    person.competencies?.some(c =>
                        c.competency_id === compId &&
                        (c.status === 'active' ||
                         (c.expiry_date && new Date(c.expiry_date) >= new Date()))
                    )
                );

            return matchesSearch && matchesOrg && matchesRole && matchesCompetencies;
        });
    }, [personnel, searchTerm, filterOrg, filterRole, filterCompetencies]);

    /**
     * Clear all filters and reset to defaults
     */
    const clearFilters = () => {
        setSearchTerm('');
        setFilterOrg('all');
        setFilterRole('all');
        setFilterCompetencies([]);
    };

    return {
        filteredPersonnel,
        searchTerm,
        setSearchTerm,
        filterOrg,
        setFilterOrg,
        filterRole,
        setFilterRole,
        filterCompetencies,
        setFilterCompetencies,
        clearFilters
    };
}
