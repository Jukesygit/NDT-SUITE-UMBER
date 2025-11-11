// @ts-nocheck - Component extracted from large page, uses JS imports that lack TypeScript definitions
import React from 'react';
import type { PersonnelWithCompetencies } from '../../types/index.js';

/**
 * Expiring competency item structure
 */
interface ExpiringCompetency {
    id: string;
    user_id: string;
    competency_name: string;
    expiry_date: string;
}

/**
 * ExpiringView component props
 */
interface ExpiringViewProps {
    expiringCompetencies: ExpiringCompetency[];
    personnel: PersonnelWithCompetencies[];
}

/**
 * Expiring View Component
 *
 * Displays certifications expiring within 30 days:
 * - Grouped by person for easy review
 * - Color-coded urgency (≤7 days highlighted)
 * - Days until expiry countdown
 * - Person contact information
 *
 * Helps admins proactively manage renewals and
 * ensure compliance before certifications lapse.
 */
export function ExpiringView({
    expiringCompetencies,
    personnel
}: ExpiringViewProps) {
    const groupedByPerson: { [key: string]: { person: PersonnelWithCompetencies; competencies: ExpiringCompetency[] } } = {};

    expiringCompetencies.forEach(comp => {
        if (!groupedByPerson[comp.user_id]) {
            const person = personnel.find(p => p.id === comp.user_id);
            if (!person) return; // Skip if person not found

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
                                    const daysUntilExpiry = Math.ceil((new Date(comp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
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

export default ExpiringView;
