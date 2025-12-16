/**
 * PersonnelTable - Table component for displaying personnel list
 */

import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Person, PersonCompetency, CompetencyStats, Organization } from '../../hooks/queries/usePersonnel';
import { personnelKeys } from '../../hooks/queries/usePersonnel';
import personnelService from '../../services/personnel-service.js';
import { PersonnelExpandedRow } from './PersonnelExpandedRow';

interface PersonnelTableProps {
    /** Personnel data to display */
    personnel: Person[];
    /** Get competency stats for a person */
    getCompetencyStats: (competencies: PersonCompetency[]) => CompetencyStats;
    /** Current sort column */
    sortColumn: string;
    /** Current sort direction */
    sortDirection: 'asc' | 'desc';
    /** Sort change handler */
    onSort: (column: string) => void;
    /** Whether user is admin */
    isAdmin: boolean;
    /** Available organizations (for editing) */
    organizations: Organization[];
    /** Callback when person is updated */
    onPersonUpdate?: () => void;
}

type SortableColumn = 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';

/**
 * Sortable header cell
 */
function SortableHeader({
    column,
    label,
    sortColumn,
    sortDirection,
    onSort,
    align = 'left',
}: {
    column: SortableColumn;
    label: string;
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    onSort: (column: string) => void;
    align?: 'left' | 'center' | 'right';
}) {
    const isActive = sortColumn === column;

    return (
        <th
            style={{
                padding: '16px',
                textAlign: align,
                fontSize: '13px',
                fontWeight: '600',
                color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'color 0.2s',
            }}
            onClick={() => onSort(column)}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) =>
                (e.currentTarget.style.color = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)')
            }
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    justifyContent: align === 'center' ? 'center' : 'flex-start',
                }}
            >
                {label}
                {isActive && <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
            </div>
        </th>
    );
}

/**
 * Stat badge component
 */
function StatBadge({ value, color }: { value: number; color: string }) {
    return (
        <span style={{ fontSize: '16px', fontWeight: '600', color }}>
            {value}
        </span>
    );
}

/**
 * Chevron icon for expand/collapse
 */
function ChevronIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg
            style={{
                width: '16px',
                height: '16px',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
    );
}

/**
 * PersonnelTable component
 */
export function PersonnelTable({
    personnel,
    getCompetencyStats,
    sortColumn,
    sortDirection,
    onSort,
    isAdmin,
    organizations,
    onPersonUpdate,
}: PersonnelTableProps) {
    const queryClient = useQueryClient();
    const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);

    const handleToggleExpand = useCallback((personId: string) => {
        setExpandedPersonId((prev) => (prev === personId ? null : personId));
    }, []);

    // Prefetch person details when hovering over a row
    const handlePersonHover = useCallback((personId: string) => {
        queryClient.prefetchQuery({
            queryKey: personnelKeys.detail(personId),
            queryFn: async () => {
                const report = await personnelService.getPersonnelComplianceReport(personId);
                return report?.person || null;
            },
            staleTime: 1 * 60 * 1000, // Match the hook's staleTime
        });
    }, [queryClient]);

    if (personnel.length === 0) {
        return (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                    style={{
                        padding: '48px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.5)',
                    }}
                >
                    No personnel found matching your filters
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <tr>
                            <SortableHeader
                                column="name"
                                label="Name"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                            />
                            <SortableHeader
                                column="org"
                                label="Organization"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                            />
                            <SortableHeader
                                column="role"
                                label="Role"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                            />
                            <SortableHeader
                                column="total"
                                label="Total Certs"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                                align="center"
                            />
                            <SortableHeader
                                column="active"
                                label="Active"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                                align="center"
                            />
                            <SortableHeader
                                column="expiring"
                                label="Expiring"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                                align="center"
                            />
                            <SortableHeader
                                column="expired"
                                label="Expired"
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={onSort}
                                align="center"
                            />
                            <th
                                style={{
                                    padding: '16px',
                                    textAlign: 'right',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {personnel.map((person) => {
                            const stats = getCompetencyStats(person.competencies || []);
                            const isExpanded = expandedPersonId === person.id;

                            return (
                                <React.Fragment key={person.id}>
                                    {/* Main Row */}
                                    <tr
                                        style={{
                                            borderBottom: isExpanded
                                                ? '1px solid rgba(59, 130, 246, 0.3)'
                                                : '1px solid rgba(255, 255, 255, 0.05)',
                                        }}
                                        className="hover:bg-white/5 transition-colors"
                                        onMouseEnter={() => handlePersonHover(person.id)}
                                    >
                                        <td style={{ padding: '16px' }}>
                                            <div
                                                style={{
                                                    fontWeight: '600',
                                                    color: '#ffffff',
                                                    marginBottom: '4px',
                                                }}
                                            >
                                                {person.username}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: '13px',
                                                    color: 'rgba(255, 255, 255, 0.5)',
                                                }}
                                            >
                                                {person.email}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                            {person.organizations?.name || 'Unknown'}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span className="glass-badge">{person.role}</span>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <StatBadge value={stats.total} color="#ffffff" />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <StatBadge value={stats.active} color="#10b981" />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <StatBadge value={stats.expiring} color="#f59e0b" />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <StatBadge value={stats.expired} color="#ef4444" />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleToggleExpand(person.id)}
                                                className="btn-primary"
                                                style={{
                                                    fontSize: '13px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    marginLeft: 'auto',
                                                }}
                                            >
                                                {isExpanded ? 'Hide Details' : 'View Details'}
                                                <ChevronIcon expanded={isExpanded} />
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Expanded Row */}
                                    {isExpanded && (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                style={{
                                                    padding: 0,
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                }}
                                            >
                                                <PersonnelExpandedRow
                                                    person={person}
                                                    isAdmin={isAdmin}
                                                    organizations={organizations}
                                                    onUpdate={onPersonUpdate}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default PersonnelTable;
