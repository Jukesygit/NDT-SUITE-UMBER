import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal/Modal';
import { TwoFactorVerifyInput } from './TwoFactorVerifyInput';
import { twoFactorService, type EnrollmentData } from '../../services/two-factor-service';

type Step = 'qr' | 'verify' | 'done';

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

  useEffect(() => {
    if (isOpen) {
      setStep('qr');
      setError('');
      twoFactorService
        .enroll()
        .then(setEnrollment)
        .catch((err) => setError(err.message));
    }
  }, [isOpen]);

  const handleVerify = useCallback(
    async (code: string) => {
      if (!enrollment) return;
      setIsLoading(true);
      setError('');
      try {
        await twoFactorService.verifyEnrollment(enrollment.factorId, code);
        setStep('done');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsLoading(false);
      }
    },
    [enrollment]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={mandatory ? () => {} : onClose}
      title="Set Up Two-Factor Authentication"
      size="large"
      closeOnBackdropClick={!mandatory}
      closeOnEscape={!mandatory}
      showCloseButton={!mandatory ? true : false}
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
                <code style={{
                  display: 'inline-block',
                  marginTop: '4px',
                  padding: '4px 10px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  letterSpacing: '0.15em',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}>{enrollment.secret}</code>
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #6b7280)', textAlign: 'center', marginTop: '0.5rem' }}>
                Tip: Set up on a second device too for recovery
              </p>
            </>
          )}
          <button type="button" onClick={() => setStep('verify')} style={{ marginTop: '1rem', width: '100%' }}>
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

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>&#x2705;</div>
          <h3 style={{ marginBottom: '0.5rem' }}>Two-factor authentication enabled</h3>
          <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            You'll be asked for a code from your authenticator app each time you sign in.
            For recovery, you can enroll a second device from this page.
          </p>
          <button type="button" onClick={onComplete} style={{ width: '100%' }}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
