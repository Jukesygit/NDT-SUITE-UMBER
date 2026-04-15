import { describe, it, expect } from 'vitest';
import { redactEmails, stripPiiFromObject, sanitizeLogMessage, PII_FIELDS } from './pii-sanitizer';

describe('redactEmails', () => {
  it('redacts a single email', () => {
    expect(redactEmails('contact alice@example.com now')).toBe('contact [REDACTED_EMAIL] now');
  });

  it('redacts multiple emails', () => {
    expect(redactEmails('a@b.co and c@d.org')).toBe('[REDACTED_EMAIL] and [REDACTED_EMAIL]');
  });

  it('returns original string when no emails present', () => {
    expect(redactEmails('no emails here')).toBe('no emails here');
  });

  it('handles emails with subdomains and plus addressing', () => {
    expect(redactEmails('user+tag@sub.domain.co.uk')).toBe('[REDACTED_EMAIL]');
  });

  it('handles empty string', () => {
    expect(redactEmails('')).toBe('');
  });
});

describe('stripPiiFromObject', () => {
  it('removes known PII keys', () => {
    const input = { email: 'a@b.com', role: 'admin', user_name: 'Alice' };
    const result = stripPiiFromObject(input);
    expect(result).toEqual({ role: 'admin' });
  });

  it('is case-insensitive on keys', () => {
    const input = { Email: 'x@y.com', Username: 'bob', status: 'active' };
    const result = stripPiiFromObject(input);
    expect(result).toEqual({ status: 'active' });
  });

  it('redacts emails in string values of non-PII keys', () => {
    const input = { description: 'Created by admin@co.com', role: 'user' };
    const result = stripPiiFromObject(input);
    expect(result).toEqual({
      description: 'Created by [REDACTED_EMAIL]',
      role: 'user',
    });
  });

  it('returns empty object for all-PII input', () => {
    const input = { email: 'a@b.com', username: 'test' };
    expect(stripPiiFromObject(input)).toEqual({});
  });

  it('passes through non-string values untouched', () => {
    const input = { count: 42, active: true, tags: ['a', 'b'] };
    expect(stripPiiFromObject(input)).toEqual(input);
  });

  it('does not mutate the original object', () => {
    const input = { email: 'a@b.com', role: 'admin' };
    const original = { ...input };
    stripPiiFromObject(input);
    expect(input).toEqual(original);
  });
});

describe('sanitizeLogMessage', () => {
  it('redacts emails in log messages', () => {
    expect(sanitizeLogMessage('Login failed for user@test.com')).toBe(
      'Login failed for [REDACTED_EMAIL]'
    );
  });

  it('passes through clean messages', () => {
    expect(sanitizeLogMessage('Login successful')).toBe('Login successful');
  });
});

describe('PII_FIELDS', () => {
  it('contains expected fields', () => {
    expect(PII_FIELDS.has('email')).toBe(true);
    expect(PII_FIELDS.has('user_email')).toBe(true);
    expect(PII_FIELDS.has('user_name')).toBe(true);
    expect(PII_FIELDS.has('mobile_number')).toBe(true);
    expect(PII_FIELDS.has('next_of_kin')).toBe(true);
  });

  it('does not contain non-PII fields', () => {
    expect(PII_FIELDS.has('role')).toBe(false);
    expect(PII_FIELDS.has('id')).toBe(false);
    expect(PII_FIELDS.has('status')).toBe(false);
  });
});
