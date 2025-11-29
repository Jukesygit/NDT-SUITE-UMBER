/**
 * PersonnelExpandedRow - Expanded details view for a person in the table
 */

import { useState, useCallback } from 'react';
import type { Person, PersonCompetency, Organization } from '../../hooks/queries/usePersonnel';
import { useUpdatePerson, useUpdatePersonCompetency } from '../../hooks/mutations';

// Utility imports - ES module
import { requiresWitnessCheck } from '../../utils/competency-field-utils.js';

interface PersonnelExpandedRowProps {
    person: Person;
    isAdmin: boolean;
    organizations: Organization[];
    onUpdate?: () => void;
}

interface PersonEditData {
    username: string;
    email: string;
    role: string;
    organization_id: string;
}

interface CompetencyEditData {
    value: string;
    issuing_body: string;
    certification_id: string;
    expiry_date: string;
    issued_date: string;
    notes: string;
    witness_checked: boolean;
    witnessed_by: string;
    witnessed_at: string;
    witness_notes: string;
}

/**
 * User icon
 */
function UserIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
        </svg>
    );
}

/**
 * Checkmark icon for certifications
 */
function CertIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        </svg>
    );
}

/**
 * Edit icon
 */
function EditIcon({ size = 14 }: { size?: number }) {
    return (
        <svg
            style={{ width: `${size}px`, height: `${size}px`, marginRight: '4px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
        </svg>
    );
}

/**
 * Witness check icon
 */
function WitnessIcon() {
    return (
        <svg
            style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }}
            fill="currentColor"
            viewBox="0 0 20 20"
        >
            <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
            />
        </svg>
    );
}

/**
 * Get status color and label for a competency
 */
function getCompetencyStatus(comp: PersonCompetency): { color: string; bgColor: string; label: string } {
    const isExpired =
        comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date());
    const isExpiringSoon =
        comp.expiry_date &&
        !isExpired &&
        Math.ceil((new Date(comp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 30;

    if (isExpired) {
        return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.3)', label: 'Expired' };
    }
    if (isExpiringSoon) {
        return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.3)', label: 'Expiring' };
    }
    if (comp.status === 'pending_approval') {
        return { color: 'rgba(253, 224, 71, 1)', bgColor: 'rgba(251, 191, 36, 0.2)', label: 'Pending' };
    }
    return { color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.3)', label: 'Active' };
}

/**
 * Group competencies by category
 */
function groupByCategory(competencies: PersonCompetency[]): Record<string, PersonCompetency[]> {
    return competencies.reduce(
        (acc, comp) => {
            const categoryName = (comp.competency as { category?: { name?: string } })?.category?.name || 'Uncategorized';
            if (!acc[categoryName]) acc[categoryName] = [];
            acc[categoryName].push(comp);
            return acc;
        },
        {} as Record<string, PersonCompetency[]>
    );
}

/**
 * Display field component
 */
function DisplayField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div
                style={{
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>{value || '-'}</div>
        </div>
    );
}

/**
 * PersonnelExpandedRow component
 */
export function PersonnelExpandedRow({ person, isAdmin, organizations, onUpdate }: PersonnelExpandedRowProps) {
    // Person editing state
    const [editingPerson, setEditingPerson] = useState(false);
    const [personEditData, setPersonEditData] = useState<PersonEditData>({
        username: person.username,
        email: person.email,
        role: person.role,
        organization_id: person.organization_id || '',
    });

    // Competency editing state
    const [editingCompetencyId, setEditingCompetencyId] = useState<string | null>(null);
    const [competencyEditData, setCompetencyEditData] = useState<CompetencyEditData>({
        value: '',
        issuing_body: '',
        certification_id: '',
        expiry_date: '',
        issued_date: '',
        notes: '',
        witness_checked: false,
        witnessed_by: '',
        witnessed_at: '',
        witness_notes: '',
    });

    // Mutations
    const updatePerson = useUpdatePerson();
    const updateCompetency = useUpdatePersonCompetency();

    const handleEditPerson = useCallback(() => {
        setPersonEditData({
            username: person.username,
            email: person.email,
            role: person.role,
            organization_id: person.organization_id || '',
        });
        setEditingPerson(true);
    }, [person]);

    const handleCancelPersonEdit = useCallback(() => {
        setEditingPerson(false);
    }, []);

    const handleSavePerson = useCallback(async () => {
        await updatePerson.mutateAsync({
            personId: person.id,
            data: personEditData,
        });
        setEditingPerson(false);
        onUpdate?.();
    }, [person.id, personEditData, updatePerson, onUpdate]);

    const handleEditCompetency = useCallback((comp: PersonCompetency) => {
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
        });
    }, []);

    const handleCancelCompetencyEdit = useCallback(() => {
        setEditingCompetencyId(null);
    }, []);

    const handleSaveCompetency = useCallback(async () => {
        if (!editingCompetencyId) return;

        await updateCompetency.mutateAsync({
            competencyId: editingCompetencyId,
            personId: person.id,
            data: {
                value: competencyEditData.value || null,
                issuing_body: competencyEditData.issuing_body || null,
                certification_id: competencyEditData.certification_id || null,
                expiry_date: competencyEditData.expiry_date || null,
                notes: competencyEditData.notes || null,
                witness_checked: competencyEditData.witness_checked,
                witnessed_by: competencyEditData.witnessed_by || null,
                witnessed_at: competencyEditData.witnessed_at || null,
                witness_notes: competencyEditData.witness_notes || null,
                created_at: competencyEditData.issued_date || undefined,
            },
        });
        setEditingCompetencyId(null);
        onUpdate?.();
    }, [editingCompetencyId, person.id, competencyEditData, updateCompetency, onUpdate]);

    const competenciesByCategory = groupByCategory(person.competencies || []);
    const categories = Object.keys(competenciesByCategory).sort();

    return (
        <div
            style={{
                background: 'rgba(59, 130, 246, 0.05)',
                borderLeft: '4px solid var(--accent-primary)',
                padding: '24px',
                animation: 'slideDown 0.2s ease-out',
            }}
        >
            {/* Personal Information Section */}
            <div style={{ marginBottom: '20px' }}>
                <h4
                    style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#ffffff',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserIcon />
                        Personal Information
                    </div>
                    {isAdmin && !editingPerson && (
                        <button
                            onClick={handleEditPerson}
                            className="btn btn--secondary btn--sm"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                            <EditIcon />
                            Edit
                        </button>
                    )}
                </h4>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {editingPerson ? (
                        <>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Username
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.username}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, username: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Email
                                </div>
                                <input
                                    type="email"
                                    className="glass-input"
                                    value={personEditData.email}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, email: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Organization
                                </div>
                                <select
                                    className="glass-select"
                                    value={personEditData.organization_id}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, organization_id: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                >
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Role
                                </div>
                                <select
                                    className="glass-select"
                                    value={personEditData.role}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, role: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                    <option value="org_admin">Org Admin</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <DisplayField label="Username" value={person.username} />
                            <DisplayField label="Email" value={person.email} />
                            <DisplayField label="Organization" value={person.organizations?.name || 'Unknown'} />
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Role
                                </div>
                                <span className="glass-badge">{person.role}</span>
                            </div>
                        </>
                    )}
                </div>

                {editingPerson && (
                    <div
                        style={{
                            display: 'flex',
                            gap: '12px',
                            marginTop: '16px',
                            justifyContent: 'flex-end',
                        }}
                    >
                        <button
                            onClick={handleCancelPersonEdit}
                            className="btn btn--secondary btn--sm"
                            disabled={updatePerson.isPending}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSavePerson}
                            className="btn btn--primary btn--sm"
                            disabled={updatePerson.isPending}
                        >
                            {updatePerson.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div
                style={{
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                    margin: '20px 0',
                }}
            />

            {/* Competencies Section */}
            <div>
                <h4
                    style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#ffffff',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <CertIcon />
                    Competencies & Certifications ({person.competencies?.length || 0})
                </h4>

                {!person.competencies || person.competencies.length === 0 ? (
                    <div
                        style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.5)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '8px',
                            border: '1px dashed rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <svg
                            style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.3 }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        No competencies recorded
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {categories.map((categoryName) => (
                            <div key={categoryName}>
                                {/* Category Header */}
                                <div
                                    style={{
                                        marginBottom: '8px',
                                        paddingBottom: '6px',
                                        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
                                    }}
                                >
                                    <h5
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            color: 'rgba(255, 255, 255, 0.9)',
                                            margin: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        {categoryName}
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: '400',
                                                color: 'rgba(255, 255, 255, 0.5)',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                            }}
                                        >
                                            {competenciesByCategory[categoryName].length}
                                        </span>
                                    </h5>
                                </div>

                                {/* Competencies Grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                        gap: '8px',
                                    }}
                                >
                                    {competenciesByCategory[categoryName].map((comp) => {
                                        const status = getCompetencyStatus(comp);
                                        const isEditing = editingCompetencyId === comp.id;
                                        const needsWitness = requiresWitnessCheck(comp);

                                        return (
                                            <div
                                                key={comp.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    borderRadius: '6px',
                                                    borderLeft: `3px solid ${status.color}`,
                                                    border: `1px solid ${status.bgColor}`,
                                                    borderLeftWidth: '3px',
                                                    transition: 'all 0.2s ease',
                                                }}
                                                className="hover:bg-white/5"
                                            >
                                                {/* Header */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: '6px',
                                                        gap: '8px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            flex: 1,
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                fontWeight: '600',
                                                                color: '#ffffff',
                                                                fontSize: '13px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                            title={comp.competency?.name}
                                                        >
                                                            {comp.competency?.name || 'Unknown Competency'}
                                                        </div>
                                                        {needsWitness && comp.witness_checked && (
                                                            <WitnessIcon />
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <span
                                                            className="glass-badge"
                                                            style={{
                                                                background: status.bgColor,
                                                                color: status.color,
                                                                fontSize: '10px',
                                                                padding: '2px 6px',
                                                            }}
                                                        >
                                                            {status.label}
                                                        </span>
                                                        {isAdmin && !isEditing && (
                                                            <button
                                                                onClick={() => handleEditCompetency(comp)}
                                                                className="btn-icon"
                                                                style={{ padding: '2px', marginLeft: '4px' }}
                                                            >
                                                                <svg
                                                                    style={{ width: '12px', height: '12px' }}
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth="2"
                                                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Competency Details or Edit Form */}
                                                {isEditing ? (
                                                    <div style={{ fontSize: '11px' }} className="space-y-2">
                                                        <div
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '1fr 1fr',
                                                                gap: '4px',
                                                            }}
                                                        >
                                                            <div>
                                                                <label
                                                                    style={{
                                                                        fontSize: '10px',
                                                                        color: 'rgba(255, 255, 255, 0.5)',
                                                                        display: 'block',
                                                                        marginBottom: '2px',
                                                                    }}
                                                                >
                                                                    Issued
                                                                </label>
                                                                <input
                                                                    type="date"
                                                                    className="glass-input"
                                                                    value={competencyEditData.issued_date}
                                                                    onChange={(e) =>
                                                                        setCompetencyEditData({
                                                                            ...competencyEditData,
                                                                            issued_date: e.target.value,
                                                                        })
                                                                    }
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label
                                                                    style={{
                                                                        fontSize: '10px',
                                                                        color: 'rgba(255, 255, 255, 0.5)',
                                                                        display: 'block',
                                                                        marginBottom: '2px',
                                                                    }}
                                                                >
                                                                    Expires
                                                                </label>
                                                                <input
                                                                    type="date"
                                                                    className="glass-input"
                                                                    value={competencyEditData.expiry_date}
                                                                    onChange={(e) =>
                                                                        setCompetencyEditData({
                                                                            ...competencyEditData,
                                                                            expiry_date: e.target.value,
                                                                        })
                                                                    }
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: '8px',
                                                                marginTop: '8px',
                                                                justifyContent: 'flex-end',
                                                            }}
                                                        >
                                                            <button
                                                                onClick={handleCancelCompetencyEdit}
                                                                className="btn btn--secondary"
                                                                style={{ fontSize: '10px', padding: '4px 8px' }}
                                                                disabled={updateCompetency.isPending}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={handleSaveCompetency}
                                                                className="btn btn--primary"
                                                                style={{ fontSize: '10px', padding: '4px 8px' }}
                                                                disabled={updateCompetency.isPending}
                                                            >
                                                                {updateCompetency.isPending ? 'Saving...' : 'Save'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        style={{
                                                            fontSize: '11px',
                                                            color: 'rgba(255, 255, 255, 0.6)',
                                                            lineHeight: '1.4',
                                                        }}
                                                    >
                                                        {comp.issuing_body && (
                                                            <div>
                                                                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                    Issued by:
                                                                </span>{' '}
                                                                {comp.issuing_body}
                                                            </div>
                                                        )}
                                                        {comp.certification_id && (
                                                            <div>
                                                                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                    Cert ID:
                                                                </span>{' '}
                                                                {comp.certification_id}
                                                            </div>
                                                        )}
                                                        {comp.expiry_date && (
                                                            <div>
                                                                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                    Expires:
                                                                </span>{' '}
                                                                {new Date(comp.expiry_date).toLocaleDateString('en-GB')}
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
                )}
            </div>
        </div>
    );
}

export default PersonnelExpandedRow;
