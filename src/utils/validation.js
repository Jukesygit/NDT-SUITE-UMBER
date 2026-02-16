/**
 * Input Validation and Sanitization Utilities
 * Prevents injection attacks and validates user inputs
 */

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Username validation regex (alphanumeric, underscore, dash, 3-20 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SQL injection patterns to detect
const SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT)\b)/gi,
    /(--|#|\/\*|\*\/|;|\||&&|\|\|)/g,
    /('|(')|"|(")|(\\x27)|(\\x22))/g
];

// XSS patterns to detect
const XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /javascript:/gi,
    /<iframe/gi,
    /<embed/gi,
    /<object/gi
];

/**
 * Sanitize string input
 * @param {string} input - Input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
        return '';
    }

    let sanitized = input.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // HTML encode if needed
    if (options.encodeHtml !== false) {
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    // Remove control characters
    if (options.removeControlChars !== false) {
        // eslint-disable-next-line no-control-regex
        sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    }

    // Limit length
    if (options.maxLength) {
        sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {Object} Validation result
 */
export function validateEmail(email) {
    const result = {
        isValid: false,
        error: null,
        sanitized: null
    };

    if (!email) {
        result.error = 'Email is required';
        return result;
    }

    const sanitized = sanitizeString(email, { encodeHtml: false }).toLowerCase();

    if (!EMAIL_REGEX.test(sanitized)) {
        result.error = 'Invalid email format';
        return result;
    }

    // Check for disposable email domains (basic list)
    const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com'];
    const domain = sanitized.split('@')[1];
    if (disposableDomains.includes(domain)) {
        result.error = 'Disposable email addresses are not allowed';
        return result;
    }

    result.isValid = true;
    result.sanitized = sanitized;
    return result;
}

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} Validation result
 */
export function validateUsername(username) {
    const result = {
        isValid: false,
        error: null,
        sanitized: null
    };

    if (!username) {
        result.error = 'Username is required';
        return result;
    }

    const sanitized = sanitizeString(username, { encodeHtml: false });

    if (sanitized.length < 3) {
        result.error = 'Username must be at least 3 characters';
        return result;
    }

    if (sanitized.length > 20) {
        result.error = 'Username must be less than 20 characters';
        return result;
    }

    if (!USERNAME_REGEX.test(sanitized)) {
        result.error = 'Username can only contain letters, numbers, underscores, and dashes';
        return result;
    }

    // Check for reserved usernames
    const reserved = ['admin', 'root', 'system', 'administrator', 'moderator', 'test'];
    if (reserved.includes(sanitized.toLowerCase())) {
        result.error = 'This username is reserved';
        return result;
    }

    result.isValid = true;
    result.sanitized = sanitized;
    return result;
}

/**
 * Validate UUID
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid UUID
 */
export function validateUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') {
        return false;
    }
    return UUID_REGEX.test(uuid);
}

/**
 * Check for SQL injection attempts
 * @param {string} input - Input to check
 * @returns {boolean} True if potential SQL injection detected
 */
export function detectSQLInjection(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            return true;
        }
    }

    return false;
}

/**
 * Check for XSS attempts
 * @param {string} input - Input to check
 * @returns {boolean} True if potential XSS detected
 */
export function detectXSS(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    for (const pattern of XSS_PATTERNS) {
        if (pattern.test(input)) {
            return true;
        }
    }

    return false;
}

/**
 * Validate and sanitize object properties
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result with sanitized data
 */
export function validateObject(obj, schema) {
    const result = {
        isValid: true,
        errors: {},
        sanitized: {}
    };

    for (const [key, rules] of Object.entries(schema)) {
        const value = obj[key];

        // Check required
        if (rules.required && (value === undefined || value === null || value === '')) {
            result.isValid = false;
            result.errors[key] = `${key} is required`;
            continue;
        }

        // Skip optional empty values
        if (!rules.required && (value === undefined || value === null || value === '')) {
            continue;
        }

        // Type validation
        if (rules.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== rules.type) {
                result.isValid = false;
                result.errors[key] = `${key} must be a ${rules.type}`;
                continue;
            }
        }

        // String validation
        if (rules.type === 'string') {
            // Check for injection attacks
            if (detectSQLInjection(value) || detectXSS(value)) {
                result.isValid = false;
                result.errors[key] = `${key} contains invalid characters`;
                continue;
            }

            // Sanitize
            result.sanitized[key] = sanitizeString(value, rules.sanitizeOptions || {});

            // Min/max length
            if (rules.minLength && value.length < rules.minLength) {
                result.isValid = false;
                result.errors[key] = `${key} must be at least ${rules.minLength} characters`;
            }
            if (rules.maxLength && value.length > rules.maxLength) {
                result.isValid = false;
                result.errors[key] = `${key} must be less than ${rules.maxLength} characters`;
            }

            // Pattern matching
            if (rules.pattern && !rules.pattern.test(value)) {
                result.isValid = false;
                result.errors[key] = rules.patternError || `${key} format is invalid`;
            }
        }

        // Number validation
        if (rules.type === 'number') {
            const num = Number(value);
            if (isNaN(num)) {
                result.isValid = false;
                result.errors[key] = `${key} must be a number`;
                continue;
            }

            result.sanitized[key] = num;

            if (rules.min !== undefined && num < rules.min) {
                result.isValid = false;
                result.errors[key] = `${key} must be at least ${rules.min}`;
            }
            if (rules.max !== undefined && num > rules.max) {
                result.isValid = false;
                result.errors[key] = `${key} must be at most ${rules.max}`;
            }
        }

        // Array validation
        if (rules.type === 'array') {
            if (!Array.isArray(value)) {
                result.isValid = false;
                result.errors[key] = `${key} must be an array`;
                continue;
            }

            result.sanitized[key] = value;

            if (rules.minItems && value.length < rules.minItems) {
                result.isValid = false;
                result.errors[key] = `${key} must have at least ${rules.minItems} items`;
            }
            if (rules.maxItems && value.length > rules.maxItems) {
                result.isValid = false;
                result.errors[key] = `${key} must have at most ${rules.maxItems} items`;
            }
        }

        // Custom validation
        if (rules.custom && typeof rules.custom === 'function') {
            const customResult = rules.custom(value);
            if (!customResult.isValid) {
                result.isValid = false;
                result.errors[key] = customResult.error;
            } else if (customResult.sanitized !== undefined) {
                result.sanitized[key] = customResult.sanitized;
            }
        }

        // If no sanitization happened yet, keep original value
        if (result.sanitized[key] === undefined && result.isValid) {
            result.sanitized[key] = value;
        }
    }

    return result;
}

/**
 * Validate file upload
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateFileUpload(file, options = {}) {
    const result = {
        isValid: true,
        error: null
    };

    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = [],
        allowedExtensions = []
    } = options;

    if (!file) {
        result.isValid = false;
        result.error = 'No file provided';
        return result;
    }

    // Check file size
    if (file.size > maxSize) {
        result.isValid = false;
        result.error = `File size exceeds ${maxSize / 1024 / 1024}MB limit`;
        return result;
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        result.isValid = false;
        result.error = `File type ${file.type} is not allowed`;
        return result;
    }

    // Check file extension
    if (allowedExtensions.length > 0) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !allowedExtensions.includes(extension)) {
            result.isValid = false;
            result.error = `File extension .${extension} is not allowed`;
            return result;
        }
    }

    // Check for potentially dangerous filenames
    const dangerousPatterns = [
        /\.exe$/i, /\.dll$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i,
        /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.com$/i, /\.pif$/i
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(file.name)) {
            result.isValid = false;
            result.error = 'Potentially dangerous file type';
            return result;
        }
    }

    return result;
}

export default {
    sanitizeString,
    validateEmail,
    validateUsername,
    validateUUID,
    detectSQLInjection,
    detectXSS,
    validateObject,
    validateFileUpload
};