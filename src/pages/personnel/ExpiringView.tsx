/**
 * ExpiringView - Display competencies expiring soon
 */

import type { Person } from '../../hooks/queries/usePersonnel';

export interface ExpiringCompetency {
    id: string;
    user_id: string;
    competency_name: string;
    expiry_date: string;
}

interface ExpiringViewProps {
    expiringCompetencies: ExpiringCompetency[];
    personnel: Person[];
}

interface GroupedByPerson {
    person: Person;
    competencies: ExpiringCompetency[];
}

function getDaysUntilExpiry(expiryDate: string): number {
    return Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function groupByPerson(
    expiringCompetencies: ExpiringCompetency[],
    personnel: Person[]
): Record<string, GroupedByPerson> {
    const grouped: Record<string, GroupedByPerson> = {};

    expiringCompetencies.forEach((comp) => {
        if (!grouped[comp.user_id]) {
            const person = personnel.find((p) => p.id === comp.user_id);
            if (person) {
                grouped[comp.user_id] = { person, competencies: [] };
            }
        }
        if (grouped[comp.user_id]) {
            grouped[comp.user_id].competencies.push(comp);
        }
    });

    return grouped;
}

export function ExpiringView({ expiringCompetencies, personnel }: ExpiringViewProps) {
    const groupedByPerson = groupByPerson(expiringCompetencies, personnel);
    const hasExpiring = Object.keys(groupedByPerson).length > 0;

    return (
        <div>
            <div className="pm-section-header">
                <h2 className="pm-section-title">Expiring Certifications</h2>
                <p className="pm-section-subtitle">Certifications expiring within the next 30 days</p>
            </div>

            {!hasExpiring ? (
                <div className="pm-person-card">
                    <div className="pm-empty">
                        <div className="pm-empty-icon">
                            <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div className="pm-empty-title">All clear</div>
                        <div className="pm-empty-text">No certifications expiring in the next 30 days</div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {Object.values(groupedByPerson).map(({ person, competencies }, index) => (
                        <div key={person.id} className="pm-person-card" style={{ animationDelay: `${index * 0.05}s` }}>
                            <div className="pm-person-card-header">
                                <div>
                                    <div className="pm-person-card-name">{person.username}</div>
                                    <div className="pm-person-card-meta">
                                        {person.email} {person.organizations?.name && `\u00B7 ${person.organizations.name}`}
                                    </div>
                                </div>
                                <span className="pm-badge expired no-dot">{competencies.length} expiring</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {competencies.map((comp) => {
                                    const daysUntilExpiry = getDaysUntilExpiry(comp.expiry_date);
                                    const isUrgent = daysUntilExpiry <= 7;

                                    return (
                                        <div key={comp.id} className="pm-competency-item">
                                            <div style={{ flex: 1 }}>
                                                <div className="pm-competency-name">{comp.competency_name}</div>
                                                <div className="pm-competency-meta">
                                                    <span style={{ color: isUrgent ? '#ef4444' : '#f59e0b' }}>
                                                        Expires: {new Date(comp.expiry_date).toLocaleDateString()} ({daysUntilExpiry} days)
                                                    </span>
                                                </div>
                                            </div>
                                            {isUrgent && (
                                                <span className="pm-badge urgent no-dot">URGENT</span>
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

export default ExpiringView;
