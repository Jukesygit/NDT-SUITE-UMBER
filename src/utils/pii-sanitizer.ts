import { PII_FIELDS } from '../config/logging';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Replace all email addresses in a string with [REDACTED_EMAIL]. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, '[REDACTED_EMAIL]');
}

/**
 * Shallow-strip keys whose names match known PII fields.
 * Returns a new object; the original is not mutated.
 */
export function stripPiiFromObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key.toLowerCase())) continue;
    cleaned[key] = typeof value === 'string' ? redactEmails(value) : value;
  }
  return cleaned as Partial<T>;
}

/** Safety-net: redact any emails that leaked into a log message string. */
export function sanitizeLogMessage(text: string): string {
  return redactEmails(text);
}

export { PII_FIELDS };
