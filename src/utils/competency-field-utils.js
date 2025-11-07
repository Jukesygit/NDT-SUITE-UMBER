/**
 * Utility functions for competency field rendering
 * Determines appropriate input types based on field names and types
 */

/**
 * Get the appropriate input type for a competency field
 * @param {string} fieldName - The name of the field
 * @param {string} fieldType - The field type from the database (text, date, expiry_date, boolean, etc.)
 * @returns {string} - HTML input type (text, email, tel, date, etc.)
 */
export function getInputType(fieldName, fieldType) {
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
 * @param {string} fieldName - The name of the field
 * @param {string} inputType - The input type
 * @returns {string} - Placeholder text
 */
export function getPlaceholder(fieldName, inputType) {
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
 * @param {object} competency - The competency definition
 * @returns {boolean} - True if certification fields should be shown
 */
export function shouldShowCertificationFields(competency) {
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
            'onshore training',
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
 * @param {object} competency - The competency definition
 * @returns {boolean} - True if date fields should be shown
 */
export function shouldShowDateFields(competency) {
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
 * @param {object} competency - The competency definition or employee competency
 * @returns {boolean} - True if this is a personal detail
 */
export function isPersonalDetail(competency) {
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
 * @param {Array} competencies - Array of competency definitions or employee competencies
 * @returns {Array} - Filtered array without personal details
 */
export function filterOutPersonalDetails(competencies) {
    if (!Array.isArray(competencies)) return [];
    return competencies.filter(comp => !isPersonalDetail(comp));
}

/**
 * Get only personal details from a list of competencies
 * @param {Array} competencies - Array of competency definitions or employee competencies
 * @returns {Array} - Array containing only personal details
 */
export function getPersonalDetails(competencies) {
    if (!Array.isArray(competencies)) return [];
    return competencies.filter(comp => isPersonalDetail(comp));
}

/**
 * Format a value for display based on field type
 * @param {any} value - The value to format
 * @param {string} fieldType - The field type
 * @returns {string} - Formatted value
 */
export function formatValue(value, fieldType) {
    if (!value) return '-';

    if (fieldType === 'boolean') {
        return value === true || value === 'true' || value === 'yes' ? 'Yes' : 'No';
    }

    if (fieldType === 'date' || fieldType === 'expiry_date') {
        try {
            return new Date(value).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            return value;
        }
    }

    return value;
}
