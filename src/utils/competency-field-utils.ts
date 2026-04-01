/**
 * Utility functions for competency field rendering
 * Determines appropriate input types based on field names and types
 */

interface CompetencyDefinition {
    name?: string;
    field_type?: string;
    category?: {
        name?: string;
    };
    competency?: {
        name?: string;
        field_type?: string;
        category?: {
            name?: string;
        };
    };
    witness_checked?: boolean;
}

/**
 * Get the appropriate input type for a competency field
 */
export function getInputType(fieldName: string, fieldType: string): string {
    const lowerFieldName = fieldName?.toLowerCase() || '';

    // Handle specific field types first
    if (fieldType === 'date' || fieldType === 'expiry_date') {
        return 'date';
    }

    if (fieldType === 'boolean') {
        return 'checkbox';
    }

    if (fieldType === 'number') {
        return 'number';
    }

    // Handle specific field names for text types
    if (lowerFieldName.includes('email')) {
        return 'email';
    }

    if (lowerFieldName.includes('mobile') || lowerFieldName.includes('phone') || lowerFieldName.includes('contact number')) {
        return 'tel';
    }

    if (lowerFieldName.includes('date') && !lowerFieldName.includes('expiry')) {
        return 'date';
    }

    // Default to text
    return 'text';
}

/**
 * Get placeholder text for a field
 */
export function getPlaceholder(fieldName: string, inputType: string): string {
    const lowerFieldName = fieldName?.toLowerCase() || '';

    if (inputType === 'email') {
        return 'example@company.com';
    }

    if (inputType === 'tel') {
        return '+44 7700 900000';
    }

    if (inputType === 'date') {
        return 'YYYY-MM-DD or use date picker';
    }

    if (lowerFieldName.includes('address')) {
        return 'Street, City, Postcode';
    }

    if (lowerFieldName.includes('next of kin')) {
        return 'Full name of emergency contact';
    }

    if (lowerFieldName.includes('issuing body')) {
        return 'e.g., ASME, API, BINDT';
    }

    if (lowerFieldName.includes('id') || lowerFieldName.includes('number') || lowerFieldName.includes('no')) {
        return 'Enter ID or certificate number';
    }

    return 'Enter value';
}

/**
 * Check if a field should show certification-specific inputs (issuing body, ID, expiry)
 */
export function shouldShowCertificationFields(competency: CompetencyDefinition | null): boolean {
    if (!competency) return false;

    const fieldType = competency.field_type;
    const fieldName = competency.name?.toLowerCase() || '';
    const categoryName = competency.category?.name?.toLowerCase() || '';

    // Don't show certification fields for Personal Details category
    if (categoryName.includes('personal details')) {
        return false;
    }

    // Show certification fields for expiry_date types in certification categories
    if (fieldType === 'expiry_date') {
        // These categories typically contain certifications
        const certificationCategories = [
            'ndt certifications',
            'mandatory offshore training',
            'rope access',
            'plant, api and visual qualifications',
            'uav operations',
            'gwo training',
            'professional registration',
            'induction'
        ];

        return certificationCategories.some(cat => categoryName.includes(cat.toLowerCase()));
    }

    // Also check field name for common certification patterns
    if (fieldName.includes('certification') ||
        fieldName.includes('certificate') ||
        fieldName.includes('licence') ||
        fieldName.includes('license')) {
        return true;
    }

    return false;
}

/**
 * Check if a field should show issued/expiry date fields
 * Personal details like DOB, email, phone, address should NOT show these
 */
export function shouldShowDateFields(competency: CompetencyDefinition | null): boolean {
    if (!competency) return false;

    const categoryName = competency.category?.name?.toLowerCase() || '';
    const fieldName = competency.name?.toLowerCase() || '';

    // Personal details don't have issued/expiry dates
    if (categoryName.includes('personal details')) {
        return false;
    }

    // These specific fields don't have issued/expiry dates
    const excludedFields = [
        'date of birth',
        'mobile number',
        'email address',
        'home address',
        'nearest uk train station',
        'next of kin',
        'emergency contact',
        'phone',
        'address',
        'postcode',
        'pension information',
        'vantage no'
    ];

    if (excludedFields.some(excluded => fieldName.includes(excluded))) {
        return false;
    }

    return true;
}

/**
 * Check if a competency is a personal detail (not a certification/qualification)
 */
export function isPersonalDetail(competency: CompetencyDefinition | null): boolean {
    if (!competency) return false;

    // Check category name
    const categoryName = competency.category?.name?.toLowerCase() ||
                        competency.competency?.category?.name?.toLowerCase() || '';

    if (categoryName.includes('personal details')) {
        return true;
    }

    // Check field name for common personal detail patterns
    const fieldName = competency.name?.toLowerCase() ||
                     competency.competency?.name?.toLowerCase() || '';

    const personalDetailPatterns = [
        'date of birth',
        'dob',
        'mobile number',
        'email address',
        'home address',
        'nearest uk train station',
        'next of kin',
        'emergency contact',
        'phone number',
        'contact number',
        'postcode',
        'postal code',
        'pension information',
        'vantage no',
        'national insurance',
        'ni number',
        'employee id',
        'employee number',
        'payroll',
        'address line'
    ];

    return personalDetailPatterns.some(pattern => fieldName.includes(pattern));
}

/**
 * Filter out personal details from a list of competencies
 */
export function filterOutPersonalDetails(competencies: CompetencyDefinition[]): CompetencyDefinition[] {
    if (!Array.isArray(competencies)) return [];
    return competencies.filter(comp => !isPersonalDetail(comp));
}

/**
 * Get only personal details from a list of competencies
 */
export function getPersonalDetails(competencies: CompetencyDefinition[]): CompetencyDefinition[] {
    if (!Array.isArray(competencies)) return [];
    return competencies.filter(comp => isPersonalDetail(comp));
}

/**
 * Format a value for display based on field type
 */
export function formatValue(value: unknown, fieldType: string): string {
    if (!value) return '-';

    if (fieldType === 'boolean') {
        return value === true || value === 'true' || value === 'yes' ? 'Yes' : 'No';
    }

    if (fieldType === 'date' || fieldType === 'expiry_date') {
        try {
            return new Date(value as string).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            return String(value);
        }
    }

    return String(value);
}

/**
 * Check if a competency is an NDT certification
 */
export function isNDTCertification(competency: CompetencyDefinition | null): boolean {
    if (!competency) return false;

    // Check category name
    const categoryName = competency.category?.name?.toLowerCase() ||
                        competency.competency?.category?.name?.toLowerCase() || '';

    if (categoryName === 'ndt certifications') {
        return true;
    }

    // Check field name for NDT patterns as backup
    const fieldName = competency.name?.toLowerCase() ||
                     competency.competency?.name?.toLowerCase() || '';

    const ndtPatterns = [
        'en 9712',
        'pcn',
        'paut',
        'tofd',
        'mut',
        'rad',
        'eci',
        'mpi',
        'lpi',
        'vis',
        'basic radiation safety',
        'pec l2'
    ];

    return ndtPatterns.some(pattern => fieldName.includes(pattern));
}

/**
 * Check if an NDT competency requires a witness check
 * Some NDT fields like "PCN Number" are informational and don't need witness checks
 */
export function requiresWitnessCheck(competency: CompetencyDefinition | null): boolean {
    if (!isNDTCertification(competency)) {
        return false;
    }

    const fieldName = competency!.name?.toLowerCase() ||
                     competency!.competency?.name?.toLowerCase() || '';

    // These NDT fields don't require witness checks (they're informational)
    const excludedFields = [
        'pcn number',
        'pcn no',
        'certificate number'
    ];

    if (excludedFields.some(excluded => fieldName === excluded)) {
        return false;
    }

    // If it's an expiry_date type NDT cert, it needs a witness check
    const fieldType = competency!.field_type || competency!.competency?.field_type;
    if (fieldType === 'expiry_date') {
        return true;
    }

    // Boolean type NDT certs may also need witness checks
    if (fieldType === 'boolean' && fieldName.includes('matrix competency')) {
        return false; // These are the old boolean witness fields, skip them
    }

    return true;
}

/**
 * Get witness check status summary for a list of competencies
 */
export function getWitnessCheckSummary(competencies: CompetencyDefinition[]): { total: number; witnessed: number; percentage: number } {
    if (!Array.isArray(competencies)) {
        return { total: 0, witnessed: 0, percentage: 0 };
    }

    const ndtCerts = competencies.filter(comp => requiresWitnessCheck(comp));
    const witnessed = ndtCerts.filter(comp => comp.witness_checked === true).length;

    return {
        total: ndtCerts.length,
        witnessed: witnessed,
        percentage: ndtCerts.length > 0 ? Math.round((witnessed / ndtCerts.length) * 100) : 0
    };
}
