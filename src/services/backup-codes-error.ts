/**
 * Error plumbing for the `manage-backup-codes` edge function.
 *
 * THE SCAR THIS EXISTS FOR: `functions.invoke` throws a FunctionsHttpError on
 * ANY non-2xx whose `.message` is the useless "Edge Function returned a non-2xx
 * status code", and it throws `data` away. Without reading `.context` (the raw
 * Response) every designed answer the server gives — 403 "Two-factor
 * verification is required…", 409 "Backup codes already exist… Regenerate them
 * instead", 429 rate limit, 500 — collapses into the same generic string.
 * `extractFunctionErrorMessage` recovers the body; `status` recovers the code.
 */

import { extractFunctionErrorMessage } from '../utils/edge-function-error';

export class BackupCodesError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'BackupCodesError';
    this.status = status;
  }

  /**
   * 409 — a live set exists; `regenerate` is the only way to replace it.
   *
   * Status is authoritative. The message check is a fallback for the case where
   * `.context` is not a readable Response (supabase-js shape drift), so the
   * setup wizard still offers regeneration instead of dead-ending.
   */
  get codesAlreadyExist(): boolean {
    if (this.status !== null) return this.status === 409;
    return /already exist/i.test(this.message);
  }
}

export async function toBackupCodesError(
  error: unknown,
  fallback: string
): Promise<BackupCodesError> {
  const context = (error as { context?: { status?: number } })?.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  const message = await extractFunctionErrorMessage(error, fallback);
  return new BackupCodesError(message, status);
}
