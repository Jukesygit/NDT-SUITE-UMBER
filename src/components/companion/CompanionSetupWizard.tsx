import { useState } from 'react';

type Step = 'download' | 'install' | 'verify';

interface Props {
  connected: boolean;
  onDismiss: () => void;
}

export function CompanionSetupWizard({ connected, onDismiss }: Props) {
  const [step, setStep] = useState<Step>('download');

  // Auto-advance to verify when connected
  if (connected && step !== 'verify') {
    setStep('verify');
  }

  const isWindows = navigator.userAgent.includes('Windows');
  const isMac = navigator.userAgent.includes('Mac');

  return (
    <div className="glass-card" style={{ padding: 'var(--spacing-lg)', maxWidth: 520 }}>
      <h3 style={{ margin: '0 0 var(--spacing-md)', fontSize: '18px' }}>
        Set Up Companion App
      </h3>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        {(['download', 'install', 'verify'] as const).map((s, i) => (
          <div
            key={s}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: step === s ? 1 : 0.5,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                background: step === s ? 'var(--accent)' : 'var(--surface-elevated)',
                color: step === s ? 'white' : 'var(--text-secondary)',
              }}
            >
              {s === 'verify' && connected ? '✓' : i + 1}
            </span>
            <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>{s}</span>
          </div>
        ))}
      </div>

      {step === 'download' && (
        <div>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 var(--spacing-md)' }}>
            The Companion app runs on your machine to process NDE inspection files locally.
            {!isWindows && !isMac && ' Your platform may not be supported.'}
          </p>
          <button
            className="btn btn--primary"
            style={{ minWidth: 200, minHeight: 52 }}
            onClick={() => setStep('install')}
          >
            {isWindows ? 'Download for Windows' : isMac ? 'Download for macOS' : 'Download'}
          </button>
        </div>
      )}

      {step === 'install' && (
        <div>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 var(--spacing-md)' }}>
            Run the installer and launch the Companion app. You should see a teal icon in your
            system tray.
          </p>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 var(--spacing-md)', fontSize: '13px' }}>
            Waiting for connection...
          </p>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button
              className="btn btn--primary"
              style={{ minHeight: 44 }}
              disabled
            >
              Searching for companion...
            </button>
            <button
              className="btn btn--secondary"
              style={{ minHeight: 44 }}
              onClick={() => setStep('download')}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'verify' && connected && (
        <div>
          <p style={{ color: 'var(--success)', margin: '0 0 var(--spacing-md)', fontWeight: 600 }}>
            Companion connected successfully!
          </p>
          <button
            className="btn btn--primary"
            style={{ minHeight: 44 }}
            onClick={onDismiss}
          >
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}
