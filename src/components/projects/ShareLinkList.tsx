/**
 * ShareLinkList — the links this project already has, with their controls.
 *
 * Split out of `ShareWithClientDialog` because managing existing links and
 * composing a new publish are two different jobs that happened to share a modal.
 *
 * Revoke is the safety action and is styled as one; it is a state change, not a
 * delete, so Restore is right beside it. Re-publish does NOT mint a new link —
 * it repoints this one, which is why it sits here rather than in the publish
 * form.
 */

import { Check, Copy, RotateCcw, ShieldOff } from 'lucide-react';
import {
  clientShareStatus,
  shareUrl,
  type ClientShareRecord,
} from '../../services/client-share-service';

interface ShareLinkListProps {
  shares: ClientShareRecord[];
  /** Token whose link was just copied, for the transient "Copied" state. */
  copiedToken: string | null;
  onCopy: (token: string) => void;
  onRepublish: (share: ClientShareRecord) => void;
  onRevoke: (shareId: string) => void;
  onRestore: (shareId: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ShareLinkList({
  shares,
  copiedToken,
  onCopy,
  onRepublish,
  onRevoke,
  onRestore,
}: ShareLinkListProps) {
  if (shares.length === 0) return null;

  return (
    <section className="pj-share-section">
      <div className="pj-share-section-title">Existing links</div>
      {shares.map((share) => {
        const status = clientShareStatus(share);
        const badgeClass = status === 'active' ? 'active' : 'neutral';
        return (
          <div key={share.id} className="pj-share-row">
            <span className={`pj-badge ${badgeClass}`}>
              <span className={`pj-led ${badgeClass}`} />
              {status}
            </span>
            <span className="pj-share-row-meta">
              Rev {share.revision} · published {formatDate(share.created_at)}
              {share.expires_at && ` · expires ${formatDate(share.expires_at)}`}
              {share.passcode_hash && ' · passcode set'}
            </span>
            <div className="pj-share-row-actions">
              <button
                type="button"
                className="pj-vessel-action-btn ghost"
                onClick={() => onCopy(share.token)}
                title={shareUrl(share.token)}
              >
                {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                {copiedToken === share.token ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className="pj-vessel-action-btn ghost"
                onClick={() => onRepublish(share)}
                title="Publish a new revision behind this same link"
              >
                <RotateCcw size={12} />
                Re-publish
              </button>
              {status === 'revoked' ? (
                <button
                  type="button"
                  className="pj-vessel-action-btn ghost"
                  onClick={() => onRestore(share.id)}
                  title="Make this link work again"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="pj-vessel-action-btn danger-ghost"
                  onClick={() => onRevoke(share.id)}
                  title="Stop this link working immediately"
                >
                  <ShieldOff size={12} />
                  Revoke
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
