/**
 * Contact addresses used by client-side email composition.
 *
 * These are business contact addresses, not secrets — the single reason they
 * live here is that they were previously spelled out as literals in four
 * separate modules (two services and an admin component), which put four
 * independent copies of a real mailbox into the shipped bundle for anyone
 * walking the import graph. One definition site is easier to change and easier
 * to audit.
 *
 * MIRRORS `SUPPORT_EMAIL` in `supabase/functions/_shared/email.ts`. The
 * `supabase/` tree is outside the `src` tsconfig and runs on Deno, so the two
 * cannot import each other; keep them in sync by hand.
 */

/** Support mailbox advertised in email footers. */
export const SUPPORT_EMAIL = 'jonas@matrixinspectionservices.com';

/** Default outbound sender for automated (non-reply) mail. */
export const DEFAULT_SENDER_EMAIL = 'noreply@updates.matrixportal.io';
