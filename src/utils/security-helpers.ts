/**
 * Security Helper Utilities for Services
 * Provides error sanitization and input validation for service layer
 */

import { sanitizeString } from './validation';

/**
 * Generic error messages by operation type
 * Used to prevent leaking database schema details to clients
 */
const GENERIC_ERROR_MESSAGES: Record<string, string> = {
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
 */
export function sanitizeDbError(error: Error, serviceName: string, operation: string): Error {
    // Return generic message to client
    const genericMessage = GENERIC_ERROR_MESSAGES[operation] || 'An error occurred';
    return new Error(genericMessage);
}

/**
 * Wrap a service function to automatically sanitize errors
 */
export function withErrorSanitization<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    serviceName: string,
    operation: string
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        try {
            return await fn(...args) as ReturnType<T>;
        } catch (error) {
            throw sanitizeDbError(error as Error, serviceName, operation);
        }
    };
}

interface FieldConfig {
    encodeHtml?: boolean;
    maxLength?: number;
}

/**
 * Sanitize user input for service operations
 */
export function sanitizeServiceInput(
    data: Record<string, unknown> | null | undefined,
    fieldConfig: Record<string, FieldConfig>
): Record<string, unknown> | null | undefined {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sanitized = { ...data };

    for (const [field, config] of Object.entries(fieldConfig)) {
        if (sanitized[field] !== undefined && sanitized[field] !== null) {
            if (typeof sanitized[field] === 'string') {
                sanitized[field] = sanitizeString(sanitized[field] as string, {
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
 */
export function validateUUID(id: string, fieldName = 'ID'): void {
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
 */
export function validateEnum(value: unknown, allowedValues: unknown[], fieldName: string): void {
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
