/**
 * Shared password validation for Supabase Edge Functions
 * SECURITY: Enforces consistent password policy across all functions
 */

export interface PasswordValidationResult {
    valid: boolean;
    error?: string;
}

// Password policy configuration (must match src/config/security.js)
const PASSWORD_POLICY = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

// Common passwords to reject
const COMMON_PASSWORDS = new Set([
    'password123!',
    'Password123!',
    'Admin123!@#',
    'Welcome123!',
    'Qwerty123!@',
    'Letmein123!',
    'Changeme123!',
]);

/**
 * Validate password against security policy
 */
export function validatePassword(password: string, userInfo?: { email?: string; username?: string }): PasswordValidationResult {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    // Check minimum length
    if (password.length < PASSWORD_POLICY.minLength) {
        return {
            valid: false,
            error: `Password must be at least ${PASSWORD_POLICY.minLength} characters`,
        };
    }

    // Check for uppercase letters
    if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one uppercase letter',
        };
    }

    // Check for lowercase letters
    if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one lowercase letter',
        };
    }

    // Check for numbers
    if (PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least one number',
        };
    }

    // Check for special characters
    if (PASSWORD_POLICY.requireSpecialChars) {
        const specialCharPattern = new RegExp(`[${PASSWORD_POLICY.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
        if (!specialCharPattern.test(password)) {
            return {
                valid: false,
                error: 'Password must contain at least one special character (!@#$%^&*)',
            };
        }
    }

    // Check against common passwords
    if (COMMON_PASSWORDS.has(password)) {
        return {
            valid: false,
            error: 'Password is too common. Please choose a more unique password.',
        };
    }

    // Check if password contains user info
    if (userInfo) {
        const lowerPassword = password.toLowerCase();

        if (userInfo.email) {
            const emailPart = userInfo.email.split('@')[0].toLowerCase();
            if (emailPart.length >= 3 && lowerPassword.includes(emailPart)) {
                return {
                    valid: false,
                    error: 'Password cannot contain your email address',
                };
            }
        }

        if (userInfo.username) {
            const lowerUsername = userInfo.username.toLowerCase();
            if (lowerUsername.length >= 3 && lowerPassword.includes(lowerUsername)) {
                return {
                    valid: false,
                    error: 'Password cannot contain your username',
                };
            }
        }
    }

    return { valid: true };
}
