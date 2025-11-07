/**
 * Security Configuration
 * Centralizes security settings and policies
 */

// Password complexity requirements
export const PASSWORD_POLICY = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventCommonPasswords: true,
    preventUserInfo: true,
    maxConsecutiveChars: 3,
    minStrengthScore: 3 // 0-4 scale
};

// Session configuration
export const SESSION_CONFIG = {
    timeout: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // Warning 5 minutes before timeout
    refreshInterval: 10 * 60 * 1000, // Refresh token every 10 minutes
    maxExtensions: 3 // Maximum times session can be extended
};

// Rate limiting configuration
export const RATE_LIMITS = {
    login: {
        attempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDurationMs: 60 * 60 * 1000 // 1 hour block after max attempts
    },
    passwordReset: {
        attempts: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
        blockDurationMs: 24 * 60 * 60 * 1000 // 24 hour block
    },
    api: {
        requestsPerMinute: 60,
        burstLimit: 10
    }
};

// Common passwords list (partial - expand this)
export const COMMON_PASSWORDS = [
    'password', 'password123', '123456', '12345678', 'qwerty', 'abc123',
    'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1',
    'qwertyuiop', 'superman', 'iloveyou', 'trustno1', '1234567',
    'sunshine', 'master', '123123', 'welcome123', 'shadow', 'ashley',
    'football', 'jesus', 'michael', 'ninja', 'mustang', 'password123'
];

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} userInfo - User information to check against
 * @returns {Object} Validation result with score and feedback
 */
export function validatePasswordStrength(password, userInfo = {}) {
    const result = {
        isValid: false,
        score: 0,
        feedback: [],
        requirements: {
            length: false,
            uppercase: false,
            lowercase: false,
            numbers: false,
            special: false,
            notCommon: false,
            noUserInfo: false,
            noConsecutive: false
        }
    };

    if (!password) {
        result.feedback.push('Password is required');
        return result;
    }

    // Check length
    if (password.length >= PASSWORD_POLICY.minLength) {
        result.requirements.length = true;
        result.score++;
    } else {
        result.feedback.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
    }

    // Check uppercase
    if (PASSWORD_POLICY.requireUppercase) {
        if (/[A-Z]/.test(password)) {
            result.requirements.uppercase = true;
            result.score++;
        } else {
            result.feedback.push('Password must contain at least one uppercase letter');
        }
    }

    // Check lowercase
    if (PASSWORD_POLICY.requireLowercase) {
        if (/[a-z]/.test(password)) {
            result.requirements.lowercase = true;
            result.score++;
        } else {
            result.feedback.push('Password must contain at least one lowercase letter');
        }
    }

    // Check numbers
    if (PASSWORD_POLICY.requireNumbers) {
        if (/\d/.test(password)) {
            result.requirements.numbers = true;
            result.score++;
        } else {
            result.feedback.push('Password must contain at least one number');
        }
    }

    // Check special characters
    if (PASSWORD_POLICY.requireSpecialChars) {
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            result.requirements.special = true;
            result.score++;
        } else {
            result.feedback.push('Password must contain at least one special character');
        }
    }

    // Check against common passwords
    if (PASSWORD_POLICY.preventCommonPasswords) {
        const lowerPassword = password.toLowerCase();
        if (!COMMON_PASSWORDS.includes(lowerPassword)) {
            result.requirements.notCommon = true;
        } else {
            result.feedback.push('This password is too common. Please choose a more unique password');
            result.score = Math.max(0, result.score - 2);
        }
    }

    // Check for user info in password
    if (PASSWORD_POLICY.preventUserInfo && userInfo) {
        const lowerPassword = password.toLowerCase();
        const userFields = [
            userInfo.username,
            userInfo.email?.split('@')[0],
            userInfo.firstName,
            userInfo.lastName
        ].filter(Boolean).map(s => s.toLowerCase());

        const containsUserInfo = userFields.some(field =>
            field && (lowerPassword.includes(field) || field.includes(lowerPassword))
        );

        if (!containsUserInfo) {
            result.requirements.noUserInfo = true;
        } else {
            result.feedback.push('Password should not contain your personal information');
            result.score = Math.max(0, result.score - 1);
        }
    }

    // Check for consecutive characters
    if (PASSWORD_POLICY.maxConsecutiveChars) {
        let hasExcessiveConsecutive = false;
        for (let i = 0; i <= password.length - PASSWORD_POLICY.maxConsecutiveChars; i++) {
            const substr = password.substring(i, i + PASSWORD_POLICY.maxConsecutiveChars);
            if (substr.split('').every((char, idx, arr) => idx === 0 || char === arr[idx - 1])) {
                hasExcessiveConsecutive = true;
                break;
            }
        }

        if (!hasExcessiveConsecutive) {
            result.requirements.noConsecutive = true;
        } else {
            result.feedback.push(`Password should not contain more than ${PASSWORD_POLICY.maxConsecutiveChars - 1} consecutive identical characters`);
            result.score = Math.max(0, result.score - 1);
        }
    }

    // Calculate final score (0-4 scale)
    result.score = Math.min(4, Math.max(0, Math.floor(result.score * 0.8)));

    // Determine if password is valid
    result.isValid = result.score >= PASSWORD_POLICY.minStrengthScore &&
                     result.requirements.length &&
                     result.requirements.uppercase &&
                     result.requirements.lowercase &&
                     result.requirements.numbers &&
                     result.requirements.special &&
                     result.requirements.notCommon;

    // Add strength indicator
    const strengthLevels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    result.strength = strengthLevels[result.score];

    return result;
}

/**
 * Generate a secure random password
 * @param {number} length - Password length
 * @returns {string} Generated password
 */
export function generateSecurePassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = uppercase + lowercase + numbers + special;
    let password = '';

    // Ensure at least one of each required character type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Hash password using Web Crypto API (for client-side hashing before sending)
 * Note: This is additional security - actual password hashing should be done server-side
 * @param {string} password - Password to hash
 * @param {string} salt - Salt for hashing
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Rate limiter class
 */
export class RateLimiter {
    constructor(config) {
        this.attempts = new Map();
        this.config = config;
    }

    /**
     * Check if action is allowed
     * @param {string} key - Unique identifier (e.g., user ID, IP)
     * @returns {Object} Result with allowed status and remaining attempts
     */
    isAllowed(key) {
        const now = Date.now();
        const record = this.attempts.get(key);

        if (!record) {
            this.attempts.set(key, {
                count: 1,
                firstAttempt: now,
                blockedUntil: null
            });
            return {
                allowed: true,
                remaining: this.config.attempts - 1,
                resetIn: this.config.windowMs
            };
        }

        // Check if blocked
        if (record.blockedUntil && now < record.blockedUntil) {
            return {
                allowed: false,
                remaining: 0,
                blockedUntil: record.blockedUntil,
                retryAfter: record.blockedUntil - now
            };
        }

        // Check if outside window
        if (now - record.firstAttempt > this.config.windowMs) {
            this.attempts.set(key, {
                count: 1,
                firstAttempt: now,
                blockedUntil: null
            });
            return {
                allowed: true,
                remaining: this.config.attempts - 1,
                resetIn: this.config.windowMs
            };
        }

        // Increment attempts
        record.count++;

        if (record.count > this.config.attempts) {
            record.blockedUntil = now + this.config.blockDurationMs;
            return {
                allowed: false,
                remaining: 0,
                blockedUntil: record.blockedUntil,
                retryAfter: this.config.blockDurationMs
            };
        }

        return {
            allowed: true,
            remaining: this.config.attempts - record.count,
            resetIn: this.config.windowMs - (now - record.firstAttempt)
        };
    }

    /**
     * Reset attempts for a key
     * @param {string} key - Unique identifier
     */
    reset(key) {
        this.attempts.delete(key);
    }

    /**
     * Clear old entries to prevent memory leak
     */
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.attempts.entries()) {
            if (record.blockedUntil && now > record.blockedUntil + this.config.windowMs) {
                this.attempts.delete(key);
            } else if (now - record.firstAttempt > this.config.windowMs * 2) {
                this.attempts.delete(key);
            }
        }
    }
}

// Create rate limiters
export const loginRateLimiter = new RateLimiter(RATE_LIMITS.login);
export const passwordResetRateLimiter = new RateLimiter(RATE_LIMITS.passwordReset);

// Cleanup old entries periodically
setInterval(() => {
    loginRateLimiter.cleanup();
    passwordResetRateLimiter.cleanup();
}, 60 * 60 * 1000); // Every hour

export default {
    PASSWORD_POLICY,
    SESSION_CONFIG,
    RATE_LIMITS,
    validatePasswordStrength,
    generateSecurePassword,
    hashPassword,
    RateLimiter,
    loginRateLimiter,
    passwordResetRateLimiter
};