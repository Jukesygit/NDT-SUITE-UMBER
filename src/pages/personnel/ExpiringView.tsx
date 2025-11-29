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
    /** List of expiring competencies */
    expiringCompetencies: ExpiringCompetency[];
    /** Personnel data for looking up person details */
    personnel: Person[];
}

interface GroupedByPerson {
    person: Person;
    competencies: ExpiringCompetency[];
}

/**
 * Checkmark icon
 */
function CheckIcon() {
    return (
        <svg
            style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.3 }}
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
 * Calculate days until expiry
 */
function getDaysUntilExpiry(expiryDate: string): number {
    return Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Group competencies by person
 */
function groupByPerson(
    expiringCompetencies: ExpiringCompetency[],
    personnel: Person[]
): Record<string, GroupedByPerson> {
    const grouped: Record<string, GroupedByPerson> = {};

    expiringCompetencies.forEach((comp) => {
        if (!grouped[comp.user_id]) {
            const person = personnel.find((p) => p.id === comp.user_id);
            if (person) {
                grouped[comp.user_id] = {
                    person,
                    competencies: [],
                };
            }
        }
        if (grouped[comp.user_id]) {
            grouped[comp.user_id].competencies.push(comp);
        }
    });

    return grouped;
}

/**
 * ExpiringView component
 */
export function ExpiringView({ expiringCompetencies, personnel }: ExpiringViewProps) {
    const groupedByPerson = groupByPerson(expiringCompetencies, personnel);
    const hasExpiring = Object.keys(groupedByPerson).length > 0;

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                    Expiring Certifications
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                    Certifications expiring within the next 30 days
                </p>
            </div>

            {/* Content */}
            {!hasExpiring ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                    <CheckIcon />
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
                        No certifications expiring in the next 30 days
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.values(groupedByPerson).map(({ person, competencies }) => (
                        <div key={person.id} className="glass-card" style={{ padding: '20px' }}>
                            {/* Person Header */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'start',
                                    marginBottom: '16px',
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            color: '#ffffff',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        {person.username}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        {person.email} • {person.organizations?.name}
                                    </div>
                                </div>
                                <span className="glass-badge badge-red">{competencies.length} expiring</span>
                            </div>

                            {/* Expiring Competencies List */}
                            <div className="space-y-2">
                                {competencies.map((comp) => {
                                    const daysUntilExpiry = getDaysUntilExpiry(comp.expiry_date);
                                    const isUrgent = daysUntilExpiry <= 7;

                                    return (
                                        <div
                                            key={comp.id}
                                            className="glass-item"
                                            style={{
                                                padding: '12px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div
                                                    style={{
                                                        fontWeight: '500',
                                                        color: '#ffffff',
                                                        marginBottom: '4px',
                                                    }}
                                                >
                                                    {comp.competency_name}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: '13px',
                                                        color: isUrgent ? '#ef4444' : '#f59e0b',
                                                    }}
                                                >
                                                    Expires: {new Date(comp.expiry_date).toLocaleDateString()} (
                                                    {daysUntilExpiry} days)
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

export default ExpiringView;
