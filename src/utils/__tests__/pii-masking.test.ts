/**
 * Tests for PII masking utility functions.
 */
import { describe, it, expect } from 'vitest';
import { maskPhone, maskDateOfBirth, maskAddress, maskName } from '../pii-masking';

// ---------------------------------------------------------------------------
// maskPhone
// ---------------------------------------------------------------------------
describe('maskPhone', () => {
    it('masks phone showing last 4 digits', () => {
        expect(maskPhone('+44 7700 900123')).toBe('••••0123');
    });

    it('masks phone with short number', () => {
        expect(maskPhone('1234')).toBe('••••');
    });

    it('returns dash for null/undefined/dash', () => {
        expect(maskPhone(null)).toBe('-');
        expect(maskPhone(undefined)).toBe('-');
        expect(maskPhone('-')).toBe('-');
    });

    it('returns masked value for empty string', () => {
        expect(maskPhone('')).toBe('-');
    });
});

// ---------------------------------------------------------------------------
// maskDateOfBirth
// ---------------------------------------------------------------------------
describe('maskDateOfBirth', () => {
    it('masks date showing only year', () => {
        expect(maskDateOfBirth('1990-05-15')).toBe('••/••/1990');
    });

    it('handles ISO date format', () => {
        expect(maskDateOfBirth('1985-12-25T00:00:00Z')).toBe('••/••/1985');
    });

    it('returns dashes for null/undefined', () => {
        expect(maskDateOfBirth(null)).toBe('-');
        expect(maskDateOfBirth(undefined)).toBe('-');
        expect(maskDateOfBirth('-')).toBe('-');
    });

    it('returns masked placeholder for invalid date', () => {
        expect(maskDateOfBirth('not-a-date')).toBe('••/••/••••');
    });
});

// ---------------------------------------------------------------------------
// maskAddress
// ---------------------------------------------------------------------------
describe('maskAddress', () => {
    it('masks address showing postcode', () => {
        expect(maskAddress('123 Main Street London SW1A 1AA')).toBe('•••• SW1A 1AA');
    });

    it('returns dash for null/undefined/dash', () => {
        expect(maskAddress(null)).toBe('-');
        expect(maskAddress(undefined)).toBe('-');
        expect(maskAddress('-')).toBe('-');
    });

    it('returns masked value for single-word address', () => {
        expect(maskAddress('London')).toBe('••••');
    });
});

// ---------------------------------------------------------------------------
// maskName
// ---------------------------------------------------------------------------
describe('maskName', () => {
    it('masks name completely', () => {
        expect(maskName('John Smith')).toBe('••••••');
    });

    it('returns dash for null/undefined/dash', () => {
        expect(maskName(null)).toBe('-');
        expect(maskName(undefined)).toBe('-');
        expect(maskName('-')).toBe('-');
    });
});
