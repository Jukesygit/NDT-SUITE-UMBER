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
    /** Current search term */
    searchTerm: string;
    /** Update search term */
    onSearchChange: (value: string) => void;
    /** Selected organization filter */
    filterOrg: string;
    /** Update organization filter */
    onOrgChange: (value: string) => void;
    /** Selected role filter */
    filterRole: string;
    /** Update role filter */
    onRoleChange: (value: string) => void;
    /** Selected competency IDs for filtering */
    filterCompetencies: string[];
    /** Update competency filters */
    onCompetenciesChange: (ids: string[]) => void;
    /** Available organizations */
    organizations: Organization[];
    /** Available competency definitions */
    competencyDefinitions: CompetencyDefinition[];
    /** Callback for import button */
    onImport?: () => void;
    /** Callback for export button */
    onExport?: () => void;
    /** Whether user can import */
    canImport?: boolean;
}

/**
 * Upload icon
 */
function UploadIcon() {
    return (
        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
        </svg>
    );
}

/**
 * Download/export icon
 */
function DownloadIcon() {
    return (
        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

/**
 * Group competencies by category
 */
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

/**
 * PersonnelFilters component
 */
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
    onImport,
    onExport,
    canImport = true,
}: PersonnelFiltersProps) {
    const [showCompetencyDropdown, setShowCompetencyDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
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
        <div className="filter-toolbar">
            {/* Search */}
            <div className="filter-toolbar__section">
                <div className="search-bar-enhanced">
                    <input
                        type="text"
                        className="search-bar-enhanced__input"
                        placeholder="Search personnel by name, email, or organization..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    <svg className="search-bar-enhanced__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {searchTerm && (
                        <button
                            className="search-bar-enhanced__clear"
                            onClick={() => onSearchChange('')}
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="filter-toolbar__divider" />

            {/* Filters */}
            <div className="filter-toolbar__section" style={{ flex: 'none' }}>
                <label className="filter-toolbar__label">Organization:</label>
                {/* Organization Filter */}
                <select
                    className="filter-toolbar__select"
                    value={filterOrg}
                    onChange={(e) => onOrgChange(e.target.value)}
                >
                    <option value="all">All Organizations</option>
                    {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                            {org.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="filter-toolbar__divider" />

            <div className="filter-toolbar__section" style={{ flex: 'none' }}>
                <label className="filter-toolbar__label">Role:</label>
                {/* Role Filter */}
                <select
                    className="filter-toolbar__select"
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

            <div className="filter-toolbar__section" style={{ flex: 'none', position: 'relative' }}>
                <label className="filter-toolbar__label">Competencies:</label>
                {/* Competency Filter Dropdown */}
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowCompetencyDropdown(!showCompetencyDropdown)}
                        className="filter-toolbar__select"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            minWidth: '200px',
                            cursor: 'pointer',
                            textAlign: 'left',
                        }}
                    >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {filterCompetencies.length === 0
                                ? 'All Qualifications'
                                : `${filterCompetencies.length} selected`}
                        </span>
                        <svg style={{ width: '16px', height: '16px', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showCompetencyDropdown && (
                        <>
                            <div
                                style={{
                                    position: 'fixed',
                                    inset: 0,
                                    zIndex: 999
                                }}
                                onClick={() => setShowCompetencyDropdown(false)}
                            />
                            <div
                                className="glass-card"
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    minWidth: '300px',
                                    maxWidth: '400px',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    padding: '12px'
                                }}
                            >
                                {filterCompetencies.length > 0 && (
                                    <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                        <button
                                            onClick={() => onCompetenciesChange([])}
                                            className="btn btn--secondary btn--sm"
                                            style={{ width: '100%', fontSize: '12px' }}
                                        >
                                            Clear All ({filterCompetencies.length})
                                        </button>
                                    </div>
                                )}
                                {Object.entries(groupedCompetencies).map(([category, comps]) => (
                                    <div key={category} style={{ marginBottom: '16px' }}>
                                        <div style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            color: 'var(--accent-primary)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            marginBottom: '8px',
                                            padding: '4px 8px',
                                            background: 'rgba(var(--accent-primary-rgb, 59, 130, 246), 0.1)',
                                            borderRadius: '4px'
                                        }}>
                                            {category}
                                        </div>
                                        {comps.map((comp) => {
                                            const isSelected = filterCompetencies.includes(comp.id);
                                            return (
                                                <label
                                                    key={comp.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '8px',
                                                        cursor: 'pointer',
                                                        borderRadius: '6px',
                                                        marginBottom: '4px',
                                                        background: isSelected ? 'rgba(var(--accent-primary-rgb, 59, 130, 246), 0.15)' : 'transparent',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                    className="hover:bg-white/5"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleCompetencyToggle(comp.id)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            width: '16px',
                                                            height: '16px',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <span style={{
                                                        fontSize: '13px',
                                                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                        fontWeight: isSelected ? '600' : '400',
                                                    }}>
                                                        {comp.name}
                                                    </span>
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

            <div className="filter-toolbar__divider" />

            {/* Actions */}
            <div className="filter-toolbar__section" style={{ flex: 'none', justifyContent: 'flex-end' }}>
                {canImport && onImport && (
                    <button onClick={onImport} className="btn btn--primary btn--md">
                        <UploadIcon />
                        Import from File
                    </button>
                )}
                {onExport && (
                    <button onClick={onExport} className="btn btn--secondary btn--md">
                        <DownloadIcon />
                        Export to CSV
                    </button>
                )}
            </div>
        </div>
    );
}

export default PersonnelFilters;
