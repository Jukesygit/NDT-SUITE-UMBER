/**
 * TwoFactorChallenge — the sign-in second-factor step.
 *
 * Two ways through:
 *   1. the authenticator code (owned by the caller, which completes the login)
 *   2. a backup code, for a user who has lost their authenticator
 *
 * Redeeming a backup code RESETS the account's 2FA server-side — every TOTP
 * factor and remaining code is deleted (owner decision 2026-08-26). There is
 * deliberately no "carry on with backup codes" path: the user is signed in,
 * auth state is refreshed so the challenge resolves, and the mandatory
 * enrollment gate then makes them set up a new authenticator.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { TwoFactorVerifyInput } from './TwoFactorVerifyInput';
import { useVerifyBackupCode } from '../../hooks/mutations/useTwoFactorMutations';

interface TwoFactorChallengeProps {
  /** Authenticator-code submit — the caller owns verification and navigation. */
  onSubmitCode: (code: string) => void;
  isVerifying: boolean;
  verifyError?: string;
  /** Called after a backup code is accepted; the caller completes the login. */
  onBackupCodeAccepted: () => void;
  onBackToSignIn: () => void;
}

export function TwoFactorChallenge({
  onSubmitCode,
  isVerifying,
  verifyError,
  onBackupCodeAccepted,
  onBackToSignIn,
}: TwoFactorChallengeProps) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const redeem = useVerifyBackupCode();

  const handleBackupSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const candidate = backupCode.trim();
      if (!candidate || redeem.isPending) return;

      // Success always means the same thing: signed in, 2FA reset. Nothing
      // branches on `remaining` — deletion is consumption, so it is always 0.
      redeem.mutate(candidate, {
        onSuccess: () => {
          setBackupCode('');
          onBackupCodeAccepted();
        },
      });
    },
    [backupCode, redeem, onBackupCodeAccepted]
  );

  if (!useBackupCode) {
    return (
      <>
        <TwoFactorVerifyInput onSubmit={onSubmitCode} isLoading={isVerifying} error={verifyError} />
        <div className="lg-footer">
          <button
            type="button"
            className="lg-link"
            onClick={() => {
              setUseBackupCode(true);
              redeem.reset();
            }}
          >
            Lost your authenticator? Use a backup code
          </button>
        </div>
        <div className="lg-footer">
          <button type="button" className="lg-link" onClick={onBackToSignIn}>
            Back to sign in
          </button>
        </div>
      </>
    );
  }

  // The server's failure messages are deliberately uniform (wrong, malformed,
  // used and none-enrolled all read the same) and include the rate-limit
  // answer — surface whatever it says, verbatim.
  const redeemError = redeem.error instanceof Error ? redeem.error.message : '';

  return (
    <form onSubmit={handleBackupSubmit} className="lg-form">
      <div className="lg-alert error" role="status">
        Using a backup code will sign you in and reset your two-factor setup — you&apos;ll enrol a
        new authenticator.
      </div>

      <div className="lg-field">
        <label htmlFor="backup-code" className="lg-label">
          Backup code
        </label>
        <input
          id="backup-code"
          type="text"
          className="lg-input code"
          value={backupCode}
          onChange={(event) => setBackupCode(event.target.value)}
          placeholder="XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={redeem.isPending}
          required
        />
        <p className="lg-hint">Each backup code works once.</p>
      </div>

      {redeemError && (
        <div className="lg-alert error" role="alert">
          {redeemError}
        </div>
      )}

      <button type="submit" className="lg-submit" disabled={redeem.isPending || !backupCode.trim()}>
        {redeem.isPending ? 'Checking...' : 'Use backup code'}
      </button>

      <div className="lg-footer">
        <button
          type="button"
          className="lg-link"
          onClick={() => {
            setUseBackupCode(false);
            redeem.reset();
          }}
        >
          Use your authenticator instead
        </button>
      </div>
    </form>
  );
}
