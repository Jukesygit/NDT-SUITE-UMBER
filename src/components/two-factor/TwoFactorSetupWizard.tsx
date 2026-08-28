import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal/Modal';
import { TwoFactorVerifyInput } from './TwoFactorVerifyInput';
import { BackupCodesDisplay } from './BackupCodesDisplay';
import {
  useGenerateBackupCodes,
  useRegenerateBackupCodes,
} from '../../hooks/mutations/useTwoFactorMutations';
import {
  twoFactorService,
  BackupCodesError,
  type EnrollmentData,
} from '../../services/two-factor-service';

type Step = 'qr' | 'verify' | 'codes' | 'done';

interface TwoFactorSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  mandatory?: boolean;
}

export function TwoFactorSetupWizard({
  isOpen,
  onClose,
  onComplete,
  mandatory = false,
}: TwoFactorSetupWizardProps) {
  const [step, setStep] = useState<Step>('qr');
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Backup codes: React Query mutations own the loading/error/result state.
  const generateCodes = useGenerateBackupCodes();
  const regenerateCodes = useRegenerateBackupCodes();

  const codes = regenerateCodes.data ?? generateCodes.data ?? null;
  const codesError = regenerateCodes.error ?? generateCodes.error ?? null;
  const isMintingCodes = generateCodes.isPending || regenerateCodes.isPending;
  // 409 means a live set exists; only `regenerate` can replace it.
  const codesConflict =
    generateCodes.error instanceof BackupCodesError && generateCodes.error.codesAlreadyExist;

  useEffect(() => {
    if (isOpen) {
      setStep('qr');
      setError('');
      generateCodes.reset();
      regenerateCodes.reset();
      twoFactorService
        .enroll()
        .then(setEnrollment)
        .catch((err) => setError(err.message));
    }
    // Intentionally keyed on isOpen only — the mutation objects are recreated
    // every render and would re-run this effect (and re-enroll) forever.
  }, [isOpen]);

  const handleVerify = useCallback(
    async (code: string) => {
      if (!enrollment) return;
      setIsLoading(true);
      setError('');
      try {
        await twoFactorService.verifyEnrollment(enrollment.factorId, code);
        // The verify just elevated this session to aal2 — the only moment
        // `generate` is permitted. A failure here must NOT block finishing:
        // working 2FA beats shown codes.
        setStep('codes');
        generateCodes.mutate();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsLoading(false);
      }
    },
    [enrollment, generateCodes]
  );

  /** 409 recovery: rotate the existing set by re-proving the authenticator. */
  const handleRegenerate = useCallback(
    (totpCode: string) => {
      regenerateCodes.mutate(totpCode);
    },
    [regenerateCodes]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={mandatory ? () => {} : onClose}
      title="Set Up Two-Factor Authentication"
      size="large"
      closeOnBackdropClick={!mandatory}
      closeOnEscape={!mandatory}
      showCloseButton={!mandatory}
    >
      {step === 'qr' && (
        <div className="two-factor-setup-qr">
          <p>Scan this QR code with your authenticator app:</p>
          {enrollment && (
            <>
              <div
                dangerouslySetInnerHTML={{ __html: enrollment.qr_code }}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: '1rem auto',
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '16px',
                  width: 'fit-content',
                }}
              />
              <p style={{ fontSize: '0.85rem', textAlign: 'center', marginTop: '0.75rem' }}>
                Or enter this secret manually:
                <br />
                <code
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    padding: '4px 10px',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    letterSpacing: '0.15em',
                    wordBreak: 'break-all',
                    userSelect: 'all',
                  }}
                >
                  {enrollment.secret}
                </code>
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-tertiary, #6b7280)',
                  textAlign: 'center',
                  marginTop: '0.5rem',
                }}
              >
                Tip: Set up on a second device too for recovery
              </p>
            </>
          )}
          {error && (
            <p role="alert" style={{ color: 'var(--clean-badge-red-text, #c0392b)' }}>
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary w-full mt-4"
            onClick={() => setStep('verify')}
          >
            Next
          </button>
        </div>
      )}

      {step === 'verify' && (
        <div className="two-factor-setup-verify">
          <p>Enter the 6-digit code from your authenticator app:</p>
          <TwoFactorVerifyInput onSubmit={handleVerify} isLoading={isLoading} error={error} />
        </div>
      )}

      {step === 'codes' && (
        <BackupCodesStep
          codes={codes ?? null}
          error={codesError instanceof Error ? codesError.message : ''}
          isConflict={codesConflict}
          isLoading={isMintingCodes}
          onAcknowledge={() => setStep('done')}
          onRegenerate={handleRegenerate}
          onSkip={() => setStep('done')}
        />
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <div className="text-4xl mb-3">&#x2705;</div>
          <h3 className="mb-2" style={{ color: 'var(--text-primary)' }}>
            Two-factor authentication enabled
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            You&apos;ll be asked for a code from your authenticator app each time you sign in.
            {!codes && ' You can issue backup codes from your profile security panel.'}
          </p>
          <button type="button" className="btn btn--primary w-full" onClick={onComplete}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}

interface BackupCodesStepProps {
  codes: string[] | null;
  error: string;
  isConflict: boolean;
  isLoading: boolean;
  onAcknowledge: () => void;
  onRegenerate: (totpCode: string) => void;
  onSkip: () => void;
}

function BackupCodesStep({
  codes,
  error,
  isConflict,
  isLoading,
  onAcknowledge,
  onRegenerate,
  onSkip,
}: BackupCodesStepProps) {
  if (codes) {
    return (
      <div className="two-factor-setup-codes">
        <h3 className="mb-2" style={{ color: 'var(--text-primary)' }}>
          Save your backup codes
        </h3>
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          Save these codes — each works once if you lose your authenticator.
        </p>
        <BackupCodesDisplay codes={codes} />
        <button type="button" className="btn btn--primary w-full mt-4" onClick={onAcknowledge}>
          I have saved my backup codes
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="two-factor-setup-codes">
        <p style={{ color: 'var(--text-secondary)' }}>Generating your backup codes...</p>
      </div>
    );
  }

  // 409: a live set already exists (re-enrollment after an admin reset, or a
  // retry). Rotating requires a fresh TOTP code; skipping is always available so
  // the wizard never dead-ends.
  if (isConflict) {
    return (
      <div className="two-factor-setup-codes">
        <h3 className="mb-2" style={{ color: 'var(--text-primary)' }}>
          You already have backup codes
        </h3>
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          Backup codes were issued for this account previously. If you still have them, keep using
          them. If not, enter a code from your authenticator app to replace them — the old codes
          will stop working.
        </p>
        <TwoFactorVerifyInput onSubmit={onRegenerate} isLoading={isLoading} error={error} />
        <button type="button" className="btn btn--ghost w-full mt-4" onClick={onSkip}>
          Keep my existing codes
        </button>
      </div>
    );
  }

  // Any other failure: 2FA is already active and that is what matters.
  return (
    <div className="two-factor-setup-codes">
      <h3 className="mb-2" style={{ color: 'var(--text-primary)' }}>
        Backup codes unavailable
      </h3>
      <p role="alert" className="mb-4" style={{ color: 'var(--text-secondary)' }}>
        {error || 'Could not generate backup codes'}
      </p>
      <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
        Your authenticator is set up and two-factor authentication is active. You can issue backup
        codes later from your profile security panel.
      </p>
      <button type="button" className="btn btn--primary w-full" onClick={onSkip}>
        Continue
      </button>
    </div>
  );
}
