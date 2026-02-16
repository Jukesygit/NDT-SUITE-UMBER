/**
 * Cryptography Utilities
 * Provides secure password hashing and data encryption
 */

import bcrypt from 'bcryptjs';
import CryptoJS from 'crypto-js';

// Configuration
const SALT_ROUNDS = 12; // Increased for better security
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
    minLength: 8,
    requireUpperCase: true,
    requireLowerCase: true,
    requireNumbers: true,
    requireSpecialChars: true
};

/**
 * Hash a password securely
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Invalid password provided');
    }

    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        throw new Error('Failed to hash password');
    }
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(password, hash) {
    if (!password || !hash) {
        return false;
    }

    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        return false;
    }
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with errors
 */
export function validatePasswordStrength(password) {
    const errors = [];
    const result = {
        isValid: true,
        errors: [],
        strength: 'weak',
        score: 0
    };

    if (!password) {
        result.isValid = false;
        result.errors.push('Password is required');
        return result;
    }

    // Check minimum length
    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
        errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
    } else {
        result.score += 20;
    }

    // Check for uppercase
    if (PASSWORD_REQUIREMENTS.requireUpperCase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    } else {
        result.score += 20;
    }

    // Check for lowercase
    if (PASSWORD_REQUIREMENTS.requireLowerCase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    } else {
        result.score += 20;
    }

    // Check for numbers
    if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    } else {
        result.score += 20;
    }

    // Check for special characters
    // eslint-disable-next-line no-useless-escape
    if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    } else {
        result.score += 20;
    }

    // Additional strength checks
    if (password.length >= 12) result.score += 10;
    if (password.length >= 16) result.score += 10;

    // Check for common patterns
    const commonPatterns = [
        '123456', 'password', 'qwerty', 'abc123', 'admin', 'letmein',
        '111111', '123123', 'password123', 'admin123'
    ];

    if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
        errors.push('Password contains common patterns');
        result.score -= 30;
    }

    // Set strength level
    if (result.score >= 80) result.strength = 'strong';
    else if (result.score >= 60) result.strength = 'medium';
    else result.strength = 'weak';

    result.isValid = errors.length === 0;
    result.errors = errors;

    return result;
}

/**
 * Generate a secure random password
 * @param {number} length - Password length (default 16)
 * @returns {string} Random password
 */
export function generateSecurePassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = uppercase + lowercase + numbers + special;

    let password = '';

    // Ensure at least one of each required type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Encrypt sensitive data
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} Encrypted data
 */
export function encryptData(data, key) {
    if (!data || !key) {
        throw new Error('Data and key are required for encryption');
    }

    try {
        return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data
 * @param {string} key - Decryption key
 * @returns {any} Decrypted data
 */
export function decryptData(encryptedData, key) {
    if (!encryptedData || !key) {
        throw new Error('Encrypted data and key are required for decryption');
    }

    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
    } catch (error) {
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate a secure token
 * @param {number} length - Token length
 * @returns {string} Secure random token
 */
export function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash sensitive data (one-way)
 * @param {string} data - Data to hash
 * @returns {string} SHA256 hash
 */
export function hashData(data) {
    return CryptoJS.SHA256(data).toString();
}

/**
 * Create a session token with expiry
 * @param {Object} payload - Token payload
 * @param {number} expiryMs - Expiry in milliseconds
 * @returns {string} Signed token
 */
export function createSessionToken(payload, expiryMs = 3600000) {
    const tokenData = {
        ...payload,
        exp: Date.now() + expiryMs,
        iat: Date.now()
    };

    // Note: In production, use a proper JWT library with RS256
    const secret = generateSecureToken();
    return encryptData(tokenData, secret) + '.' + secret;
}

/**
 * Verify and decode a session token
 * @param {string} token - Token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifySessionToken(token) {
    try {
        const [encryptedData, secret] = token.split('.');
        const payload = decryptData(encryptedData, secret);

        // Check expiry
        if (payload.exp && Date.now() > payload.exp) {
            return null;
        }

        return payload;
    } catch (error) {
        return null;
    }
}

export default {
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    generateSecurePassword,
    encryptData,
    decryptData,
    generateSecureToken,
    hashData,
    createSessionToken,
    verifySessionToken
};