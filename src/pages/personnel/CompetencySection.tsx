/**
 * CompetencySection - Competency grid listing with categories
 */

import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { requiresWitnessCheck } from '../../utils/competency-field-utils';
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
                <div className="pm-comp-section-title-row">
                    <CertIcon />
                    Competencies & Certifications ({competencies?.length || 0})
                </div>
                {isAdmin && (
                    <button onClick={onAddCompetency} className="pm-btn primary sm">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="pm-category-list">
                    {categories.map((categoryName) => (
                        <div key={categoryName}>
                            <div className="pm-category-header">
                                <h5 className="pm-category-title">
                                    {categoryName}
                                    <span className="pm-badge pm-badge--xs no-dot">
                                        {competenciesByCategory[categoryName].length}
                                    </span>
                                </h5>
                            </div>

                            <div className="pm-competency-grid">
                                {competenciesByCategory[categoryName].map((comp) => {
                                    const status = getCompetencyStatus(comp);
                                    const needsWitness = requiresWitnessCheck(comp);

                                    return (
                                        <div key={comp.id} className="pm-comp-card">
                                            <div className="pm-comp-card-header">
                                                <div className="pm-comp-card-name-row">
                                                    <span className={`pm-comp-status-dot ${status.cssClass}`} />
                                                    <div className="pm-comp-card-name" title={comp.competency?.name}>
                                                        {comp.competency?.name || 'Unknown Competency'}
                                                    </div>
                                                    {needsWitness && comp.witness_checked && <WitnessIcon />}
                                                </div>
                                                <div className="pm-competency-actions">
                                                    <span className={`pm-badge pm-badge--status ${status.cssClass}`}>
                                                        {status.label}
                                                    </span>
                                                    {isAdmin && needsWitness && (
                                                        <button
                                                            onClick={() => onWitnessCheck(comp)}
                                                            className="btn-icon pm-btn-icon"
                                                            title={comp.witness_checked ? 'Update witness check' : 'Mark as witnessed'}
                                                        >
                                                            <WitnessCheckButtonIcon witnessed={!!comp.witness_checked} />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => onEditCompetency(comp)}
                                                            className="btn-icon pm-btn-icon--ml"
                                                            title="Edit certification"
                                                        >
                                                            <svg className="pm-icon-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                                            <div className="pm-comp-card-meta">
                                                {comp.level && (
                                                    <div>
                                                        <span className="pm-comp-meta-label">Level:</span>{' '}
                                                        <span className="pm-comp-meta-value--bold">{comp.level}</span>
                                                    </div>
                                                )}
                                                {comp.issuing_body && (
                                                    <div>
                                                        <span className="pm-comp-meta-label">Issued by:</span>{' '}
                                                        {comp.issuing_body}
                                                    </div>
                                                )}
                                                {comp.certification_id && (
                                                    <div>
                                                        <span className="pm-comp-meta-label">Cert ID:</span>{' '}
                                                        {comp.certification_id}
                                                    </div>
                                                )}
                                                {comp.expiry_date && (
                                                    <div>
                                                        <span className="pm-comp-meta-label">Expires:</span>{' '}
                                                        {new Date(comp.expiry_date).toLocaleDateString('en-GB')}
                                                    </div>
                                                )}
                                                {comp.document_url && (
                                                    <button
                                                        onClick={() => onViewCertificate(comp)}
                                                        className="pm-view-cert-btn"
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
