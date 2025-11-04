import React, { useState, useEffect } from 'react';
import { createModernHeader } from '../components/modern-header.js';
import authManager from '../auth-manager.js';
import competencyService from '../services/competency-service.js';
import personnelService from '../services/personnel-service.js';
import { isSupabaseConfigured } from '../supabase-client.js';
import CSVImportModal from '../components/CSVImportModal.jsx';
import { shouldShowCertificationFields, shouldShowDateFields, getInputType, getPlaceholder } from '../utils/competency-field-utils.js';

export default function PersonnelManagementPage() {
    const [view, setView] = useState('directory'); // directory, matrix, expiring
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterOrg, setFilterOrg] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [organizations, setOrganizations] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [expiringCompetencies, setExpiringCompetencies] = useState([]);
    const [competencyMatrix, setCompetencyMatrix] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);

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
            const [personnelData, orgsData, expiringData] = await Promise.all([
                personnelService.getAllPersonnelWithCompetencies(),
                authManager.getOrganizations(),
                competencyService.getExpiringCompetencies(30)
            ]);

            setPersonnel(personnelData);
            setOrganizations(orgsData.filter(org => org.name !== 'SYSTEM'));
            setExpiringCompetencies(expiringData);

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

    const filteredPersonnel = personnel.filter(person => {
        const matchesSearch = !searchTerm ||
            person.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesOrg = filterOrg === 'all' || person.organization_id === filterOrg;
        const matchesRole = filterRole === 'all' || person.role === filterRole;

        return matchesSearch && matchesOrg && matchesRole;
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

    const getCompetencyStats = (person) => {
        const competencies = person.competencies || [];
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
                                height: '100px'
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
                        onClick={() => setView('matrix')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'matrix' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'matrix' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'
                        }}
                    >
                        Competency Matrix
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
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Loading personnel data...</div>
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
                        organizations={organizations}
                        onExport={handleExportToCSV}
                        onSelectPerson={setSelectedPerson}
                        getCompetencyStats={getCompetencyStats}
                        onImport={() => setShowImportModal(true)}
                    />
                ) : view === 'matrix' ? (
                    <MatrixView
                        personnel={filteredPersonnel}
                        competencyMatrix={competencyMatrix}
                        loading={!competencyMatrix}
                    />
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

            {/* CSV Import Modal */}
            {showImportModal && (
                <CSVImportModal
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
function DirectoryView({ personnel, searchTerm, setSearchTerm, filterOrg, setFilterOrg, filterRole, setFilterRole, organizations, onExport, onSelectPerson, getCompetencyStats, onImport }) {
    return (
        <div>
            {/* Filters and Actions */}
            <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-3 flex-1">
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glass-input"
                        style={{ flex: 1, maxWidth: '400px' }}
                    />
                    <select
                        value={filterOrg}
                        onChange={(e) => setFilterOrg(e.target.value)}
                        className="glass-select"
                    >
                        <option value="all">All Organizations</option>
                        {organizations.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="glass-select"
                    >
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="org_admin">Org Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={onImport}
                        className="btn-primary"
                        style={{ padding: '10px 20px' }}
                    >
                        <svg style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        Import CSV
                    </button>
                    <button
                        onClick={onExport}
                        className="btn-secondary"
                        style={{ padding: '10px 20px' }}
                    >
                        <svg style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Export to CSV
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '8px' }}>Total Personnel</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>{personnel.length}</div>
                </div>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '8px' }}>Active Certifications</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
                        {personnel.reduce((sum, p) => sum + getCompetencyStats(p).active, 0)}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '8px' }}>Expiring Soon</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
                        {personnel.reduce((sum, p) => sum + getCompetencyStats(p).expiring, 0)}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '8px' }}>Expired</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>
                        {personnel.reduce((sum, p) => sum + getCompetencyStats(p).expired, 0)}
                    </div>
                </div>
            </div>

            {/* Personnel Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <tr>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Name</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Organization</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Role</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Total Certs</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Active</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Expiring</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase' }}>Expired</th>
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
                                return (
                                    <tr key={person.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }} className="hover:bg-white/5 transition-colors">
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
                                                onClick={() => onSelectPerson(person)}
                                                className="btn-primary"
                                                style={{ padding: '6px 16px', fontSize: '13px' }}
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
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
            <div className="flex items-center justify-center h-full">
                <div style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Loading competency matrix...</div>
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

    // Group competencies by category
    const competenciesByCategory = {};
    localMatrix.competencies.forEach(comp => {
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
        person.competencies.forEach(comp => {
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
                                style={{ padding: '10px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
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
                                    padding: '10px 20px',
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
                                    padding: '10px 20px',
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
                                    padding: '10px 20px',
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
