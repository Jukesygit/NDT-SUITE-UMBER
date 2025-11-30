import React, { useState, useEffect } from 'react';
import { createModernHeader } from '../components/modern-header.js';
import authManager from '../auth-manager.js';
import competencyService from '../services/competency-service.js';
import personnelService from '../services/personnel-service.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import UniversalImportModal from '../components/UniversalImportModal.jsx';
import { shouldShowCertificationFields, shouldShowDateFields, getInputType, getPlaceholder, filterOutPersonalDetails, isNDTCertification, requiresWitnessCheck } from '../utils/competency-field-utils.js';
import { MatrixLogoRacer } from '../components/MatrixLogoLoader';
import { useAuth } from '../contexts/AuthContext';
import { PendingApprovalsView } from './personnel/PendingApprovalsView';
import { usePendingApprovals } from '../hooks/queries/useCompetencies';

export default function PersonnelManagementPage() {
    const [view, setView] = useState('directory'); // directory, matrix, expiring, approvals
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterOrg, setFilterOrg] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [filterCompetencies, setFilterCompetencies] = useState([]); // Array of competency IDs
    const [organizations, setOrganizations] = useState([]);
    const [competencyDefinitions, setCompetencyDefinitions] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [expiringCompetencies, setExpiringCompetencies] = useState([]);
    const [competencyMatrix, setCompetencyMatrix] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);
    const [sortColumn, setSortColumn] = useState('name'); // name, org, role, total, active, expiring, expired
    const [sortDirection, setSortDirection] = useState('asc'); // asc, desc

    // Auth context for role-based UI
    const { isAdmin } = useAuth();

    // Pending approvals query (only fetched when user is admin)
    const pendingApprovalsQuery = usePendingApprovals();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (showSuccess = false) => {
        if (!isSupabaseConfigured()) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const [personnelData, orgsData, expiringData, competencyDefs] = await Promise.all([
                personnelService.getAllPersonnelWithCompetencies(),
                authManager.getOrganizations(),
                competencyService.getExpiringCompetencies(30),
                competencyService.getCompetencyDefinitions()
            ]);

            setPersonnel(personnelData);
            setOrganizations(orgsData.filter(org => org.name !== 'SYSTEM'));
            setExpiringCompetencies(expiringData);
            setCompetencyDefinitions(competencyDefs);

            if (showSuccess) {
                setImportSuccess(true);
                setView('directory'); // Switch to directory view
                setTimeout(() => setImportSuccess(false), 5000); // Hide after 5 seconds
            }
        } catch (error) {
            console.error('Error loading personnel data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadCompetencyMatrix = async () => {
        try {
            const matrix = await personnelService.getCompetencyMatrix();
            setCompetencyMatrix(matrix);
        } catch (error) {
            console.error('Error loading competency matrix:', error);
        }
    };

    useEffect(() => {
        if (view === 'matrix') {
            loadCompetencyMatrix();
        }
    }, [view]);

    const getCompetencyStats = (person) => {
        // Filter out personal details - only count actual certifications/qualifications
        const competencies = filterOutPersonalDetails(person.competencies || []);
        const total = competencies.length;
        const active = competencies.filter(c => c.status === 'active').length;
        const expiring = competencies.filter(c => {
            if (!c.expiry_date) return false;
            const daysUntilExpiry = Math.ceil((new Date(c.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
        }).length;
        const expired = competencies.filter(c => c.status === 'expired' ||
            (c.expiry_date && new Date(c.expiry_date) < new Date())).length;

        return { total, active, expiring, expired };
    };

    const handleSort = (column) => {
        if (sortColumn === column) {
            // Toggle direction if clicking same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column with ascending as default
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const filteredPersonnel = personnel.filter(person => {
        const matchesSearch = !searchTerm ||
            person.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesOrg = filterOrg === 'all' || person.organization_id === filterOrg;
        const matchesRole = filterRole === 'all' || person.role === filterRole;

        // Filter by competencies - person must have ALL selected competencies
        const matchesCompetencies = filterCompetencies.length === 0 ||
            filterCompetencies.every(compId =>
                person.competencies?.some(c =>
                    c.competency_id === compId &&
                    (c.status === 'active' ||
                     (c.expiry_date && new Date(c.expiry_date) >= new Date()))
                )
            );

        return matchesSearch && matchesOrg && matchesRole && matchesCompetencies;
    }).sort((a, b) => {
        let aValue, bValue;

        switch (sortColumn) {
            case 'name':
                aValue = (a.username || '').toLowerCase();
                bValue = (b.username || '').toLowerCase();
                break;
            case 'org':
                aValue = (a.organizations?.name || '').toLowerCase();
                bValue = (b.organizations?.name || '').toLowerCase();
                break;
            case 'role':
                aValue = (a.role || '').toLowerCase();
                bValue = (b.role || '').toLowerCase();
                break;
            case 'total':
                aValue = getCompetencyStats(a).total;
                bValue = getCompetencyStats(b).total;
                break;
            case 'active':
                aValue = getCompetencyStats(a).active;
                bValue = getCompetencyStats(b).active;
                break;
            case 'expiring':
                aValue = getCompetencyStats(a).expiring;
                bValue = getCompetencyStats(b).expiring;
                break;
            case 'expired':
                aValue = getCompetencyStats(a).expired;
                bValue = getCompetencyStats(b).expired;
                break;
            default:
                return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleExportToCSV = async () => {
        try {
            const csv = await personnelService.exportPersonnelToCSV(filteredPersonnel);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `personnel-competencies-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Failed to export data');
        }
    };

    if (!isSupabaseConfigured()) {
        return (
            <div className="h-full flex flex-col">
                <div id="personnel-header"></div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            Personnel management requires Supabase backend configuration.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="personnel-header" style={{ flexShrink: 0 }}>
                {typeof window !== 'undefined' && (() => {
                    const container = document.getElementById('personnel-header');
                    if (container && container.children.length === 0) {
                        const header = createModernHeader(
                            'Personnel Management',
                            'Manage employee competencies, certifications, and training records',
                            {
                                showParticles: true,
                                particleCount: 25,
                                gradientColors: ['#10b981', '#3b82f6'],
                                height: '100px',
                                showLogo: false
                            }
                        );
                        container.appendChild(header);
                    }
                    return null;
                })()}
            </div>

            {/* Navigation Tabs */}
            <div className="glass-panel" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 0, flexShrink: 0, padding: 0 }}>
                <div className="flex px-6">
                    <button
                        onClick={() => setView('directory')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'directory' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'directory' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'
                        }}
                    >
                        Personnel Directory
                    </button>
                    <button
                        onClick={() => setView('expiring')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'expiring' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'expiring' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'
                        }}
                    >
                        Expiring Certifications
                        {expiringCompetencies.length > 0 && (
                            <span className="ml-2 glass-badge badge-red text-xs">{expiringCompetencies.length}</span>
                        )}
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setView('approvals')}
                            className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                            style={{
                                borderColor: view === 'approvals' ? 'var(--accent-primary)' : 'transparent',
                                color: view === 'approvals' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'
                            }}
                        >
                            Pending Approvals
                            {(pendingApprovalsQuery.data?.length || 0) > 0 && (
                                <span className="ml-2 glass-badge badge-yellow text-xs">{pendingApprovalsQuery.data?.length}</span>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <MatrixLogoRacer size={160} duration={4} />
                        <div className="text-gray-400 animate-pulse">Loading personnel data...</div>
                    </div>
                ) : view === 'directory' ? (
                    <DirectoryView
                        personnel={filteredPersonnel}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filterOrg={filterOrg}
                        setFilterOrg={setFilterOrg}
                        filterRole={filterRole}
                        setFilterRole={setFilterRole}
                        filterCompetencies={filterCompetencies}
                        setFilterCompetencies={setFilterCompetencies}
                        organizations={organizations}
                        competencyDefinitions={competencyDefinitions}
                        onExport={handleExportToCSV}
                        onSelectPerson={setSelectedPerson}
                        getCompetencyStats={getCompetencyStats}
                        onImport={() => {
                            console.log('Import button clicked!');
                            setShowImportModal(true);
                        }}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                    />
                ) : view === 'matrix' ? (
                    <MatrixView
                        personnel={filteredPersonnel}
                        competencyMatrix={competencyMatrix}
                        loading={!competencyMatrix}
                    />
                ) : view === 'approvals' && isAdmin ? (
                    <PendingApprovalsView />
                ) : (
                    <ExpiringView
                        expiringCompetencies={expiringCompetencies}
                        personnel={personnel}
                    />
                )}
            </div>

            {/* Person Detail Modal */}
            {selectedPerson && (
                <PersonDetailModal
                    person={selectedPerson}
                    onClose={() => setSelectedPerson(null)}
                    onRefresh={loadData}
                />
            )}

            {/* Import Modal */}
            {showImportModal && (
                <UniversalImportModal
                    onClose={() => setShowImportModal(false)}
                    onComplete={() => loadData(true)}
                />
            )}

            {/* Import Success Toast */}
            {importSuccess && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 9999,
                    padding: '16px 24px',
                    background: 'rgba(16, 185, 129, 0.95)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    animation: 'slideInRight 0.3s ease-out'
                }}>
                    <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Personnel imported successfully! Check the directory below.
                </div>
            )}
        </div>
    );
}

// Directory View Component
function DirectoryView({ personnel, searchTerm, setSearchTerm, filterOrg, setFilterOrg, filterRole, setFilterRole, filterCompetencies, setFilterCompetencies, organizations, competencyDefinitions, onExport, onSelectPerson, getCompetencyStats, onImport, sortColumn, sortDirection, onSort }) {
    const [showCompetencyDropdown, setShowCompetencyDropdown] = useState(false);
    const [expandedPersonId, setExpandedPersonId] = useState(null);
    const [editingPersonId, setEditingPersonId] = useState(null);
    const [editFormData, setEditFormData] = useState({
        username: '',
        email: '',
        role: '',
        organization_id: ''
    });
    const [saving, setSaving] = useState(false);
    const [editingCompetencyId, setEditingCompetencyId] = useState(null);
    const [competencyEditData, setCompetencyEditData] = useState({});
    const currentUser = authManager.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'org_admin';

    const handleEditCompetency = (comp) => {
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

    const handleSaveCompetency = async (compId) => {
        if (!isAdmin) return;

        setSaving(true);
        try {
            const updateData = {
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
            await loadData();
            setEditingCompetencyId(null);
        } catch (error) {
            console.error('Error updating competency:', error);
            alert('Failed to update competency: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelCompetencyEdit = () => {
        setEditingCompetencyId(null);
        setCompetencyEditData({});
    };

    const handleEditPerson = (person) => {
        setEditingPersonId(person.id);
        setEditFormData({
            username: person.username,
            email: person.email,
            role: person.role,
            organization_id: person.organization_id
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

    const handleSaveEdit = async (personId) => {
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
            await loadData();
            setEditingPersonId(null);
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile: ' + error.message);
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
                                            .reduce((acc, comp) => {
                                                const categoryName = comp.category?.name || 'Other';
                                                if (!acc[categoryName]) acc[categoryName] = [];
                                                acc[categoryName].push(comp);
                                                return acc;
                                            }, {})
                                    ).map(([categoryName, comps]) => (
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
                                                {comps.map(comp => {
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
                                    <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
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
                                                <td colSpan="8" style={{ padding: 0, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
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
                                                                const competenciesByCategory = {};
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
                                                                                    {competenciesByCategory[categoryName].map(comp => {
                                                                                        const isExpired = comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date());
                                                                                        const isExpiringSoon = comp.expiry_date && !isExpired && Math.ceil((new Date(comp.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) <= 30;

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
                                                                                                                rows="2"
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
                                                                                                                                    rows="2"
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
                                                                                                                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={comp.notes}>
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

// Matrix View Component
function MatrixView({ personnel, competencyMatrix, loading, onMatrixUpdate }) {
    const [statusFilter, setStatusFilter] = useState('all'); // all, expiring, expired, active
    const [highlightIssues, setHighlightIssues] = useState(true);
    const [editingCell, setEditingCell] = useState(null); // {personId, competencyId, competencyDef}
    const [editData, setEditData] = useState({
        issuedDate: '',
        expiryDate: '',
        issuingBody: '',
        certificationId: '',
        value: ''
    });
    const [saving, setSaving] = useState(false);
    const [localMatrix, setLocalMatrix] = useState(competencyMatrix);
    const currentUser = authManager.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'org_admin';

    // Update local matrix when prop changes
    useEffect(() => {
        setLocalMatrix(competencyMatrix);
    }, [competencyMatrix]);

    const handleCellClick = (person, comp) => {
        if (!isAdmin) return; // Only admins can edit

        const hasComp = person.competencies.find(c => c.competency_id === comp.id);

        // Allow clicking on both existing and non-existing competencies
        setEditingCell({
            personId: person.id,
            competencyId: comp.id,
            hasExisting: !!hasComp,
            competencyDef: comp
        });
        setEditData({
            issuedDate: hasComp?.created_at ? new Date(hasComp.created_at).toISOString().split('T')[0] : '',
            expiryDate: hasComp?.expiry_date ? new Date(hasComp.expiry_date).toISOString().split('T')[0] : '',
            issuingBody: hasComp?.issuing_body || '',
            certificationId: hasComp?.certification_id || '',
            value: hasComp?.value || ''
        });
    };

    const handleSaveDates = async () => {
        if (!editingCell) return;

        setSaving(true);
        try {
            if (editingCell.hasExisting) {
                // Update existing competency
                await personnelService.updateCompetencyDates(
                    editingCell.personId,
                    editingCell.competencyId,
                    editData.issuedDate || null,
                    editData.expiryDate || null,
                    editData.issuingBody || null,
                    editData.certificationId || null,
                    editData.value || null
                );
            } else {
                // Create new competency
                await personnelService.addCompetencyToEmployee(
                    editingCell.personId,
                    editingCell.competencyId,
                    editData.issuedDate || null,
                    editData.expiryDate || null,
                    editData.issuingBody || null,
                    editData.certificationId || null,
                    editData.value || null
                );
            }

            // Update local matrix data without reloading the page
            setLocalMatrix(prevMatrix => {
                const updatedMatrix = { ...prevMatrix };
                updatedMatrix.personnel = prevMatrix.personnel.map(person => {
                    if (person.id === editingCell.personId) {
                        const existingCompIndex = person.competencies.findIndex(c => c.competency_id === editingCell.competencyId);

                        if (existingCompIndex >= 0) {
                            // Update existing competency
                            const updatedCompetencies = [...person.competencies];
                            updatedCompetencies[existingCompIndex] = {
                                ...updatedCompetencies[existingCompIndex],
                                created_at: editData.issuedDate || updatedCompetencies[existingCompIndex].created_at,
                                expiry_date: editData.expiryDate || null,
                                issuing_body: editData.issuingBody || null,
                                certification_id: editData.certificationId || null,
                                value: editData.value || null
                            };
                            return {
                                ...person,
                                competencies: updatedCompetencies
                            };
                        } else {
                            // Add new competency
                            return {
                                ...person,
                                competencies: [
                                    ...person.competencies,
                                    {
                                        competency_id: editingCell.competencyId,
                                        created_at: editData.issuedDate,
                                        expiry_date: editData.expiryDate || null,
                                        issuing_body: editData.issuingBody || null,
                                        certification_id: editData.certificationId || null,
                                        value: editData.value || null,
                                        status: 'active'
                                    }
                                ]
                            };
                        }
                    }
                    return person;
                });
                return updatedMatrix;
            });

            // Notify parent component if callback provided
            if (onMatrixUpdate) {
                onMatrixUpdate();
            }

            setEditingCell(null);
        } catch (error) {
            console.error('Error saving competency:', error);
            alert('Failed to save competency: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingCell(null);
        setEditData({
            issuedDate: '',
            expiryDate: '',
            issuingBody: '',
            certificationId: '',
            value: ''
        });
    };

    if (loading || !localMatrix) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <MatrixLogoRacer size={160} duration={4} />
                <div className="text-gray-400 animate-pulse">Loading competency matrix...</div>
            </div>
        );
    }

    // Helper function to check competency status
    const getCompetencyStatus = (hasComp) => {
        if (!hasComp) return 'none';

        const isExpired = hasComp.status === 'expired' ||
            (hasComp.expiry_date && new Date(hasComp.expiry_date) < new Date());

        if (isExpired) return 'expired';

        if (hasComp.expiry_date) {
            const daysUntilExpiry = Math.ceil((new Date(hasComp.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
                return 'expiring';
            }
        }

        return 'active';
    };

    // Group competencies by category - filter out personal details
    const competenciesByCategory = {};
    const actualCompetencies = filterOutPersonalDetails(localMatrix.competencies);
    actualCompetencies.forEach(comp => {
        const categoryName = comp.category?.name || 'Other';
        if (!competenciesByCategory[categoryName]) {
            competenciesByCategory[categoryName] = [];
        }
        competenciesByCategory[categoryName].push(comp);
    });

    const categories = Object.keys(competenciesByCategory).sort();

    // Calculate statistics for filters
    const stats = {
        total: 0,
        expiring: 0,
        expired: 0,
        active: 0
    };

    localMatrix.personnel.forEach(person => {
        // Only count actual competencies, not personal details
        filterOutPersonalDetails(person.competencies).forEach(comp => {
            stats.total++;
            const status = getCompetencyStatus(comp);
            if (status === 'expiring') stats.expiring++;
            else if (status === 'expired') stats.expired++;
            else if (status === 'active') stats.active++;
        });
    });

    // Filter function - only show rows with matching status
    const shouldShowRow = (comp) => {
        if (statusFilter === 'all') return true;

        // Check if any person has this competency with the matching status
        return localMatrix.personnel.some(person => {
            const hasComp = person.competencies.find(c => c.competency_id === comp.id);
            const status = getCompetencyStatus(hasComp);
            return status === statusFilter;
        });
    };

    return (
        <div>
            {/* Filter Controls */}
            <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Filter Buttons */}
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '12px', textTransform: 'uppercase' }}>
                            Filter by Status:
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                All Competencies
                                <span className="glass-badge" style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.2)' }}>
                                    {stats.total}
                                </span>
                            </button>
                            <button
                                onClick={() => setStatusFilter('expired')}
                                className={statusFilter === 'expired' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    ...(statusFilter === 'expired' ? {} : { borderColor: '#ef4444' })
                                }}
                            >
                                <span style={{ color: '#ef4444', fontSize: '16px' }}>⚠</span>
                                Expired Only
                                {stats.expired > 0 && (
                                    <span className="glass-badge badge-red" style={{ fontSize: '11px' }}>
                                        {stats.expired}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setStatusFilter('expiring')}
                                className={statusFilter === 'expiring' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    ...(statusFilter === 'expiring' ? {} : { borderColor: '#f59e0b' })
                                }}
                            >
                                <span style={{ color: '#f59e0b', fontSize: '16px' }}>⏰</span>
                                Expiring Soon
                                {stats.expiring > 0 && (
                                    <span className="glass-badge" style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}>
                                        {stats.expiring}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setStatusFilter('active')}
                                className={statusFilter === 'active' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    ...(statusFilter === 'active' ? {} : { borderColor: '#10b981' })
                                }}
                            >
                                <span style={{ color: '#10b981', fontSize: '16px' }}>✓</span>
                                Active Only
                                <span className="glass-badge" style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                                    {stats.active}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Visual Options */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                            <input
                                type="checkbox"
                                checked={highlightIssues}
                                onChange={(e) => setHighlightIssues(e.target.checked)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <span>Highlight expiring/expired with pulse effect</span>
                        </label>
                        {isAdmin && (
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', fontStyle: 'italic' }}>
                                💡 Click any competency cell to edit dates, or click grey boxes (+) to add new competencies
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '20px' }}>
                    Competency Matrix
                    {statusFilter !== 'all' && (
                        <span style={{ fontSize: '14px', fontWeight: '400', color: 'rgba(255, 255, 255, 0.6)', marginLeft: '12px' }}>
                            (Showing {statusFilter} only)
                        </span>
                    )}
                </h2>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                        <tr>
                            <th style={{
                                padding: '12px 16px',
                                textAlign: 'left',
                                borderRight: '2px solid rgba(255, 255, 255, 0.2)',
                                position: 'sticky',
                                left: 0,
                                background: 'rgba(15, 23, 42, 0.95)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 11,
                                fontSize: '13px',
                                fontWeight: '700',
                                color: '#ffffff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                width: '280px',
                                maxWidth: '280px'
                            }}>
                                Competency / Category
                            </th>
                            {localMatrix.personnel.map(person => (
                                <th key={person.id} style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    minWidth: '120px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    color: '#ffffff',
                                    letterSpacing: '0.3px',
                                    borderBottom: '2px solid rgba(255, 255, 255, 0.2)'
                                }}>
                                    {person.username}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map(categoryName => (
                            <React.Fragment key={categoryName}>
                                {/* Category Header Row */}
                                <tr style={{ background: 'rgba(var(--accent-primary-rgb, 59, 130, 246), 0.1)' }}>
                                    <td colSpan={localMatrix.personnel.length + 1} style={{
                                        padding: '12px 12px',
                                        fontSize: '15px',
                                        fontWeight: '700',
                                        color: 'var(--accent-primary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        borderTop: '2px solid rgba(255, 255, 255, 0.1)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                        position: 'sticky',
                                        left: 0
                                    }}>
                                        {categoryName}
                                        <span style={{
                                            marginLeft: '12px',
                                            fontSize: '12px',
                                            fontWeight: '500',
                                            opacity: 0.7
                                        }}>
                                            ({competenciesByCategory[categoryName].length} competencies)
                                        </span>
                                    </td>
                                </tr>
                                {/* Competency Rows */}
                                {competenciesByCategory[categoryName].filter(shouldShowRow).map((comp, index, filteredArray) => (
                                    <tr key={comp.id} style={{
                                        borderBottom: index < filteredArray.length - 1
                                            ? '1px solid rgba(255, 255, 255, 0.05)'
                                            : '1px solid rgba(255, 255, 255, 0.08)'
                                    }} className="hover:bg-white/5 transition-colors">
                                        <td style={{
                                            padding: '12px 16px 12px 32px',
                                            fontWeight: '500',
                                            fontSize: '13px',
                                            color: 'rgba(255, 255, 255, 0.9)',
                                            position: 'sticky',
                                            left: 0,
                                            background: 'rgba(15, 23, 42, 0.9)',
                                            backdropFilter: 'blur(8px)',
                                            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                                            width: '280px',
                                            maxWidth: '280px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {comp.name}
                                        </td>
                                        {localMatrix.personnel.map(person => {
                                            const hasComp = person.competencies.find(c => c.competency_id === comp.id);
                                            const status = getCompetencyStatus(hasComp);
                                            const isExpiring = status === 'expiring';
                                            const isExpired = status === 'expired';
                                            const shouldPulse = highlightIssues && (isExpiring || isExpired);

                                            return (
                                                <td key={person.id} style={{ padding: '10px', textAlign: 'center' }}>
                                                    {hasComp ? (
                                                        <div
                                                            onClick={() => handleCellClick(person, comp)}
                                                            style={{
                                                                display: 'inline-flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                cursor: isAdmin ? 'pointer' : 'default',
                                                                padding: '8px',
                                                                borderRadius: '8px',
                                                                background: isExpired ? 'rgba(239, 68, 68, 0.1)' : isExpiring ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                                border: `2px solid ${isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : '#10b981'}`,
                                                                boxShadow: `0 0 8px ${isExpired ? 'rgba(239, 68, 68, 0.2)' : isExpiring ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                                                                animation: shouldPulse ? (isExpired ? 'pulse-red 2s infinite' : 'pulse-orange 2s infinite') : 'none',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            className="hover:brightness-110"
                                                        >
                                                            <div style={{
                                                                fontSize: '18px',
                                                                fontWeight: '700',
                                                                color: isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : '#10b981'
                                                            }}>
                                                                ✓
                                                            </div>
                                                            {/* Show dates for certifications */}
                                                            {shouldShowDateFields(comp) && hasComp.created_at && (
                                                                <div style={{
                                                                    fontSize: '10px',
                                                                    color: 'rgba(255, 255, 255, 0.6)',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    Issued: {new Date(hasComp.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                                </div>
                                                            )}
                                                            {shouldShowDateFields(comp) && hasComp.expiry_date && (
                                                                <div style={{
                                                                    fontSize: '10px',
                                                                    color: isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : 'rgba(255, 255, 255, 0.7)',
                                                                    fontWeight: '600',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    Exp: {new Date(hasComp.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                                </div>
                                                            )}
                                                            {/* Show value for personal details (email, phone, DOB, etc.) */}
                                                            {!shouldShowDateFields(comp) && hasComp.value && (
                                                                <div style={{
                                                                    fontSize: '10px',
                                                                    color: 'rgba(255, 255, 255, 0.8)',
                                                                    whiteSpace: 'nowrap',
                                                                    maxWidth: '120px',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                }}>
                                                                    {comp.field_type === 'date'
                                                                        ? new Date(hasComp.value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                                        : hasComp.value}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => handleCellClick(person, comp)}
                                                            style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '6px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: 'rgba(255, 255, 255, 0.03)',
                                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                                color: 'rgba(255, 255, 255, 0.2)',
                                                                fontSize: '16px',
                                                                cursor: isAdmin ? 'pointer' : 'default',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            className={isAdmin ? 'hover:bg-white/10 hover:border-white/30 hover:text-white/50' : ''}
                                                        >
                                                            {isAdmin ? '+' : '−'}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
                <div className="mt-6 flex flex-wrap gap-6" style={{ fontSize: '14px', fontWeight: '500' }}>
                    <div className="flex items-center gap-2">
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.2)', border: '2px solid #10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)' }}></div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.2)', border: '2px solid #f59e0b', boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}></div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Expiring Soon (≤30 days)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', border: '2px solid #ef4444', boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)' }}></div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Expired</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}></div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Not Assigned</span>
                    </div>
                </div>
            </div>

            {/* Edit Competency Modal */}
            {editingCell && (
                <div className="modal" style={{ display: 'flex' }}>
                    <div className="modal-backdrop" onClick={handleCancelEdit}></div>
                    <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                                {editingCell.hasExisting ? 'Edit Competency' : 'Add Competency'}
                            </h3>
                            <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
                                {editingCell.competencyDef?.name}
                            </p>
                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>
                                {editingCell.competencyDef?.category?.name}
                            </p>
                        </div>

                        {/* Show certification-specific fields for certification types */}
                        {shouldShowCertificationFields(editingCell.competencyDef) ? (
                            <>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                                        Issuing Body
                                    </label>
                                    <input
                                        type="text"
                                        value={editData.issuingBody}
                                        onChange={(e) => setEditData({ ...editData, issuingBody: e.target.value })}
                                        placeholder={getPlaceholder('issuing body', 'text')}
                                        className="glass-input"
                                        style={{ width: '100%' }}
                                    />
                                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                                        Organization that issued the certification
                                    </p>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                                        Certification ID / Number
                                    </label>
                                    <input
                                        type="text"
                                        value={editData.certificationId}
                                        onChange={(e) => setEditData({ ...editData, certificationId: e.target.value })}
                                        placeholder={getPlaceholder('id number', 'text')}
                                        className="glass-input"
                                        style={{ width: '100%' }}
                                    />
                                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                                        Unique certification or certificate number
                                    </p>
                                </div>
                            </>
                        ) : (
                            /* For non-certification fields, show appropriate input based on field type */
                            editingCell.competencyDef?.field_type !== 'date' && editingCell.competencyDef?.field_type !== 'expiry_date' && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                                        Value
                                    </label>
                                    <input
                                        type={getInputType(editingCell.competencyDef?.name, editingCell.competencyDef?.field_type)}
                                        value={editData.value}
                                        onChange={(e) => setEditData({ ...editData, value: e.target.value })}
                                        placeholder={getPlaceholder(editingCell.competencyDef?.name, getInputType(editingCell.competencyDef?.name, editingCell.competencyDef?.field_type))}
                                        className="glass-input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            )
                        )}

                        {/* Only show date fields for fields that need them (not personal details) */}
                        {shouldShowDateFields(editingCell.competencyDef) && (
                            <>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                                        Issued Date {editingCell.competencyDef?.field_type !== 'expiry_date' && '(Optional)'}
                                    </label>
                                    <input
                                        type="text"
                                        value={editData.issuedDate}
                                        onChange={(e) => setEditData({ ...editData, issuedDate: e.target.value })}
                                        onFocus={(e) => e.target.type = 'date'}
                                        onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                                        placeholder="YYYY-MM-DD or use date picker"
                                        className="glass-input"
                                        style={{ width: '100%' }}
                                    />
                                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                                        When was this competency achieved/issued?
                                    </p>
                                </div>

                                {/* Only show expiry date for expiry_date type fields */}
                                {(editingCell.competencyDef?.field_type === 'expiry_date' || editingCell.competencyDef?.field_type === 'date') && (
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                                            Expiry Date {editingCell.competencyDef?.field_type !== 'expiry_date' && '(Optional)'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editData.expiryDate}
                                            onChange={(e) => setEditData({ ...editData, expiryDate: e.target.value })}
                                            onFocus={(e) => e.target.type = 'date'}
                                            onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                                            placeholder="YYYY-MM-DD or use date picker"
                                            className="glass-input"
                                            style={{ width: '100%' }}
                                        />
                                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                                            When does this competency expire? (Leave blank if it doesn't expire)
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleCancelEdit}
                                className="btn-secondary"
                                disabled={saving}
                                style={{ padding: '10px 24px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveDates}
                                className="btn-primary"
                                disabled={saving}
                                style={{ padding: '10px 24px' }}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Expiring View Component
function ExpiringView({ expiringCompetencies, personnel }) {
    const groupedByPerson = {};

    expiringCompetencies.forEach(comp => {
        if (!groupedByPerson[comp.user_id]) {
            const person = personnel.find(p => p.id === comp.user_id);
            groupedByPerson[comp.user_id] = {
                person,
                competencies: []
            };
        }
        groupedByPerson[comp.user_id].competencies.push(comp);
    });

    return (
        <div>
            <div className="mb-6">
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                    Expiring Certifications
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                    Certifications expiring within the next 30 days
                </p>
            </div>

            {Object.keys(groupedByPerson).length === 0 ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                    <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
                        No certifications expiring in the next 30 days
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.values(groupedByPerson).map(({ person, competencies }) => (
                        <div key={person.id} className="glass-card" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
                                        {person.username}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        {person.email} • {person.organizations?.name}
                                    </div>
                                </div>
                                <span className="glass-badge badge-red">
                                    {competencies.length} expiring
                                </span>
                            </div>
                            <div className="space-y-2">
                                {competencies.map(comp => {
                                    const daysUntilExpiry = Math.ceil((new Date(comp.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                                    const isUrgent = daysUntilExpiry <= 7;

                                    return (
                                        <div key={comp.id} className="glass-item" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '500', color: '#ffffff', marginBottom: '4px' }}>
                                                    {comp.competency_name}
                                                </div>
                                                <div style={{ fontSize: '13px', color: isUrgent ? '#ef4444' : '#f59e0b' }}>
                                                    Expires: {new Date(comp.expiry_date).toLocaleDateString()} ({daysUntilExpiry} days)
                                                </div>
                                            </div>
                                            {isUrgent && (
                                                <span className="glass-badge badge-red" style={{ fontSize: '11px' }}>
                                                    URGENT
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Person Detail Modal Component
function PersonDetailModal({ person, onClose, onRefresh }) {
    return (
        <div className="modal" style={{ display: 'flex' }}>
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: '0 0 6px 0' }}>
                            {person.username}
                        </h3>
                        <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>
                            {person.email} • {person.organizations?.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '24px', padding: 0, width: '32px', height: '32px' }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
                        Competencies & Certifications
                    </h4>
                    {(!person.competencies || person.competencies.length === 0) ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                            No competencies recorded
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {person.competencies.map(comp => (
                                <div key={comp.id} className="glass-item" style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                                                {comp.competency?.name}
                                            </div>
                                            {comp.issuing_body && (
                                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
                                                    <span style={{ opacity: 0.6 }}>Issuing Body:</span> {comp.issuing_body}
                                                </div>
                                            )}
                                            {comp.certification_id && (
                                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
                                                    <span style={{ opacity: 0.6 }}>Certificate ID:</span> {comp.certification_id}
                                                </div>
                                            )}
                                            {comp.value && (
                                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
                                                    <span style={{ opacity: 0.6 }}>Value:</span> {comp.value}
                                                </div>
                                            )}
                                            {comp.created_at && (
                                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
                                                    <span style={{ opacity: 0.6 }}>Issued:</span> {new Date(comp.created_at).toLocaleDateString()}
                                                </div>
                                            )}
                                            {comp.expiry_date && (
                                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
                                                    <span style={{ opacity: 0.6 }}>Expires:</span> {new Date(comp.expiry_date).toLocaleDateString()}
                                                </div>
                                            )}
                                            {comp.notes && (
                                                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '8px' }}>
                                                    {comp.notes}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            {comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date()) ? (
                                                <span className="glass-badge badge-red">Expired</span>
                                            ) : comp.status === 'pending_approval' ? (
                                                <span className="glass-badge" style={{ background: 'rgba(251, 191, 36, 0.2)', color: 'rgba(253, 224, 71, 1)' }}>Pending</span>
                                            ) : (
                                                <span className="glass-badge badge-green">Active</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
