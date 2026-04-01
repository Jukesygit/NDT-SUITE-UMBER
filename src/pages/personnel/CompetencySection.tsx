/**
 * CompetencySection - Competency grid listing with categories
 */

import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { requiresWitnessCheck } from '../../utils/competency-field-utils.js';
import {
    CertIcon,
    WitnessIcon,
    WitnessCheckButtonIcon,
    DocumentIcon,
    getCompetencyStatus,
    groupByCategory,
} from './PersonnelExpandedRowUtils';

interface CompetencySectionProps {
    competencies: PersonCompetency[];
    isAdmin: boolean;
    onEditCompetency: (comp: PersonCompetency) => void;
    onWitnessCheck: (comp: PersonCompetency) => void;
    onViewCertificate: (comp: PersonCompetency) => void;
    onAddCompetency: () => void;
}

export function CompetencySection({
    competencies,
    isAdmin,
    onEditCompetency,
    onWitnessCheck,
    onViewCertificate,
    onAddCompetency,
}: CompetencySectionProps) {
    const competenciesByCategory = groupByCategory(competencies || []);
    const categories = Object.keys(competenciesByCategory).sort();

    return (
        <div className="pm-expanded-section">
            <h4 className="pm-expanded-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CertIcon />
                    Competencies & Certifications ({competencies?.length || 0})
                </div>
                {isAdmin && (
                    <button
                        onClick={onAddCompetency}
                        className="pm-btn primary sm"
                    >
                        <svg
                            style={{ width: '12px', height: '12px', marginRight: '4px' }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Certification
                    </button>
                )}
            </h4>

            {!competencies || competencies.length === 0 ? (
                <div className="pm-empty">
                    <div className="pm-empty-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                    </div>
                    <div className="pm-empty-title">No competencies recorded</div>
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
                                    <span className="pm-badge no-dot" style={{ fontSize: '11px', padding: '2px 8px' }}>
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
                                    const needsWitness = requiresWitnessCheck(comp);

                                    return (
                                        <div
                                            key={comp.id}
                                            className="pm-expanded-comp-item"
                                            style={{
                                                flexDirection: 'column',
                                                alignItems: 'stretch',
                                                borderLeft: `3px solid ${status.color}`,
                                                borderColor: status.bgColor,
                                                borderLeftColor: status.color,
                                                borderLeftWidth: '3px',
                                            }}
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
                                                        className="pm-competency-name"
                                                        style={{
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontSize: '13px',
                                                            marginBottom: 0,
                                                        }}
                                                        title={comp.competency?.name}
                                                    >
                                                        {comp.competency?.name || 'Unknown Competency'}
                                                    </div>
                                                    {needsWitness && comp.witness_checked && (
                                                        <WitnessIcon />
                                                    )}
                                                </div>
                                                <div className="pm-competency-actions">
                                                    <span className={`pm-badge ${status.cssClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                        {status.label}
                                                    </span>
                                                    {isAdmin && needsWitness && (
                                                        <button
                                                            onClick={() => onWitnessCheck(comp)}
                                                            className="btn-icon"
                                                            style={{ padding: '2px' }}
                                                            title={comp.witness_checked ? 'Update witness check' : 'Mark as witnessed'}
                                                        >
                                                            <WitnessCheckButtonIcon witnessed={!!comp.witness_checked} />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => onEditCompetency(comp)}
                                                            className="btn-icon"
                                                            style={{ padding: '2px', marginLeft: '4px' }}
                                                            title="Edit certification"
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

                                            {/* Competency Details */}
                                            <div className="pm-competency-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', fontSize: '11px' }}>
                                                {comp.level && (
                                                    <div>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                            Level:
                                                        </span>{' '}
                                                        <span style={{ fontWeight: '600' }}>{comp.level}</span>
                                                    </div>
                                                )}
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
                                                {comp.document_url && (
                                                        <button
                                                            onClick={() => onViewCertificate(comp)}
                                                            className="pm-competency-doc"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                padding: 0,
                                                            }}
                                                        >
                                                            <DocumentIcon />
                                                            View Certificate
                                                        </button>
                                                    )}
                                                </div>
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
