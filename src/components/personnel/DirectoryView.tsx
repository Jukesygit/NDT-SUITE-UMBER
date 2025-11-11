// @ts-nocheck - Component extracted from large page, uses JS imports that lack TypeScript definitions
import React, { useState } from 'react';
import authManager from '../../auth-manager.js';
import supabase from '../../supabase-client.js';
import toast from '../Toast.jsx';
import { filterOutPersonalDetails, requiresWitnessCheck } from '../../utils/competency-field-utils.js';
import type { PersonnelWithCompetencies, CompetencyDefinition, Organization } from '../../types/index.js';
import type { SortColumn, SortDirection } from '../../hooks/usePersonnelSort.js';

/**
 * DirectoryView component props
 */
interface DirectoryViewProps {
    personnel: PersonnelWithCompetencies[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterOrg: string;
    setFilterOrg: (org: string) => void;
    filterRole: string;
    setFilterRole: (role: string) => void;
    filterCompetencies: string[];
    setFilterCompetencies: (competencies: string[]) => void;
    organizations: Organization[];
    competencyDefinitions: CompetencyDefinition[];
    onExport: () => void;
    onSelectPerson: (person: PersonnelWithCompetencies) => void;
    getCompetencyStats: (person: PersonnelWithCompetencies) => {
        total: number;
        active: number;
        expiring: number;
        expired: number;
    };
    onImport: () => void;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSort: (column: SortColumn) => void;
    onRefresh: () => Promise<void>;
}

/**
 * Directory View Component
 *
 * Displays personnel in a sortable, filterable table format with:
 * - Comprehensive stats panel (total personnel, active certs, expiring, expired)
 * - Advanced filtering (search, organization, role, competencies)
 * - Sortable columns (name, org, role, competency counts)
 * - Expandable details for each person
 * - Inline editing for person info and competencies
 * - Witness check functionality for NDT certifications
 * - Import/export capabilities
 */
export function DirectoryView({
    personnel,
    searchTerm,
    setSearchTerm,
    filterOrg,
    setFilterOrg,
    filterRole,
    setFilterRole,
    filterCompetencies,
    setFilterCompetencies,
    organizations,
    competencyDefinitions,
    onExport,
    onSelectPerson,
    getCompetencyStats,
    onImport,
    sortColumn,
    sortDirection,
    onSort,
    onRefresh
}: DirectoryViewProps) {
    const [showCompetencyDropdown, setShowCompetencyDropdown] = useState(false);
    const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
    const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState({
        username: '',
        email: '',
        role: '',
        organization_id: ''
    });
    const [saving, setSaving] = useState(false);
    const [editingCompetencyId, setEditingCompetencyId] = useState<string | null>(null);
    const [competencyEditData, setCompetencyEditData] = useState<any>({});
    const currentUser = authManager.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'org_admin';

    const handleEditCompetency = (comp: any) => {
        setEditingCompetencyId(comp.id);
        setCompetencyEditData({
            value: comp.value || '',
            issuing_body: comp.issuing_body || '',
            certification_id: comp.certification_id || '',
            expiry_date: comp.expiry_date ? new Date(comp.expiry_date).toISOString().split('T')[0] : '',
            issued_date: comp.created_at ? new Date(comp.created_at).toISOString().split('T')[0] : '',
            notes: comp.notes || '',
            witness_checked: comp.witness_checked || false,
            witnessed_by: comp.witnessed_by || '',
            witnessed_at: comp.witnessed_at ? new Date(comp.witnessed_at).toISOString().split('T')[0] : '',
            witness_notes: comp.witness_notes || '',
            competency: comp.competency // Store for checking if NDT
        });
    };

    const handleSaveCompetency = async (compId: string) => {
        if (!isAdmin) return;

        setSaving(true);
        try {
            const updateData: any = {
                value: competencyEditData.value || null,
                issuing_body: competencyEditData.issuing_body || null,
                certification_id: competencyEditData.certification_id || null,
                expiry_date: competencyEditData.expiry_date || null,
                notes: competencyEditData.notes || null,
                witness_checked: competencyEditData.witness_checked || false,
                witnessed_by: competencyEditData.witnessed_by || null,
                witnessed_at: competencyEditData.witnessed_at || null,
                witness_notes: competencyEditData.witness_notes || null
            };

            if (competencyEditData.issued_date) {
                updateData.created_at = competencyEditData.issued_date;
            }

            const { error } = await supabase
                .from('employee_competencies')
                .update(updateData)
                .eq('id', compId);

            if (error) throw error;

            // Reload data without full page refresh to maintain scroll position and expanded state
            await onRefresh();
            setEditingCompetencyId(null);
            toast.success('Competency updated successfully!');
        } catch (error: any) {
            console.error('Error updating competency:', error);
            toast.error(`Failed to update competency: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelCompetencyEdit = () => {
        setEditingCompetencyId(null);
        setCompetencyEditData({});
    };

    const handleEditPerson = (person: PersonnelWithCompetencies) => {
        setEditingPersonId(person.id);
        setEditFormData({
            username: person.username || '',
            email: person.email || '',
            role: person.role || '',
            organization_id: person.organization_id || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingPersonId(null);
        setEditFormData({
            username: '',
            email: '',
            role: '',
            organization_id: ''
        });
    };

    const handleSaveEdit = async (personId: string) => {
        if (!isAdmin) return;

        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({
                    username: editFormData.username,
                    email: editFormData.email,
                    role: editFormData.role,
                    organization_id: editFormData.organization_id
                })
                .eq('id', personId);

            if (error) throw error;

            // Reload data without full page refresh
            await onRefresh();
            setEditingPersonId(null);
            toast.success('Profile updated successfully!');
        } catch (error: any) {
            console.error('Error updating profile:', error);
            toast.error(`Failed to update profile: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Compact Stats - New Design */}
            <div className="stats-compact" style={{ marginBottom: '24px' }}>
                <div className="stat-compact">
                    <div className="stat-compact__icon stat-compact__icon--primary">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <div className="stat-compact__content">
                        <div className="stat-compact__label">Total Personnel</div>
                        <div className="stat-compact__value">{personnel.length}</div>
                    </div>
                </div>

                <div className="stat-compact">
                    <div className="stat-compact__icon stat-compact__icon--success">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="stat-compact__content">
                        <div className="stat-compact__label">Active Certs</div>
                        <div className="stat-compact__value">
                            {personnel.reduce((sum, p) => sum + getCompetencyStats(p).active, 0)}
                        </div>
                    </div>
                </div>

                <div className="stat-compact">
                    <div className="stat-compact__icon stat-compact__icon--warning">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="stat-compact__content">
                        <div className="stat-compact__label">Expiring Soon</div>
                        <div className="stat-compact__value">
                            {personnel.reduce((sum, p) => sum + getCompetencyStats(p).expiring, 0)}
                        </div>
                    </div>
                </div>

                <div className="stat-compact">
                    <div className="stat-compact__icon stat-compact__icon--danger">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="stat-compact__content">
                        <div className="stat-compact__label">Expired</div>
                        <div className="stat-compact__value">
                            {personnel.reduce((sum, p) => sum + getCompetencyStats(p).expired, 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Enhanced Search & Filters Toolbar */}
            <div className="filter-toolbar">
                <div className="filter-toolbar__section">
                    <div className="search-bar-enhanced">
                        <input
                            type="text"
                            className="search-bar-enhanced__input"
                            placeholder="Search personnel by name, email, or organization..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <svg className="search-bar-enhanced__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {searchTerm && (
                            <button
                                className="search-bar-enhanced__clear"
                                onClick={() => setSearchTerm('')}
                            >
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="filter-toolbar__divider"></div>

                <div className="filter-toolbar__section" style={{ flex: 'none' }}>
                    <label className="filter-toolbar__label">Organization:</label>
                    <select
                        value={filterOrg}
                        onChange={(e) => setFilterOrg(e.target.value)}
                        className="filter-toolbar__select"
                    >
                        <option value="all">All Organizations</option>
                        {organizations.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-toolbar__divider"></div>

                <div className="filter-toolbar__section" style={{ flex: 'none' }}>
                    <label className="filter-toolbar__label">Role:</label>
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="filter-toolbar__select"
                    >
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="org_admin">Org Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                    </select>
                </div>

                <div className="filter-toolbar__divider"></div>

                <div className="filter-toolbar__section" style={{ flex: 'none', position: 'relative' }}>
                    <label className="filter-toolbar__label">Competencies:</label>
                    <div style={{ position: 'relative' }}>
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
                                textAlign: 'left'
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
                                                onClick={() => setFilterCompetencies([])}
                                                className="btn btn--secondary btn--sm"
                                                style={{ width: '100%', fontSize: '12px' }}
                                            >
                                                Clear All ({filterCompetencies.length})
                                            </button>
                                        </div>
                                    )}
                                    {Object.entries(
                                        filterOutPersonalDetails(competencyDefinitions)
                                            .sort((a, b) => {
                                                const catCompare = (a.category?.name || '').localeCompare(b.category?.name || '');
                                                return catCompare !== 0 ? catCompare : a.name.localeCompare(b.name);
                                            })
                                            .reduce((acc: any, comp) => {
                                                const categoryName = comp.category?.name || 'Other';
                                                if (!acc[categoryName]) acc[categoryName] = [];
                                                acc[categoryName].push(comp);
                                                return acc;
                                            }, {})
                                    ).map(([categoryName, comps]: [string, any]) => (
                                            <div key={categoryName} style={{ marginBottom: '16px' }}>
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
                                                    {categoryName}
                                                </div>
                                                {comps.map((comp: any) => {
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
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setFilterCompetencies([...filterCompetencies, comp.id]);
                                                                    } else {
                                                                        setFilterCompetencies(filterCompetencies.filter(id => id !== comp.id));
                                                                    }
                                                                }}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    width: '16px',
                                                                    height: '16px',
                                                                    flexShrink: 0
                                                                }}
                                                            />
                                                            <span style={{
                                                                fontSize: '13px',
                                                                color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                                                                fontWeight: isSelected ? '600' : '400'
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

                <div className="filter-toolbar__divider"></div>

                <div className="filter-toolbar__section" style={{ flex: 'none', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => {
                            console.log('Button clicked, onImport is:', onImport);
                            if (onImport) {
                                onImport();
                            } else {
                                console.error('onImport prop is not defined!');
                            }
                        }}
                        className="btn btn--primary btn--md"
                    >
                        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Import from File
                    </button>
                    <button onClick={onExport} className="btn btn--secondary btn--md">
                        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export to CSV
                    </button>
                </div>
            </div>

            {/* Personnel Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <tr>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'left',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'name' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('name')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'name' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Name
                                        {sortColumn === 'name' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'left',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'org' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('org')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'org' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Organization
                                        {sortColumn === 'org' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'left',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'role' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('role')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'role' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Role
                                        {sortColumn === 'role' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'total' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('total')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'total' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        Total Certs
                                        {sortColumn === 'total' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'active' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('active')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'active' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        Active
                                        {sortColumn === 'active' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'expiring' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('expiring')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'expiring' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        Expiring
                                        {sortColumn === 'expiring' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: sortColumn === 'expired' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => onSort('expired')}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = sortColumn === 'expired' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        Expired
                                        {sortColumn === 'expired' && (
                                            <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {personnel.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        No personnel found matching your filters
                                    </td>
                                </tr>
                            ) : personnel.map(person => {
                                const stats = getCompetencyStats(person);
                                const isExpanded = expandedPersonId === person.id;
                                return (
                                    <React.Fragment key={person.id}>
                                        <tr style={{ borderBottom: isExpanded ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)' }} className="hover:bg-white/5 transition-colors">
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>{person.username}</div>
                                                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>{person.email}</div>
                                            </td>
                                            <td style={{ padding: '16px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                                {person.organizations?.name || 'Unknown'}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <span className="glass-badge">{person.role}</span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center', fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
                                                {stats.total}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center', fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                                                {stats.active}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center', fontSize: '16px', fontWeight: '600', color: '#f59e0b' }}>
                                                {stats.expiring}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center', fontSize: '16px', fontWeight: '600', color: '#ef4444' }}>
                                                {stats.expired}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => setExpandedPersonId(isExpanded ? null : person.id)}
                                                    className="btn-primary"
                                                    style={{
                                                        fontSize: '13px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        marginLeft: 'auto'
                                                    }}
                                                >
                                                    {isExpanded ? 'Hide Details' : 'View Details'}
                                                    <svg
                                                        style={{
                                                            width: '16px',
                                                            height: '16px',
                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                            transition: 'transform 0.2s ease'
                                                        }}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                    <div style={{
                                                        background: 'rgba(59, 130, 246, 0.05)',
                                                        borderLeft: '4px solid var(--accent-primary)',
                                                        padding: '24px',
                                                        animation: 'slideDown 0.2s ease-out'
                                                    }}>
                                                        <div style={{ marginBottom: '20px' }}>
                                                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <svg style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    Personal Information
                                                                </div>
                                                                {isAdmin && editingPersonId !== person.id && (
                                                                    <button
                                                                        onClick={() => handleEditPerson(person)}
                                                                        className="btn btn--secondary btn--sm"
                                                                        style={{ fontSize: '12px', padding: '6px 12px' }}
                                                                    >
                                                                        <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                        </svg>
                                                                        Edit
                                                                    </button>
                                                                )}
                                                            </h4>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Username</div>
                                                                    {editingPersonId === person.id ? (
                                                                        <input
                                                                            type="text"
                                                                            className="glass-input"
                                                                            value={editFormData.username}
                                                                            onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                                                                            style={{ marginTop: '4px' }}
                                                                        />
                                                                    ) : (
                                                                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>{person.username}</div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Email</div>
                                                                    {editingPersonId === person.id ? (
                                                                        <input
                                                                            type="email"
                                                                            className="glass-input"
                                                                            value={editFormData.email}
                                                                            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                                                            style={{ marginTop: '4px' }}
                                                                        />
                                                                    ) : (
                                                                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>{person.email}</div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Organization</div>
                                                                    {editingPersonId === person.id ? (
                                                                        <select
                                                                            className="glass-select"
                                                                            value={editFormData.organization_id}
                                                                            onChange={(e) => setEditFormData({ ...editFormData, organization_id: e.target.value })}
                                                                            style={{ marginTop: '4px' }}
                                                                        >
                                                                            {organizations.map(org => (
                                                                                <option key={org.id} value={org.id}>{org.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>{person.organizations?.name || 'Unknown'}</div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Role</div>
                                                                    {editingPersonId === person.id ? (
                                                                        <select
                                                                            className="glass-select"
                                                                            value={editFormData.role}
                                                                            onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                                                                            style={{ marginTop: '4px' }}
                                                                        >
                                                                            <option value="viewer">Viewer</option>
                                                                            <option value="editor">Editor</option>
                                                                            <option value="org_admin">Org Admin</option>
                                                                            <option value="admin">Admin</option>
                                                                        </select>
                                                                    ) : (
                                                                        <div><span className="glass-badge">{person.role}</span></div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {editingPersonId === person.id && (
                                                                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                                                                    <button
                                                                        onClick={handleCancelEdit}
                                                                        className="btn btn--secondary btn--sm"
                                                                        disabled={saving}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleSaveEdit(person.id)}
                                                                        className="btn btn--primary btn--sm"
                                                                        disabled={saving}
                                                                    >
                                                                        {saving ? 'Saving...' : 'Save Changes'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div style={{
                                                            height: '1px',
                                                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                                                            margin: '20px 0'
                                                        }}></div>

                                                        <div>
                                                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <svg style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                Competencies & Certifications ({person.competencies?.length || 0})
                                                            </h4>
                                                            {(!person.competencies || person.competencies.length === 0) ? (
                                                                <div style={{
                                                                    padding: '32px',
                                                                    textAlign: 'center',
                                                                    color: 'rgba(255, 255, 255, 0.5)',
                                                                    background: 'rgba(255, 255, 255, 0.02)',
                                                                    borderRadius: '8px',
                                                                    border: '1px dashed rgba(255, 255, 255, 0.1)'
                                                                }}>
                                                                    <svg style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                    </svg>
                                                                    No competencies recorded
                                                                </div>
                                                            ) : (() => {
                                                                // Group competencies by category
                                                                const competenciesByCategory: any = {};
                                                                person.competencies.forEach(comp => {
                                                                    const categoryName = comp.competency?.category?.name || 'Uncategorized';
                                                                    if (!competenciesByCategory[categoryName]) {
                                                                        competenciesByCategory[categoryName] = [];
                                                                    }
                                                                    competenciesByCategory[categoryName].push(comp);
                                                                });

                                                                const categories = Object.keys(competenciesByCategory).sort();

                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                                        {categories.map(categoryName => (
                                                                            <div key={categoryName}>
                                                                                {/* Category Header */}
                                                                                <div style={{
                                                                                    marginBottom: '8px',
                                                                                    paddingBottom: '6px',
                                                                                    borderBottom: '2px solid rgba(255, 255, 255, 0.1)'
                                                                                }}>
                                                                                    <h5 style={{
                                                                                        fontSize: '16px',
                                                                                        fontWeight: '600',
                                                                                        color: 'rgba(255, 255, 255, 0.9)',
                                                                                        margin: 0,
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '8px'
                                                                                    }}>
                                                                                        {categoryName}
                                                                                        <span style={{
                                                                                            fontSize: '11px',
                                                                                            fontWeight: '400',
                                                                                            color: 'rgba(255, 255, 255, 0.5)',
                                                                                            background: 'rgba(255, 255, 255, 0.05)',
                                                                                            padding: '2px 8px',
                                                                                            borderRadius: '12px'
                                                                                        }}>
                                                                                            {competenciesByCategory[categoryName].length}
                                                                                        </span>
                                                                                    </h5>
                                                                                </div>

                                                                                {/* Competencies Grid */}
                                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                                                                                    {competenciesByCategory[categoryName].map((comp: any) => {
                                                                                        const isExpired = comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date());
                                                                                        const isExpiringSoon = comp.expiry_date && !isExpired && Math.ceil((new Date(comp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 30;

                                                                                        const isEditing = editingCompetencyId === comp.id;
                                                                                        return (
                                                                                            <div
                                                                                                key={comp.id}
                                                                                                style={{
                                                                                                    padding: '10px 12px',
                                                                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                                                                    borderRadius: '6px',
                                                                                                    borderLeft: `3px solid ${isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : '#10b981'}`,
                                                                                                    border: `1px solid ${isExpired ? 'rgba(239, 68, 68, 0.3)' : isExpiringSoon ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                                                                                                    borderLeftWidth: '3px',
                                                                                                    transition: 'all 0.2s ease'
                                                                                                }}
                                                                                                className="hover:bg-white/5"
                                                                                            >
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                                                                                                        <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.competency?.name}>
                                                                                                            {comp.competency?.name || 'Unknown Competency'}
                                                                                                        </div>
                                                                                                        {requiresWitnessCheck(comp) && comp.witness_checked && (
                                                                                                            <svg
                                                                                                                style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }}
                                                                                                                fill="currentColor"
                                                                                                                viewBox="0 0 20 20"
                                                                                                                title={`Witnessed on ${comp.witnessed_at ? new Date(comp.witnessed_at).toLocaleDateString('en-GB') : 'unknown date'}`}
                                                                                                            >
                                                                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                                                            </svg>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                                                        {isExpired ? (
                                                                                                            <span className="glass-badge badge-red" style={{ fontSize: '10px', padding: '2px 6px' }}>Expired</span>
                                                                                                        ) : isExpiringSoon ? (
                                                                                                            <span className="glass-badge" style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '10px', padding: '2px 6px' }}>Expiring</span>
                                                                                                        ) : comp.status === 'pending_approval' ? (
                                                                                                            <span className="glass-badge" style={{ background: 'rgba(251, 191, 36, 0.2)', color: 'rgba(253, 224, 71, 1)', fontSize: '10px', padding: '2px 6px' }}>Pending</span>
                                                                                                        ) : (
                                                                                                            <span className="glass-badge badge-green" style={{ fontSize: '10px', padding: '2px 6px' }}>Active</span>
                                                                                                        )}
                                                                                                        {isAdmin && !isEditing && (
                                                                                                            <button
                                                                                                                onClick={() => handleEditCompetency(comp)}
                                                                                                                className="btn-icon"
                                                                                                                style={{ padding: '2px', marginLeft: '4px' }}
                                                                                                            >
                                                                                                                <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                                                                </svg>
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                                {isEditing ? (
                                                                                                    <div style={{ fontSize: '11px', lineHeight: '1.4' }} className="space-y-2">
                                                                                                        <div>
                                                                                                            <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Value</label>
                                                                                                            <input
                                                                                                                type="text"
                                                                                                                className="glass-input"
                                                                                                                value={competencyEditData.value}
                                                                                                                onChange={(e) => setCompetencyEditData({ ...competencyEditData, value: e.target.value })}
                                                                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Issuing Body</label>
                                                                                                            <input
                                                                                                                type="text"
                                                                                                                className="glass-input"
                                                                                                                value={competencyEditData.issuing_body}
                                                                                                                onChange={(e) => setCompetencyEditData({ ...competencyEditData, issuing_body: e.target.value })}
                                                                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Certification ID</label>
                                                                                                            <input
                                                                                                                type="text"
                                                                                                                className="glass-input"
                                                                                                                value={competencyEditData.certification_id}
                                                                                                                onChange={(e) => setCompetencyEditData({ ...competencyEditData, certification_id: e.target.value })}
                                                                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                                                                            <div>
                                                                                                                <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Issued</label>
                                                                                                                <input
                                                                                                                    type="date"
                                                                                                                    className="glass-input"
                                                                                                                    value={competencyEditData.issued_date}
                                                                                                                    onChange={(e) => setCompetencyEditData({ ...competencyEditData, issued_date: e.target.value })}
                                                                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                                />
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Expires</label>
                                                                                                                <input
                                                                                                                    type="date"
                                                                                                                    className="glass-input"
                                                                                                                    value={competencyEditData.expiry_date}
                                                                                                                    onChange={(e) => setCompetencyEditData({ ...competencyEditData, expiry_date: e.target.value })}
                                                                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                                />
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Notes</label>
                                                                                                            <textarea
                                                                                                                className="glass-textarea"
                                                                                                                value={competencyEditData.notes}
                                                                                                                onChange={(e) => setCompetencyEditData({ ...competencyEditData, notes: e.target.value })}
                                                                                                                rows={2}
                                                                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        {requiresWitnessCheck(competencyEditData.competency) && (
                                                                                                            <>
                                                                                                                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px', marginTop: '8px' }}>
                                                                                                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                                                                                                        <label style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '600' }}>
                                                                                                                            <input
                                                                                                                                type="checkbox"
                                                                                                                                checked={competencyEditData.witness_checked}
                                                                                                                                onChange={(e) => {
                                                                                                                                    const checked = e.target.checked;
                                                                                                                                    setCompetencyEditData({
                                                                                                                                        ...competencyEditData,
                                                                                                                                        witness_checked: checked,
                                                                                                                                        witnessed_at: checked && !competencyEditData.witnessed_at
                                                                                                                                            ? new Date().toISOString().split('T')[0]
                                                                                                                                            : competencyEditData.witnessed_at,
                                                                                                                                        witnessed_by: checked && !competencyEditData.witnessed_by
                                                                                                                                            ? currentUser?.id
                                                                                                                                            : competencyEditData.witnessed_by
                                                                                                                                    });
                                                                                                                                }}
                                                                                                                                style={{ marginRight: '4px' }}
                                                                                                                            />
                                                                                                                            Competency Witness Check
                                                                                                                        </label>
                                                                                                                    </div>
                                                                                                                    {competencyEditData.witness_checked && (
                                                                                                                        <>
                                                                                                                            <div>
                                                                                                                                <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px' }}>Witness</label>
                                                                                                                                <select
                                                                                                                                    className="glass-input"
                                                                                                                                    value={competencyEditData.witnessed_by}
                                                                                                                                    onChange={(e) => setCompetencyEditData({ ...competencyEditData, witnessed_by: e.target.value })}
                                                                                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                                                >
                                                                                                                                    <option value="">Select Witness</option>
                                                                                                                                    {personnel.filter(p => p.is_active).map(p => (
                                                                                                                                        <option key={p.id} value={p.id}>{p.username}</option>
                                                                                                                                    ))}
                                                                                                                                </select>
                                                                                                                            </div>
                                                                                                                            <div>
                                                                                                                                <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px', marginTop: '4px' }}>Witness Date</label>
                                                                                                                                <input
                                                                                                                                    type="date"
                                                                                                                                    className="glass-input"
                                                                                                                                    value={competencyEditData.witnessed_at}
                                                                                                                                    onChange={(e) => setCompetencyEditData({ ...competencyEditData, witnessed_at: e.target.value })}
                                                                                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                            <div>
                                                                                                                                <label style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '2px', marginTop: '4px' }}>Witness Notes</label>
                                                                                                                                <textarea
                                                                                                                                    className="glass-textarea"
                                                                                                                                    value={competencyEditData.witness_notes}
                                                                                                                                    onChange={(e) => setCompetencyEditData({ ...competencyEditData, witness_notes: e.target.value })}
                                                                                                                                    rows={2}
                                                                                                                                    placeholder="Optional observations from witness check..."
                                                                                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                        </>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            </>
                                                                                                        )}
                                                                                                        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                                                                                            <button
                                                                                                                onClick={handleCancelCompetencyEdit}
                                                                                                                className="btn btn--secondary btn--sm"
                                                                                                                style={{ flex: 1, fontSize: '10px', padding: '4px 8px' }}
                                                                                                                disabled={saving}
                                                                                                            >
                                                                                                                Cancel
                                                                                                            </button>
                                                                                                            <button
                                                                                                                onClick={() => handleSaveCompetency(comp.id)}
                                                                                                                className="btn btn--primary btn--sm"
                                                                                                                style={{ flex: 1, fontSize: '10px', padding: '4px 8px' }}
                                                                                                                disabled={saving}
                                                                                                            >
                                                                                                                {saving ? 'Saving...' : 'Save'}
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
                                                                                                        {comp.issuing_body && (
                                                                                                            <div style={{ marginBottom: '3px' }}>
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Issuer:</span>{' '}
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.issuing_body}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {comp.certification_id && (
                                                                                                            <div style={{ marginBottom: '3px' }}>
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>ID:</span>{' '}
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.certification_id}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {comp.value && (
                                                                                                            <div style={{ marginBottom: '3px' }}>
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Value:</span>{' '}
                                                                                                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.value}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {(comp.created_at || comp.expiry_date) && (
                                                                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                                                                                {comp.created_at && (
                                                                                                                    <div style={{ flex: 1 }}>
                                                                                                                        <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>Issued</div>
                                                                                                                        <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>
                                                                                                                            {new Date(comp.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                )}
                                                                                                                {comp.expiry_date && (
                                                                                                                    <div style={{ flex: 1 }}>
                                                                                                                        <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>Expires</div>
                                                                                                                        <div style={{ color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>
                                                                                                                            {new Date(comp.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {comp.notes && (
                                                                                                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                                                                                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any} title={comp.notes}>
                                                                                                                    {comp.notes}
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {requiresWitnessCheck(comp) && (
                                                                                                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                                                                                                                    {comp.witness_checked ? (
                                                                                                                        <>
                                                                                                                            <svg style={{ width: '12px', height: '12px', color: '#10b981' }} fill="currentColor" viewBox="0 0 20 20">
                                                                                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                                                                            </svg>
                                                                                                                            <div style={{ color: '#10b981', fontWeight: '600' }}>
                                                                                                                                Witnessed
                                                                                                                                {comp.witnessed_at && (
                                                                                                                                    <span style={{ fontWeight: '400', marginLeft: '4px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                                                                                                                        ({new Date(comp.witnessed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                                                                                                                                    </span>
                                                                                                                                )}
                                                                                                                            </div>
                                                                                                                        </>
                                                                                                                    ) : (
                                                                                                                        <>
                                                                                                                            <svg style={{ width: '12px', height: '12px', color: '#6b7280' }} fill="currentColor" viewBox="0 0 20 20">
                                                                                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                                                                                            </svg>
                                                                                                                            <span style={{ color: '#6b7280' }}>Not witnessed</span>
                                                                                                                        </>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                {comp.witness_checked && comp.witness_notes && (
                                                                                                                    <div style={{ marginTop: '4px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', fontStyle: 'italic' }}>
                                                                                                                        {comp.witness_notes}
                                                                                                                    </div>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    </div>
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
        </div>
    );
}

export default DirectoryView;
