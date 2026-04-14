import { useState, useCallback, useRef, ClipboardEvent, ChangeEvent } from 'react';

interface TwoFactorVerifyInputProps {
  onSubmit: (code: string) => void;
  isLoading: boolean;
  error?: string;
}

export function TwoFactorVerifyInput({ onSubmit, isLoading, error }: TwoFactorVerifyInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
      setValue(digits);
      if (digits.length === 6) {
        onSubmit(digits);
      }
    },
    [onSubmit]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      setValue(pasted);
      if (pasted.length === 6) {
        onSubmit(pasted);
      }
    },
    [onSubmit]
  );

  return (
    <div className="two-factor-verify-input">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        disabled={isLoading}
        style={{
          fontFamily: 'monospace',
          textAlign: 'center',
          letterSpacing: '0.5em',
          fontSize: '1.5rem',
        }}
      />
      {error && (
        <p role="alert" className="two-factor-error" style={{ color: 'red' }}>
          {error}
        </p>
      )}
    </div>
  );
}
