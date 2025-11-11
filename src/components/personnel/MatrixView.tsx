// @ts-nocheck - Component extracted from large page, uses JS imports that lack TypeScript definitions
import React, { useState, useEffect } from 'react';
import authManager from '../../auth-manager.js';
import personnelService from '../../services/personnel-service.ts';
import toast from '../Toast.jsx';
import {
    filterOutPersonalDetails,
    shouldShowDateFields,
    shouldShowCertificationFields,
    getInputType,
    getPlaceholder
} from '../../utils/competency-field-utils.js';
import type { PersonnelWithCompetencies, CompetencyDefinition } from '../../types/index.js';

/**
 * Competency matrix data structure
 */
interface CompetencyMatrix {
    personnel: PersonnelWithCompetencies[];
    competencies: CompetencyDefinition[];
}

/**
 * MatrixView component props
 */
interface MatrixViewProps {
    personnel: PersonnelWithCompetencies[];
    competencyMatrix: CompetencyMatrix | null;
    loading: boolean;
    onMatrixUpdate?: () => void;
}

/**
 * Matrix View Component
 *
 * Displays personnel competencies in a grid/matrix format:
 * - Rows: Competencies (grouped by category)
 * - Columns: Personnel
 * - Cells: Competency status with visual indicators
 *
 * Features:
 * - Filter by status (all, active, expiring, expired)
 * - Click cells to edit/add competencies
 * - Visual status indicators with pulse animations
 * - Sticky headers for easy navigation
 * - Category grouping
 * - Optimistic UI updates
 */
export function MatrixView({
    personnel,
    competencyMatrix,
    loading,
    onMatrixUpdate
}: MatrixViewProps) {
    const [statusFilter, setStatusFilter] = useState<string>('all'); // all, expiring, expired, active
    const [highlightIssues, setHighlightIssues] = useState<boolean>(true);
    const [editingCell, setEditingCell] = useState<any>(null); // {personId, competencyId, competencyDef}
    const [editData, setEditData] = useState({
        issuedDate: '',
        expiryDate: '',
        issuingBody: '',
        certificationId: '',
        value: ''
    });
    const [saving, setSaving] = useState(false);
    const [localMatrix, setLocalMatrix] = useState<CompetencyMatrix | null>(competencyMatrix);
    const currentUser = authManager.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'org_admin';

    // Update local matrix when prop changes
    useEffect(() => {
        setLocalMatrix(competencyMatrix);
    }, [competencyMatrix]);

    const handleCellClick = (person: PersonnelWithCompetencies, comp: CompetencyDefinition) => {
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
                if (!prevMatrix) return prevMatrix;

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
                                    } as any
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
            toast.success('Competency saved successfully!');
        } catch (error: any) {
            console.error('Error saving competency:', error);
            toast.error(`Failed to save competency: ${error.message}`);
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
    const getCompetencyStatus = (hasComp: any) => {
        if (!hasComp) return 'none';

        const isExpired = hasComp.status === 'expired' ||
            (hasComp.expiry_date && new Date(hasComp.expiry_date) < new Date());

        if (isExpired) return 'expired';

        if (hasComp.expiry_date) {
            const daysUntilExpiry = Math.ceil((new Date(hasComp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
                return 'expiring';
            }
        }

        return 'active';
    };

    // Group competencies by category - filter out personal details
    const competenciesByCategory: { [key: string]: CompetencyDefinition[] } = {};
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
    const shouldShowRow = (comp: CompetencyDefinition) => {
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
                                        onFocus={(e) => (e.target as HTMLInputElement).type = 'date'}
                                        onBlur={(e) => { if (!(e.target as HTMLInputElement).value) (e.target as HTMLInputElement).type = 'text'; }}
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
                                            onFocus={(e) => (e.target as HTMLInputElement).type = 'date'}
                                            onBlur={(e) => { if (!(e.target as HTMLInputElement).value) (e.target as HTMLInputElement).type = 'text'; }}
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

export default MatrixView;
