// @ts-nocheck - Refactored page using extracted components and custom hooks
import React, { useState, useEffect } from 'react';
import { createModernHeader } from '../components/modern-header.js';
import personnelService from '../services/personnel-service.ts';
import { isSupabaseConfigured } from '../supabase-client.js';
import UniversalImportModal from '../components/UniversalImportModal.jsx';
import { ContentLoader } from '../components/LoadingStates.jsx';
import toast from '../components/Toast.jsx';
import { filterOutPersonalDetails } from '../utils/competency-field-utils.js';

// Custom hooks
import { usePersonnelData } from '../hooks/usePersonnelData.ts';
import { usePersonnelFilters } from '../hooks/usePersonnelFilters.ts';
import { usePersonnelSort } from '../hooks/usePersonnelSort.ts';

// View components
import DirectoryView from '../components/personnel/DirectoryView.tsx';
import MatrixView from '../components/personnel/MatrixView.tsx';
import ExpiringView from '../components/personnel/ExpiringView.tsx';
import PendingApprovalsView from '../components/personnel/PendingApprovalsView.tsx';

/**
 * Personnel Management Page
 *
 * Main personnel management interface with four views:
 * - Directory: Sortable, filterable personnel list with detailed competency data
 * - Pending Approvals: Document approval workflow for admin review
 * - Expiring: Certifications expiring within 30 days
 * - Matrix: Grid view of all competencies across all personnel (legacy, not in tabs)
 *
 * Refactored from 2,600-line monolith into modular architecture:
 * - Custom hooks for data, filtering, and sorting logic
 * - Extracted view components for each interface
 * - Centralized state management
 * - Performance optimized with memoization
 */
export default function PersonnelManagementPage() {
    // View state
    const [view, setView] = useState('directory'); // directory, pending, expiring
    const [competencyMatrix, setCompetencyMatrix] = useState(null);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);

    // Custom hooks for data management
    const {
        personnel,
        organizations,
        competencyDefinitions,
        expiringCompetencies,
        pendingApprovals,
        loading,
        error,
        refetch
    } = usePersonnelData();

    // Custom hooks for filtering
    const {
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
    } = usePersonnelFilters(personnel);

    // Custom hooks for sorting
    const {
        sortedPersonnel,
        sortColumn,
        sortDirection,
        handleSort
    } = usePersonnelSort(filteredPersonnel);

    /**
     * Load competency matrix data (only when matrix view is active)
     */
    const loadCompetencyMatrix = async () => {
        try {
            const matrix = await personnelService.getCompetencyMatrix();
            setCompetencyMatrix(matrix);
        } catch (error) {
            console.error('Error loading competency matrix:', error);
        }
    };

    // Load matrix data when switching to matrix view
    useEffect(() => {
        if (view === 'matrix') {
            loadCompetencyMatrix();
        }
    }, [view]);

    /**
     * Calculate competency statistics for a person
     * Filters out personal details - only counts actual certifications/qualifications
     */
    const getCompetencyStats = (person) => {
        const competencies = filterOutPersonalDetails(person.competencies || []);
        const total = competencies.length;
        const active = competencies.filter(c => c.status === 'active').length;
        const expiring = competencies.filter(c => {
            if (!c.expiry_date) return false;
            const daysUntilExpiry = Math.ceil((new Date(c.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
        }).length;
        const expired = competencies.filter(c => c.status === 'expired' ||
            (c.expiry_date && new Date(c.expiry_date) < new Date())).length;

        return { total, active, expiring, expired };
    };

    /**
     * Export filtered personnel to CSV
     */
    const handleExportToCSV = async () => {
        try {
            const csv = await personnelService.exportPersonnelToCSV(sortedPersonnel);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `personnel-competencies-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${sortedPersonnel.length} personnel records successfully!`);
        } catch (error) {
            console.error('Error exporting:', error);
            toast.error('Failed to export data. Please try again.');
        }
    };

    /**
     * Handle successful import - refresh data and show success message
     */
    const handleImportComplete = async () => {
        await refetch(true);
        setImportSuccess(true);
        setView('directory'); // Switch to directory view
        setTimeout(() => setImportSuccess(false), 5000); // Hide after 5 seconds
    };

    // Show error state if not configured
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
                        onClick={() => setView('pending')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'pending' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'pending' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'
                        }}
                    >
                        Pending Approvals
                        {pendingApprovals.length > 0 && (
                            <span className="ml-2 glass-badge" style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '10px' }}>{pendingApprovals.length}</span>
                        )}
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
                    <ContentLoader message="Loading personnel data..." />
                ) : view === 'pending' ? (
                    <PendingApprovalsView
                        pendingApprovals={pendingApprovals}
                        onRefresh={refetch}
                    />
                ) : view === 'directory' ? (
                    <DirectoryView
                        personnel={sortedPersonnel}
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
                        onImport={() => setShowImportModal(true)}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        onRefresh={refetch}
                    />
                ) : view === 'matrix' ? (
                    <MatrixView
                        personnel={sortedPersonnel}
                        competencyMatrix={competencyMatrix}
                        loading={!competencyMatrix}
                        onMatrixUpdate={loadCompetencyMatrix}
                    />
                ) : (
                    <ExpiringView
                        expiringCompetencies={expiringCompetencies}
                        personnel={personnel}
                    />
                )}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <UniversalImportModal
                    onClose={() => setShowImportModal(false)}
                    onComplete={handleImportComplete}
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
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Import completed successfully! Personnel data has been refreshed.
                </div>
            )}
        </div>
    );
}
