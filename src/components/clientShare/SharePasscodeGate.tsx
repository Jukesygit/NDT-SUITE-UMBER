/**
 * SharePasscodeGate — the passcode prompt on a protected link.
 *
 * The only state that is deliberately visible to a client: a link that exists
 * and needs a passcode says so, because the person holding it has to be told to
 * type something. Every other failure — wrong link, revoked, expired — is one
 * indistinguishable message elsewhere.
 *
 * Rate-limit awareness matters here: after a burst of wrong attempts the server
 * stops answering, and a form that just says "wrong passcode" forever would send
 * someone hunting for a typo that is not there.
 */

import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';

interface SharePasscodeGateProps {
  projectName?: string;
  /** True after at least one rejected attempt. */
  invalid: boolean;
  /** Seconds to wait, when the server has started refusing attempts. */
  rateLimitedFor: number | null;
  submitting: boolean;
  onSubmit: (passcode: string) => void;
}

export function SharePasscodeGate({
  projectName,
  invalid,
  rateLimitedFor,
  submitting,
  onSubmit,
}: SharePasscodeGateProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value);
  };

  return (
    <div className="cs-gate">
      <form className="cs-gate-card" onSubmit={handleSubmit}>
        <Lock size={22} className="cs-gate-icon" aria-hidden="true" />
        <h1 className="cs-gate-title">This report is passcode protected</h1>
        <p className="cs-gate-text">
          {projectName ? `${projectName} — enter` : 'Enter'} the passcode you were given to view it.
        </p>

        <label className="cs-gate-label" htmlFor="share-passcode-input">
          Passcode
        </label>
        <input
          id="share-passcode-input"
          className="cs-gate-input"
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting || rateLimitedFor !== null}
        />

        {rateLimitedFor !== null ? (
          <p className="cs-gate-error" role="alert">
            Too many attempts. Please wait about{' '}
            {rateLimitedFor < 60
              ? `${rateLimitedFor} seconds`
              : `${Math.ceil(rateLimitedFor / 60)} minutes`}{' '}
            and try again.
          </p>
        ) : (
          invalid && (
            <p className="cs-gate-error" role="alert">
              That passcode was not accepted.
            </p>
          )
        )}

        <button
          type="submit"
          className="cs-gate-submit"
          disabled={submitting || !value.trim() || rateLimitedFor !== null}
        >
          {submitting ? 'Checking…' : 'View report'}
        </button>
      </form>
    </div>
  );
}
