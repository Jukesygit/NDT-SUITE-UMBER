/**
 * PersonnelTable - Table component for displaying personnel list
 */

import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Person, PersonCompetency, CompetencyStats, Organization } from '../../hooks/queries/usePersonnel';
import { personnelKeys, getPendingApprovalCount } from '../../hooks/queries/usePersonnel';
import personnelService from '../../services/personnel-service.js';
import { PersonnelExpandedRow } from './PersonnelExpandedRow';
import { PersonDocumentReviewModal } from './PersonDocumentReviewModal';
import { PersonAvatar } from './PersonAvatar';

interface PersonnelTableProps {
    personnel: Person[];
    getCompetencyStats: (competencies: PersonCompetency[]) => CompetencyStats;
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    onSort: (column: string) => void;
    isAdmin: boolean;
    organizations: Organization[];
    onPersonUpdate?: () => void;
}

type SortableColumn = 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';

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
            className={`pm-table th ${isActive ? 'active' : ''} ${align === 'center' ? 'center' : ''} ${align === 'right' ? 'right' : ''}`}
            onClick={() => onSort(column)}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
                {label}
                {isActive && <span className="pm-sort-indicator">{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>}
            </div>
        </th>
    );
}

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
    const [reviewingPerson, setReviewingPerson] = useState<Person | null>(null);

    const handleToggleExpand = useCallback((personId: string) => {
        setExpandedPersonId((prev) => (prev === personId ? null : personId));
    }, []);

    const handleOpenReview = useCallback((person: Person) => {
        setReviewingPerson(person);
    }, []);

    const handleCloseReview = useCallback(() => {
        setReviewingPerson(null);
        onPersonUpdate?.();
    }, [onPersonUpdate]);

    const handlePersonHover = useCallback((personId: string) => {
        queryClient.prefetchQuery({
            queryKey: personnelKeys.detail(personId),
            queryFn: async () => {
                const report = await personnelService.getPersonnelComplianceReport(personId);
                return report?.person || null;
            },
            staleTime: 1 * 60 * 1000,
        });
    }, [queryClient]);

    if (personnel.length === 0) {
        return (
            <div className="pm-table-card">
                <div className="pm-empty">
                    <div className="pm-empty-icon">
                        <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div className="pm-empty-title">No personnel found</div>
                    <div className="pm-empty-text">Try adjusting your search or filter criteria</div>
                </div>
            </div>
        );
    }

    return (
        <div className="pm-table-card">
            <div style={{ overflowX: 'auto' }}>
                <table className="pm-table">
                    <thead>
                        <tr>
                            <SortableHeader column="name" label="Name" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
                            <SortableHeader column="org" label="Organization" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
                            <SortableHeader column="role" label="Role" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
                            <SortableHeader column="total" label="Total" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="center" />
                            <SortableHeader column="active" label="Active" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="center" />
                            <SortableHeader column="expiring" label="Expiring" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="center" />
                            <SortableHeader column="expired" label="Expired" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="center" />
                            <th className="pm-table th no-sort right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {personnel.map((person) => {
                            const stats = getCompetencyStats(person.competencies || []);
                            const isExpanded = expandedPersonId === person.id;

                            return (
                                <React.Fragment key={person.id}>
                                    <tr
                                        className={`pm-table-row ${isExpanded ? 'expanded' : ''}`}
                                        onMouseEnter={() => handlePersonHover(person.id)}
                                    >
                                        <td className="pm-table td">
                                            <div className="pm-person-cell">
                                                <PersonAvatar
                                                    avatarUrl={person.avatar_url}
                                                    username={person.username}
                                                    size={48}
                                                />
                                                <div>
                                                    <div className="pm-person-name">{person.username}</div>
                                                    <div className="pm-person-email">{person.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="pm-table td">
                                            {person.organizations?.name || 'Unknown'}
                                        </td>
                                        <td className="pm-table td">
                                            <span className="pm-role-badge">{person.role}</span>
                                        </td>
                                        <td className="pm-table td center">
                                            <span className="pm-cert-stat total">{stats.total}</span>
                                        </td>
                                        <td className="pm-table td center">
                                            <span className="pm-cert-stat active">{stats.active}</span>
                                        </td>
                                        <td className="pm-table td center">
                                            <span className="pm-cert-stat expiring">{stats.expiring}</span>
                                        </td>
                                        <td className="pm-table td center">
                                            <span className="pm-cert-stat expired">{stats.expired}</span>
                                        </td>
                                        <td className="pm-table td right">
                                            <div className="pm-actions">
                                                {isAdmin && (() => {
                                                    const pendingCount = getPendingApprovalCount(person.competencies || []);
                                                    if (pendingCount === 0) return null;
                                                    return (
                                                        <button
                                                            className="pm-btn review sm"
                                                            onClick={() => handleOpenReview(person)}
                                                            title={`Review ${pendingCount} pending document${pendingCount > 1 ? 's' : ''}`}
                                                        >
                                                            <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                                            Review
                                                            <span className="pm-review-count">{pendingCount}</span>
                                                        </button>
                                                    );
                                                })()}
                                                <button
                                                    className="pm-btn primary sm"
                                                    onClick={() => handleToggleExpand(person.id)}
                                                >
                                                    {isExpanded ? 'Hide' : 'Details'}
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        style={{
                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                            transition: 'transform 0.2s ease',
                                                        }}
                                                    >
                                                        <path d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: 0 }}>
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

            {reviewingPerson && (
                <PersonDocumentReviewModal
                    isOpen={!!reviewingPerson}
                    onClose={handleCloseReview}
                    person={reviewingPerson}
                />
            )}
        </div>
    );
}

export default PersonnelTable;
