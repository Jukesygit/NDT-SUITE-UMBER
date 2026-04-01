/**
 * Tests for validation utility functions.
 */
import { describe, it, expect } from 'vitest';
import {
    sanitizeString,
    validateEmail,
    validateUsername,
    validateUUID,
    detectSQLInjection,
    detectXSS,
    validateObject,
    validateFileUpload,
} from '../validation';

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------
describe('sanitizeString', () => {
    it('trims whitespace', () => {
        expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('returns empty string for non-string input', () => {
        expect(sanitizeString(null)).toBe('');
        expect(sanitizeString(undefined)).toBe('');
        expect(sanitizeString(123)).toBe('');
    });

    it('encodes HTML entities by default', () => {
        expect(sanitizeString('<script>')).toBe('&lt;script&gt;');
        expect(sanitizeString('"hello"')).toBe('&quot;hello&quot;');
    });

    it('skips HTML encoding when option is false', () => {
        expect(sanitizeString('<b>bold</b>', { encodeHtml: false })).toBe('<b>bold</b>');
    });

    it('removes null bytes', () => {
        expect(sanitizeString('hello\0world')).toBe('helloworld');
    });

    it('removes control characters', () => {
        expect(sanitizeString('hello\x01\x02world')).toBe('helloworld');
    });

    it('respects maxLength option', () => {
        expect(sanitizeString('abcdefgh', { maxLength: 5 })).toBe('abcde');
    });
});

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------
describe('validateEmail', () => {
    it('validates correct email', () => {
        const result = validateEmail('user@example.com');
        expect(result.isValid).toBe(true);
        expect(result.sanitized).toBe('user@example.com');
    });

    it('rejects empty email', () => {
        const result = validateEmail('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Email is required');
    });

    it('rejects invalid format', () => {
        const result = validateEmail('not-an-email');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid email format');
    });

    it('rejects disposable email domains', () => {
        const result = validateEmail('user@tempmail.com');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Disposable');
    });

    it('lowercases email', () => {
        const result = validateEmail('USER@EXAMPLE.COM');
        expect(result.sanitized).toBe('user@example.com');
    });
});

// ---------------------------------------------------------------------------
// validateUsername
// ---------------------------------------------------------------------------
describe('validateUsername', () => {
    it('validates correct username', () => {
        const result = validateUsername('john_doe');
        expect(result.isValid).toBe(true);
        expect(result.sanitized).toBe('john_doe');
    });

    it('rejects empty username', () => {
        const result = validateUsername('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Username is required');
    });

    it('rejects short username', () => {
        const result = validateUsername('ab');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('at least 3');
    });

    it('rejects long username', () => {
        const result = validateUsername('a'.repeat(21));
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('less than 20');
    });

    it('rejects special characters', () => {
        const result = validateUsername('user@name');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('letters, numbers');
    });

    it('rejects reserved usernames', () => {
        const result = validateUsername('admin');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('reserved');
    });

    it('allows dashes and underscores', () => {
        expect(validateUsername('user-name').isValid).toBe(true);
        expect(validateUsername('user_name').isValid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateUUID
// ---------------------------------------------------------------------------
describe('validateUUID', () => {
    it('validates correct UUID', () => {
        expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects invalid UUID', () => {
        expect(validateUUID('not-a-uuid')).toBe(false);
        expect(validateUUID('')).toBe(false);
        expect(validateUUID(null)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// detectSQLInjection
// ---------------------------------------------------------------------------
describe('detectSQLInjection', () => {
    it('detects SQL comment/semicolon patterns', () => {
        expect(detectSQLInjection("'; DROP TABLE users; --")).toBe(true);
        expect(detectSQLInjection("1; DROP TABLE--")).toBe(true);
    });

    it('returns false for normal input', () => {
        expect(detectSQLInjection('John Doe')).toBe(false);
    });

    it('handles null/undefined', () => {
        expect(detectSQLInjection(null)).toBe(false);
        expect(detectSQLInjection(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// detectXSS
// ---------------------------------------------------------------------------
describe('detectXSS', () => {
    it('detects script tags', () => {
        expect(detectXSS('<script>alert("xss")</script>')).toBe(true);
    });

    it('detects event handlers', () => {
        expect(detectXSS('onload="alert(1)"')).toBe(true);
    });

    it('detects javascript: protocol', () => {
        expect(detectXSS('javascript:alert(1)')).toBe(true);
    });

    it('detects iframe tags', () => {
        expect(detectXSS('<iframe src="evil.com">')).toBe(true);
    });

    it('returns false for safe input', () => {
        expect(detectXSS('Hello World')).toBe(false);
    });

    it('handles null/undefined', () => {
        expect(detectXSS(null)).toBe(false);
        expect(detectXSS(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateObject
// ---------------------------------------------------------------------------
describe('validateObject', () => {
    it('validates required fields', () => {
        const result = validateObject({}, { name: { required: true, type: 'string' } });
        expect(result.isValid).toBe(false);
        expect(result.errors.name).toContain('required');
    });

    it('validates string type and length', () => {
        const result = validateObject(
            { name: 'ab' },
            { name: { required: true, type: 'string', minLength: 3 } },
        );
        expect(result.isValid).toBe(false);
        expect(result.errors.name).toContain('at least 3');
    });

    it('sanitizes valid string fields', () => {
        const result = validateObject(
            { name: 'Alice' },
            { name: { required: true, type: 'string' } },
        );
        expect(result.isValid).toBe(true);
        expect(result.sanitized.name).toBe('Alice');
    });

    it('validates number type with min/max', () => {
        const result = validateObject(
            { age: 5 },
            { age: { type: 'number', min: 18 } },
        );
        expect(result.isValid).toBe(false);
        expect(result.errors.age).toContain('at least 18');
    });

    it('validates array type', () => {
        const result = validateObject(
            { tags: [] },
            { tags: { type: 'array', minItems: 1 } },
        );
        expect(result.isValid).toBe(false);
        expect(result.errors.tags).toContain('at least 1');
    });

    it('supports custom validation', () => {
        const result = validateObject(
            { code: 'ABC' },
            {
                code: {
                    type: 'string',
                    custom: (val) => val === 'ABC'
                        ? { isValid: true }
                        : { isValid: false, error: 'must be ABC' },
                },
            },
        );
        expect(result.isValid).toBe(true);
    });

    it('skips optional empty values', () => {
        const result = validateObject(
            { notes: '' },
            { notes: { required: false, type: 'string' } },
        );
        expect(result.isValid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateFileUpload
// ---------------------------------------------------------------------------
describe('validateFileUpload', () => {
    it('validates file exists', () => {
        const result = validateFileUpload(null);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('No file');
    });

    it('validates file size', () => {
        const file = { name: 'doc.pdf', size: 20 * 1024 * 1024, type: 'application/pdf' };
        const result = validateFileUpload(file, { maxSize: 10 * 1024 * 1024 });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('size exceeds');
    });

    it('validates allowed types', () => {
        const file = { name: 'doc.txt', size: 100, type: 'text/plain' };
        const result = validateFileUpload(file, { allowedTypes: ['application/pdf'] });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not allowed');
    });

    it('validates allowed extensions', () => {
        const file = { name: 'doc.exe', size: 100, type: 'application/octet-stream' };
        const result = validateFileUpload(file, { allowedExtensions: ['pdf', 'jpg'] });
        expect(result.isValid).toBe(false);
    });

    it('rejects dangerous file extensions', () => {
        const file = { name: 'virus.exe', size: 100, type: 'application/octet-stream' };
        const result = validateFileUpload(file);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous');
    });

    it('accepts valid file', () => {
        const file = { name: 'cert.pdf', size: 1024, type: 'application/pdf' };
        const result = validateFileUpload(file);
        expect(result.isValid).toBe(true);
    });
});
