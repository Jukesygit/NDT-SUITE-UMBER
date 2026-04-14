/** PII field names that must never appear in logs. */
export const PII_FIELDS = new Set([
  'email',
  'user_email',
  'user_name',
  'username',
  'full_name',
  'first_name',
  'last_name',
  'mobile_number',
  'phone',
  'home_address',
  'address',
  'next_of_kin',
  'emergency_contact',
  'date_of_birth',
  'national_id',
  'passport_number',
]);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, '[REDACTED_EMAIL]');
}

export function stripPiiFromObject<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key.toLowerCase())) continue;
    cleaned[key] = typeof value === 'string' ? redactEmails(value) : value;
  }
  return cleaned as Partial<T>;
}

export function sanitizeLogMessage(text: string): string {
  return redactEmails(text);
}
