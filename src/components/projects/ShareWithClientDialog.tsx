/**
 * ShareWithClientDialog — publish a project as a loginless client link.
 *
 * Four decisions, in the order the design lays them out: which vessels, which
 * layers, how long the link lives, and whether it needs a passcode
 * (docs/plans/2026-08-17-client-sharing-design.md, "Publish flow").
 *
 * The layer picker is not a visibility control. Anything unticked is REMOVED
 * from the published bundle, so the wording here says "include", never "show" —
 * a client cannot toggle their way back to it, and the publisher should
 * understand that is what they are deciding.
 *
 * Existing links are listed alongside: re-publishing keeps the same URL (the
 * client's bookmark keeps working) and only repoints it at a new revision.
 */

import { useMemo, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { LAYER_CATEGORIES, type LayerKey } from '../VesselModeler/outliner-tree';
import { SHARE_LAYER_DEFAULTS } from '../clientShare/bundle-types';
import type { InspectionProject, ProjectVessel } from '../../types/inspection-project';
import {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHOICES,
  shareUrl,
  type ClientShareRecord,
} from '../../services/client-share-service';
import { ShareLinkList } from './ShareLinkList';
import { useClientShares } from '../../hooks/queries/useClientShares';
import {
  usePublishClientShare,
  useRestoreClientShare,
  useRevokeClientShare,
} from '../../hooks/mutations/useClientShareMutations';

interface ShareWithClientDialogProps {
  project: InspectionProject;
  vessels: ProjectVessel[];
  userId: string;
  onClose: () => void;
}

export function ShareWithClientDialog({
  project,
  vessels,
  userId,
  onClose,
}: ShareWithClientDialogProps) {
  const { data: shares = [] } = useClientShares(project.id);
  const publish = usePublishClientShare();
  const revoke = useRevokeClientShare(project.id);
  const restore = useRestoreClientShare(project.id);

  const [selectedVessels, setSelectedVessels] = useState<Set<string>>(
    () => new Set(vessels.map((v) => v.id))
  );
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(() => ({
    ...SHARE_LAYER_DEFAULTS,
  }));
  const [expiryDays, setExpiryDays] = useState<number | null>(DEFAULT_SHARE_EXPIRY_DAYS);
  const [passcode, setPasscode] = useState('');
  const [republishTarget, setRepublishTarget] = useState<ClientShareRecord | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [result, setResult] = useState<{ token: string; skipped: string[] } | null>(null);

  const publishedLayers = useMemo(
    () => (Object.keys(layers) as LayerKey[]).filter((key) => layers[key]),
    [layers]
  );

  const canPublish = selectedVessels.size > 0 && !publish.isPending;

  const handlePublish = async () => {
    setResult(null);
    const chosen = vessels.filter((v) => selectedVessels.has(v.id));
    const outcome = await publish.mutateAsync({
      project,
      vessels: chosen,
      publishedLayers,
      expiryDays,
      // A blank box on a RE-publish means "leave the passcode as it was", not
      // "remove it" — removing a client's passcode by accident is the kind of
      // quiet downgrade this dialog must never do.
      passcode: passcode ? passcode : republishTarget ? undefined : null,
      userId,
      existingShare: republishTarget,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setProgress(null);
    setResult({ token: outcome.share.token, skipped: outcome.skipped });
    setRepublishTarget(null);
    setPasscode('');
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(shareUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Modal isOpen size="xl" title="Share with client" onClose={onClose}>
      <div className="pj-share-dialog">
        <ShareLinkList
          shares={shares}
          copiedToken={copied}
          onCopy={copyLink}
          onRepublish={setRepublishTarget}
          onRevoke={(id) => revoke.mutate(id)}
          onRestore={(id) => restore.mutate(id)}
        />

        {republishTarget && (
          <div className="pj-alert">
            Publishing a new revision behind the existing link — the client&apos;s URL does not
            change.{' '}
            <button type="button" className="pj-link-btn" onClick={() => setRepublishTarget(null)}>
              Create a new link instead
            </button>
          </div>
        )}

        {/* ---- Vessels ---- */}
        <section className="pj-share-section">
          <div className="pj-share-section-title">Vessels</div>
          {vessels.length === 0 ? (
            <div className="pj-empty-text">This project has no vessels yet.</div>
          ) : (
            <div className="pj-share-checks">
              {vessels.map((vessel) => (
                <label key={vessel.id} className="pj-share-check">
                  <input
                    type="checkbox"
                    checked={selectedVessels.has(vessel.id)}
                    onChange={(e) =>
                      setSelectedVessels((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(vessel.id);
                        else next.delete(vessel.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    {vessel.vessel_tag ? `${vessel.vessel_tag} — ` : ''}
                    {vessel.vessel_name}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="pj-share-hint">
            Vessels without a linked 3D model are skipped — there is nothing to show.
          </div>
        </section>

        {/* ---- Layers ---- */}
        <section className="pj-share-section">
          <div className="pj-share-section-title">Include</div>
          <div className="pj-share-checks">
            {LAYER_CATEGORIES.map(({ key, label }) => (
              <label key={key} className="pj-share-check">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) => setLayers((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="pj-share-hint">
            Anything left unticked is removed from the published file, not just hidden. Scope
            planning notes are never published.
          </div>
        </section>

        {/* ---- Expiry + passcode ---- */}
        <section className="pj-share-section">
          <div className="pj-share-section-title">Access</div>
          <div className="pj-form-grid">
            <div className="pj-form-field">
              <label className="pj-form-label" htmlFor="share-expiry">
                Link expires
              </label>
              <select
                id="share-expiry"
                className="pj-form-input"
                value={expiryDays === null ? 'none' : String(expiryDays)}
                onChange={(e) =>
                  setExpiryDays(e.target.value === 'none' ? null : Number(e.target.value))
                }
              >
                {SHARE_EXPIRY_CHOICES.map((choice) => (
                  <option key={choice.label} value={choice.days === null ? 'none' : choice.days}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pj-form-field">
              <label className="pj-form-label" htmlFor="share-passcode">
                Passcode (optional)
              </label>
              <input
                id="share-passcode"
                className="pj-form-input"
                type="text"
                autoComplete="off"
                value={passcode}
                placeholder={republishTarget ? 'Leave blank to keep the current one' : 'None'}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ---- Outcome ---- */}
        {publish.isError && (
          <div className="pj-alert error">
            {publish.error instanceof Error ? publish.error.message : 'Publishing failed.'}
          </div>
        )}

        {result && (
          <div className="pj-alert success">
            <div className="pj-share-result">
              <Link2 size={13} />
              <code className="pj-share-url">{shareUrl(result.token)}</code>
              <button
                type="button"
                className="pj-vessel-action-btn ghost"
                onClick={() => copyLink(result.token)}
              >
                {copied === result.token ? <Check size={12} /> : <Copy size={12} />}
                {copied === result.token ? 'Copied' : 'Copy'}
              </button>
            </div>
            {result.skipped.length > 0 && (
              <div className="pj-share-hint">
                Not published (no linked model): {result.skipped.join(', ')}
              </div>
            )}
          </div>
        )}

        <div className="pj-share-actions">
          {progress && (
            <span className="pj-share-hint">
              Uploading {progress.done} of {progress.total}…
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="pj-btn secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="pj-btn primary"
            disabled={!canPublish}
            onClick={handlePublish}
          >
            {publish.isPending
              ? 'Publishing…'
              : republishTarget
                ? 'Publish new revision'
                : 'Publish link'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
