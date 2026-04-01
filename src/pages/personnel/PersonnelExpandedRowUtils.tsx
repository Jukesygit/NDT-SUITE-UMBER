/**
 * Shared icons, utilities, and small display components
 * used by PersonnelExpandedRow sub-components.
 */

import { useState } from 'react';
import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { logActivity } from '../../services/activity-log-service';
// @ts-ignore - JS module without types
import authManager from '../../auth-manager.js';

/**
 * User icon
 */
export function UserIcon() {
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
export function CertIcon() {
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
export function EditIcon({ size = 14 }: { size?: number }) {
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
 * Witness check icon (displayed when witnessed)
 */
export function WitnessIcon() {
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
 * Witness check button icon - clipboard with checkmark
 * Green when witnessed, muted when not witnessed
 */
export function WitnessCheckButtonIcon({ witnessed }: { witnessed: boolean }) {
    return (
        <svg
            style={{
                width: '14px',
                height: '14px',
                color: witnessed ? '#10b981' : 'rgba(255, 255, 255, 0.5)',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
        </svg>
    );
}

/**
 * Document icon
 */
export function DocumentIcon() {
    return (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

/**
 * Get document type from URL
 */
export function getDocumentType(url?: string): 'image' | 'pdf' | 'other' {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) return 'image';
    if (lower.match(/\.pdf(\?|$)/i)) return 'pdf';
    return 'other';
}

/**
 * Format date for display
 */
export function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Get status color and label for a competency
 */
export function getCompetencyStatus(comp: PersonCompetency): { color: string; bgColor: string; label: string; cssClass: string } {
    const isExpired =
        comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date());
    const isExpiringSoon =
        comp.expiry_date &&
        !isExpired &&
        Math.ceil((new Date(comp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 30;

    if (isExpired) {
        return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.3)', label: 'Expired', cssClass: 'expired' };
    }
    if (isExpiringSoon) {
        return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.3)', label: 'Expiring', cssClass: 'expiring' };
    }
    if (comp.status === 'pending_approval') {
        return { color: 'rgba(253, 224, 71, 1)', bgColor: 'rgba(251, 191, 36, 0.2)', label: 'Pending', cssClass: 'pending_approval' };
    }
    return { color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.3)', label: 'Active', cssClass: 'active' };
}

/**
 * Group competencies by category
 */
export function groupByCategory(competencies: PersonCompetency[]): Record<string, PersonCompetency[]> {
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
export function DisplayField({ label, value }: { label: string; value: string }) {
    return (
        <div className="pm-display-field">
            <div className="pm-display-label">{label}</div>
            <div className={`pm-display-value${!value || value === '-' ? ' muted' : ''}`}>{value || '-'}</div>
        </div>
    );
}

/**
 * Masked PII field - shows masked value with reveal button.
 * Logs PII reveal to activity log for GDPR compliance.
 */
export function MaskedField({
    label,
    value,
    maskedValue,
    personId,
    personName,
}: {
    label: string;
    value: string;
    maskedValue: string;
    personId: string;
    personName: string;
}) {
    const [revealed, setRevealed] = useState(false);

    const handleReveal = () => {
        if (revealed) {
            setRevealed(false);
            return;
        }
        setRevealed(true);
        const currentUser = authManager.getCurrentUser();
        logActivity({
            userId: currentUser?.id,
            actionType: 'pii_revealed',
            actionCategory: 'admin',
            description: `Revealed "${label}" for ${personName}`,
            details: { field: label },
            entityType: 'profile',
            entityId: personId,
            entityName: personName,
        });
    };

    const displayValue = !value || value === '-' ? '-' : (revealed ? value : maskedValue);
    const canReveal = value && value !== '-';

    return (
        <div className="pm-display-field">
            <div className="pm-display-label">{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className={`pm-display-value${!value || value === '-' ? ' muted' : ''}`}>
                    {displayValue}
                </div>
                {canReveal && (
                    <button
                        onClick={handleReveal}
                        style={{
                            background: 'none',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary, #9ca3af)',
                            fontSize: '11px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                        title={revealed ? 'Hide value' : 'Reveal value (logged for audit)'}
                    >
                        {revealed ? 'Hide' : 'Reveal'}
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * PersonEditData interface - shared across components
 */
export interface PersonEditData {
    username: string;
    email: string;
    role: string;
    organization_id: string;
    // Personal details
    mobile_number: string;
    home_address: string;
    nearest_uk_train_station: string;
    date_of_birth: string;
    next_of_kin: string;
    next_of_kin_emergency_contact_number: string;
    vantage_number: string;
}
