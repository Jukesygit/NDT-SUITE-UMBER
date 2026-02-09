/**
 * Security Helper Utilities for Services
 * Provides error sanitization and input validation for service layer
 */

import { sanitizeString } from './validation.js';

/**
 * Generic error messages by operation type
 * Used to prevent leaking database schema details to clients
 */
const GENERIC_ERROR_MESSAGES = {
    fetch: 'Failed to load data',
    create: 'Failed to create record',
    update: 'Failed to update record',
    delete: 'Failed to delete record',
    upload: 'Failed to upload file',
    verify: 'Failed to verify record',
    auth: 'Authentication failed',
    permission: 'Permission denied'
};

/**
 * Sanitize database errors to prevent information leakage
 * Logs the full error for debugging while returning a generic message to client
 *
 * @param {Error} error - Original error from database
 * @param {string} serviceName - Name of the service (for logging)
 * @param {string} operation - Operation type (fetch, create, update, delete, etc.)
 * @returns {Error} Sanitized error safe to return to client
 */
export function sanitizeDbError(error, serviceName, operation) {
    // Return generic message to client
    const genericMessage = GENERIC_ERROR_MESSAGES[operation] || 'An error occurred';
    return new Error(genericMessage);
}

/**
 * Wrap a service function to automatically sanitize errors
 *
 * @param {Function} fn - Service function to wrap
 * @param {string} serviceName - Name of the service
 * @param {string} operation - Operation type
 * @returns {Function} Wrapped function with error sanitization
 */
export function withErrorSanitization(fn, serviceName, operation) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw sanitizeDbError(error, serviceName, operation);
        }
    };
}

/**
 * Sanitize user input for service operations
 *
 * @param {object} data - Object containing user input
 * @param {object} fieldConfig - Configuration for each field
 * @returns {object} Sanitized data
 *
 * @example
 * sanitizeServiceInput(data, {
 *   name: { maxLength: 100 },
 *   description: { maxLength: 500 },
 *   notes: { maxLength: 2000 }
 * });
 */
export function sanitizeServiceInput(data, fieldConfig) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sanitized = { ...data };

    for (const [field, config] of Object.entries(fieldConfig)) {
        if (sanitized[field] !== undefined && sanitized[field] !== null) {
            if (typeof sanitized[field] === 'string') {
                sanitized[field] = sanitizeString(sanitized[field], {
                    encodeHtml: config.encodeHtml ?? false,
                    maxLength: config.maxLength || 1000
                });
            }
        }
    }

    return sanitized;
}

/**
 * Validate UUID format
 *
 * @param {string} id - ID to validate
 * @param {string} fieldName - Name of field for error message
 * @throws {Error} If ID is not a valid UUID
 */
export function validateUUID(id, fieldName = 'ID') {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!id || typeof id !== 'string') {
        throw new Error(`${fieldName} is required`);
    }

    if (!UUID_REGEX.test(id)) {
        throw new Error(`Invalid ${fieldName} format`);
    }
}

/**
 * Validate that a value is one of allowed values
 *
 * @param {*} value - Value to check
 * @param {Array} allowedValues - Array of allowed values
 * @param {string} fieldName - Name of field for error message
 * @throws {Error} If value is not in allowed list
 */
export function validateEnum(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
        throw new Error(`Invalid ${fieldName}. Allowed values: ${allowedValues.join(', ')}`);
    }
}

export default {
    sanitizeDbError,
    withErrorSanitization,
    sanitizeServiceInput,
    validateUUID,
    validateEnum
};
