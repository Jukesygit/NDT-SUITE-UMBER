/**
 * PersonnelSelector - Multi-select list with filters for personnel
 */

import type { Person, Organization } from '../../../hooks/queries/usePersonnel';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';

interface PersonnelSelectorProps {
    personnel: Person[];
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
    organizations: Organization[];
    filterOrg: string;
    onFilterOrgChange: (org: string) => void;
    filterRole: string;
    onFilterRoleChange: (role: string) => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    isLoading?: boolean;
}

export function PersonnelSelector({
    personnel,
    selectedIds,
    onSelectionChange,
    organizations,
    filterOrg,
    onFilterOrgChange,
    filterRole,
    onFilterRoleChange,
    searchTerm,
    onSearchChange,
    isLoading,
}: PersonnelSelectorProps) {
    // Toggle selection
    const toggleSelection = (personId: string) => {
        if (selectedIds.includes(personId)) {
            onSelectionChange(selectedIds.filter((id) => id !== personId));
        } else {
            onSelectionChange([...selectedIds, personId]);
        }
    };

    // Select all visible
    const selectAll = () => {
        const allIds = personnel.map((p) => p.id);
        const newIds = [...new Set([...selectedIds, ...allIds])];
        onSelectionChange(newIds);
    };

    // Deselect all visible
    const deselectAll = () => {
        const visibleIds = new Set(personnel.map((p) => p.id));
        onSelectionChange(selectedIds.filter((id) => !visibleIds.has(id)));
    };

    // Clear all selections
    const clearAll = () => {
        onSelectionChange([]);
    };

    // Get org name helper
    const getOrgName = (orgId: string | undefined) => {
        if (!orgId) return 'N/A';
        return organizations.find((o) => o.id === orgId)?.name || 'Unknown';
    };

    if (isLoading) {
        return <SectionSpinner message="Loading personnel..." />;
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Search */}
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search personnel..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="glass-input"
                        style={{ width: '100%', paddingLeft: '36px' }}
                    />
                    <svg
                        style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '16px',
                            height: '16px',
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>

                {/* Organization Filter */}
                <select
                    value={filterOrg}
                    onChange={(e) => onFilterOrgChange(e.target.value)}
                    className="glass-input"
                    style={{ width: '100%' }}
                >
                    <option value="all">All Organizations</option>
                    {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                            {org.name}
                        </option>
                    ))}
                </select>

                {/* Role Filter */}
                <select
                    value={filterRole}
                    onChange={(e) => onFilterRoleChange(e.target.value)}
                    className="glass-input"
                    style={{ width: '100%' }}
                >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="org_admin">Org Admin</option>
                    <option value="manager">Manager</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                </select>
            </div>

            {/* Selection Actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    Showing {personnel.length} people
                    {selectedIds.length > 0 && (
                        <span style={{ color: '#60a5fa', marginLeft: '8px' }}>
                            ({selectedIds.length} selected)
                        </span>
                    )}
                </span>
                <div className="flex gap-2">
                    <button onClick={selectAll} className="btn btn-secondary btn-sm">
                        Select All
                    </button>
                    <button onClick={deselectAll} className="btn btn-secondary btn-sm">
                        Deselect Visible
                    </button>
                    {selectedIds.length > 0 && (
                        <button onClick={clearAll} className="btn btn-secondary btn-sm">
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Personnel List */}
            <div
                style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                }}
                className="glass-scrollbar"
            >
                {personnel.length === 0 ? (
                    <div
                        style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.5)',
                        }}
                    >
                        No personnel found matching filters
                    </div>
                ) : (
                    personnel.map((person) => {
                        const isSelected = selectedIds.includes(person.id);
                        return (
                            <label
                                key={person.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                    background: isSelected
                                        ? 'rgba(59, 130, 246, 0.1)'
                                        : 'transparent',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isSelected
                                        ? 'rgba(59, 130, 246, 0.1)'
                                        : 'transparent';
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(person.id)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {person.username}
                                    </p>
                                    <p
                                        style={{
                                            fontSize: '13px',
                                            color: 'rgba(255, 255, 255, 0.5)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {person.email}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            fontSize: '11px',
                                            fontWeight: 500,
                                            borderRadius: '4px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            color: 'rgba(255, 255, 255, 0.7)',
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {person.role.replace('_', ' ')}
                                    </span>
                                    <p
                                        style={{
                                            fontSize: '12px',
                                            color: 'rgba(255, 255, 255, 0.4)',
                                            marginTop: '4px',
                                        }}
                                    >
                                        {getOrgName(person.organization_id)}
                                    </p>
                                </div>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default PersonnelSelector;
