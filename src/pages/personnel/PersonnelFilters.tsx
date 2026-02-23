/**
 * PersonnelFilters - Search and filter controls for personnel directory
 */

import { useState, useRef, useEffect } from 'react';
import type { Organization } from '../../hooks/queries/usePersonnel';

export interface CompetencyDefinition {
    id: string;
    name: string;
    category: string;
}

interface PersonnelFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    filterOrg: string;
    onOrgChange: (value: string) => void;
    filterRole: string;
    onRoleChange: (value: string) => void;
    filterCompetencies: string[];
    onCompetenciesChange: (ids: string[]) => void;
    organizations: Organization[];
    competencyDefinitions: CompetencyDefinition[];
}

function groupByCategory(definitions: CompetencyDefinition[]): Record<string, CompetencyDefinition[]> {
    return definitions.reduce(
        (acc, def) => {
            const category = def.category || 'Other';
            if (!acc[category]) acc[category] = [];
            acc[category].push(def);
            return acc;
        },
        {} as Record<string, CompetencyDefinition[]>
    );
}

export function PersonnelFilters({
    searchTerm,
    onSearchChange,
    filterOrg,
    onOrgChange,
    filterRole,
    onRoleChange,
    filterCompetencies,
    onCompetenciesChange,
    organizations,
    competencyDefinitions,
}: PersonnelFiltersProps) {
    const [showCompetencyDropdown, setShowCompetencyDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowCompetencyDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const groupedCompetencies = groupByCategory(competencyDefinitions);

    const handleCompetencyToggle = (compId: string) => {
        if (filterCompetencies.includes(compId)) {
            onCompetenciesChange(filterCompetencies.filter((id) => id !== compId));
        } else {
            onCompetenciesChange([...filterCompetencies, compId]);
        }
    };

    return (
        <div className="pm-filter-bar">
            {/* Search */}
            <div className="pm-filter-section">
                <div className="pm-search">
                    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {searchTerm && (
                        <button className="pm-search-clear" onClick={() => onSearchChange('')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="pm-filter-divider" />

            {/* Organization */}
            <div className="pm-filter-section compact">
                <label className="pm-filter-label">Organization</label>
                <select
                    className="pm-filter-select"
                    value={filterOrg}
                    onChange={(e) => onOrgChange(e.target.value)}
                >
                    <option value="all">All Organizations</option>
                    {organizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                </select>
            </div>

            <div className="pm-filter-divider" />

            {/* Role */}
            <div className="pm-filter-section compact">
                <label className="pm-filter-label">Role</label>
                <select
                    className="pm-filter-select"
                    value={filterRole}
                    onChange={(e) => onRoleChange(e.target.value)}
                >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="org_admin">Org Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                </select>
            </div>

            {/* Competency Filter */}
            <div className="pm-filter-section compact" style={{ position: 'relative' }}>
                <label className="pm-filter-label">Competencies</label>
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button
                        className="pm-dropdown-trigger"
                        onClick={() => setShowCompetencyDropdown(!showCompetencyDropdown)}
                    >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {filterCompetencies.length === 0
                                ? 'All Qualifications'
                                : `${filterCompetencies.length} selected`}
                        </span>
                        <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                            <path d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showCompetencyDropdown && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                                onClick={() => setShowCompetencyDropdown(false)}
                            />
                            <div className="pm-dropdown">
                                {filterCompetencies.length > 0 && (
                                    <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                        <button
                                            className="pm-btn sm"
                                            onClick={() => onCompetenciesChange([])}
                                            style={{ width: '100%', justifyContent: 'center' }}
                                        >
                                            Clear All ({filterCompetencies.length})
                                        </button>
                                    </div>
                                )}
                                {Object.entries(groupedCompetencies).map(([category, comps]) => (
                                    <div key={category} style={{ marginBottom: '16px' }}>
                                        <div className="pm-dropdown-category">{category}</div>
                                        {comps.map((comp) => {
                                            const isSelected = filterCompetencies.includes(comp.id);
                                            return (
                                                <label
                                                    key={comp.id}
                                                    className={`pm-dropdown-item ${isSelected ? 'selected' : ''}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleCompetencyToggle(comp.id)}
                                                    />
                                                    <span>{comp.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

        </div>
    );
}

export default PersonnelFilters;
