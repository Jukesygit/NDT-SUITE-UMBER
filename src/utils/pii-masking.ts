/**
 * PII Masking Utilities
 * Masks personally identifiable information for display, with reveal-on-demand.
 * GDPR Article 5(1)(c) - data minimisation.
 */

/** Masks a phone number, showing only the last 4 digits: ••••1234 */
export function maskPhone(value: string | null | undefined): string {
    if (!value || value === '-') return '-';
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '••••';
    return '••••' + digits.slice(-4);
}

/** Masks a date of birth, showing only the year: ••/••/1990 */
export function maskDateOfBirth(value: string | null | undefined): string {
    if (!value || value === '-') return '-';
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return '••/••/••••';
        return `••/••/${date.getFullYear()}`;
    } catch {
        return '••/••/••••';
    }
}

/** Masks an address, attempting to show only the postcode (last word) */
export function maskAddress(value: string | null | undefined): string {
    if (!value || value === '-') return '-';
    const parts = value.trim().split(/\s+/);
    if (parts.length <= 1) return '••••';
    // UK postcodes are typically the last 1-2 parts (e.g., "SW1A 1AA")
    const postcode = parts.length >= 2 ? parts.slice(-2).join(' ') : parts[parts.length - 1];
    return '•••• ' + postcode;
}

/** Masks a name completely */
export function maskName(value: string | null | undefined): string {
    if (!value || value === '-') return '-';
    return '••••••';
}
