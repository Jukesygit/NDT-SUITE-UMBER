import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal/Modal';
import { TwoFactorVerifyInput } from './TwoFactorVerifyInput';
import { BackupCodesDisplay } from './BackupCodesDisplay';
import { twoFactorService, type EnrollmentData } from '../../services/two-factor-service';

type Step = 'qr' | 'verify' | 'backup' | 'done';

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
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('qr');
      setError('');
      setSavedCodes(false);
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
        const codes = await twoFactorService.generateBackupCodes();
        setBackupCodes(codes);
        setStep('backup');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsLoading(false);
      }
    },
    [enrollment]
  );

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

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

      {step === 'backup' && (
        <div className="two-factor-setup-backup">
          <BackupCodesDisplay codes={backupCodes} />
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}
          >
            <input
              type="checkbox"
              checked={savedCodes}
              onChange={(e) => setSavedCodes(e.target.checked)}
            />
            I have saved these codes
          </label>
          <button type="button" disabled={!savedCodes} onClick={handleComplete}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
