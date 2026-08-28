// =============================================================================
// factor-errors — the one case where a failed delete counts as success
// =============================================================================
// The redemption path consumes a user's backup codes only AFTER their TOTP
// factors are confirmed gone. This predicate is what "confirmed gone" means, so
// it decides two things that pull in opposite directions:
//
//   * Too strict, and the second of two concurrent redemptions is told recovery
//     failed when the state it wanted is exactly the state it found — sending
//     the user to burn another code for a reset that already happened.
//   * Too loose, and a permission or network error gets read as "gone", and the
//     function consumes the whole code set while a factor is still standing —
//     the exact lockout the ordering rule exists to prevent.
//
// So both directions are pinned here, and the loose direction is pinned harder.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { isFactorAlreadyGone } from './factor-errors.ts';

describe('isFactorAlreadyGone — treats "nothing to delete" as done', () => {
  it('reads a null error as success, so callers can pass the raw result through', () => {
    expect(isFactorAlreadyGone(null)).toBe(true);
    expect(isFactorAlreadyGone(undefined)).toBe(true);
  });

  it('reads a 404 as already gone', () => {
    expect(isFactorAlreadyGone({ status: 404 })).toBe(true);
    expect(isFactorAlreadyGone({ status: 404, message: 'anything at all' })).toBe(true);
  });

  it('recognises the message shapes the admin API uses for a missing factor', () => {
    for (const message of [
      'Factor not found',
      'factor notfound',
      'No factor matching that id',
      'MFA factor does not exist',
      'Factor already deleted',
      'factor already removed',
    ]) {
      expect(isFactorAlreadyGone({ status: 400, message }), message).toBe(true);
    }
  });
});

describe('isFactorAlreadyGone — everything that could leave a factor standing is a failure', () => {
  it('does NOT excuse errors that say nothing about the factor being gone', () => {
    // Each of these, misread as "gone", would consume the user's whole code set
    // while their 2FA was still enrolled.
    for (const error of [
      { status: 401, message: 'Unauthorized' },
      { status: 403, message: 'Forbidden' },
      { status: 429, message: 'Too many requests' },
      { status: 500, message: 'Internal server error' },
      { status: 503, message: 'Service unavailable' },
      { message: 'network timeout' },
      { message: 'Database connection failed' },
      { message: '' },
      {},
    ]) {
      expect(isFactorAlreadyGone(error), JSON.stringify(error)).toBe(false);
    }
  });

  it('does not match on a non-string message', () => {
    expect(isFactorAlreadyGone({ message: 404 as unknown as string })).toBe(false);
    expect(isFactorAlreadyGone({ message: null as unknown as string })).toBe(false);
  });

  it('does not treat a 4xx other than 404 as gone on status alone', () => {
    expect(isFactorAlreadyGone({ status: 400, message: 'Bad request' })).toBe(false);
    expect(isFactorAlreadyGone({ status: 409, message: 'Conflict' })).toBe(false);
  });
});
