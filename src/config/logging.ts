export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const LOG_CONFIG = {
  level: isDev ? LogLevel.DEBUG : LogLevel.WARN,
  bufferSize: 100,
} as const;

/** Field names that contain PII and must never appear in logs. */
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
