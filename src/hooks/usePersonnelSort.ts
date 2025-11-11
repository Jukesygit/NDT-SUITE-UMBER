import { useState, useMemo } from 'react';
import { filterOutPersonalDetails } from '../utils/competency-field-utils.js';
import type { PersonnelWithCompetencies } from '../types/index.js';

/**
 * Sort column options
 */
export type SortColumn = 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';

/**
 * Sort direction options
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Competency statistics for a person
 */
interface CompetencyStats {
    total: number;
    active: number;
    expiring: number;
    expired: number;
}

/**
 * Hook return type
 */
interface UsePersonnelSortReturn {
    sortedPersonnel: PersonnelWithCompetencies[];
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    handleSort: (column: SortColumn) => void;
}

/**
 * Calculate competency statistics for a person
 * Filters out personal details - only counts actual certifications/qualifications
 */
function getCompetencyStats(person: PersonnelWithCompetencies): CompetencyStats {
    const competencies = filterOutPersonalDetails(person.competencies || []);
    const total = competencies.length;
    const active = competencies.filter(c => c.status === 'active').length;
    const expiring = competencies.filter(c => {
        if (!c.expiry_date) return false;
        const daysUntilExpiry = Math.ceil((new Date(c.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
    }).length;
    const expired = competencies.filter(c =>
        c.status === 'expired' ||
        (c.expiry_date && new Date(c.expiry_date) < new Date())
    ).length;

    return { total, active, expiring, expired };
}

/**
 * Custom hook for sorting personnel by various criteria
 *
 * Supports sorting by:
 * - Name (username)
 * - Organization
 * - Role
 * - Total competencies
 * - Active competencies
 * - Expiring competencies
 * - Expired competencies
 *
 * Uses useMemo for performance optimization
 *
 * @param personnel - Array of personnel to sort
 * @returns Sorted personnel and sort controls
 */
export function usePersonnelSort(
    personnel: PersonnelWithCompetencies[]
): UsePersonnelSortReturn {
    const [sortColumn, setSortColumn] = useState<SortColumn>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    /**
     * Handle column header click
     * Toggles direction if clicking same column, otherwise sets new column with asc
     */
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            // Toggle direction if clicking same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column with ascending as default
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    /**
     * Sort personnel based on current sort column and direction
     * Memoized for performance
     */
    const sortedPersonnel = useMemo(() => {
        const sorted = [...personnel].sort((a, b) => {
            let comparison = 0;

            switch (sortColumn) {
                case 'name':
                    comparison = (a.username || '').localeCompare(b.username || '');
                    break;

                case 'org':
                    comparison = (a.organizations?.name || '').localeCompare(b.organizations?.name || '');
                    break;

                case 'role':
                    comparison = (a.role || '').localeCompare(b.role || '');
                    break;

                case 'total': {
                    const statsA = getCompetencyStats(a);
                    const statsB = getCompetencyStats(b);
                    comparison = statsA.total - statsB.total;
                    break;
                }

                case 'active': {
                    const statsA = getCompetencyStats(a);
                    const statsB = getCompetencyStats(b);
                    comparison = statsA.active - statsB.active;
                    break;
                }

                case 'expiring': {
                    const statsA = getCompetencyStats(a);
                    const statsB = getCompetencyStats(b);
                    comparison = statsA.expiring - statsB.expiring;
                    break;
                }

                case 'expired': {
                    const statsA = getCompetencyStats(a);
                    const statsB = getCompetencyStats(b);
                    comparison = statsA.expired - statsB.expired;
                    break;
                }

                default:
                    comparison = 0;
            }

            // Apply sort direction
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [personnel, sortColumn, sortDirection]);

    return {
        sortedPersonnel,
        sortColumn,
        sortDirection,
        handleSort
    };
}
