/**
 * ShareDeleteConfirm — the gate in front of permanently deleting a share link,
 * plus the small piece of state that drives it.
 *
 * Its own file because the COPY is the load-bearing part. Revoke sits two
 * buttons away on the same row, does something that sounds similar, and is
 * reversible; this is not. So the wording names what is destroyed rather than
 * asking "are you sure", and it says what survives — a publisher who has just
 * mixed the two actions up needs to know the project and its models are fine.
 *
 * A failed delete keeps the dialog open with the error inside it: deletion is
 * objects-first, row-last, so a failure can leave a partially-removed share, and
 * the recovery is simply to confirm again from here.
 *
 * The hook lives beside the component rather than in `src/hooks/` because it is
 * this dialog's wiring, not a reusable data hook — it exists so the parent gains
 * one line per concern instead of a second copy of the "which share, is it
 * pending, did it fail" bookkeeping.
 */

import { useState } from 'react';
import { ConfirmDialog } from '../ui/Modal';
import { shareUrl, type ClientShareRecord } from '../../services/client-share-service';
import { useDeleteClientShare } from '../../hooks/mutations/useClientShareMutations';

interface ShareDeleteConfirmProps {
  /** The share awaiting confirmation, or null when the gate is closed. */
  share: ClientShareRecord | null;
  isDeleting: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * @param onDeleted Runs after a share is really gone, so the caller can drop any
 *   reference to it — a deleted share must not stay selected as the re-publish
 *   target, or the next publish aims at a row that no longer exists.
 */
export function useShareDeletion(projectId: string, onDeleted?: (shareId: string) => void) {
  const remove = useDeleteClientShare(projectId);
  const [target, setTarget] = useState<ClientShareRecord | null>(null);

  return {
    /** The row button only opens the gate; a stale error is cleared with it. */
    ask: (share: ClientShareRecord) => {
      remove.reset();
      setTarget(share);
    },
    /** Share whose deletion is in flight, so its row cannot be clicked twice. */
    pendingId: remove.isPending ? (remove.variables ?? null) : null,
    confirmProps: {
      share: target,
      isDeleting: remove.isPending,
      error: remove.error,
      onCancel: () => setTarget(null),
      // Only success closes the gate — see the file comment.
      onConfirm: () => {
        if (!target) return;
        const shareId = target.id;
        remove.mutate(shareId, {
          onSuccess: () => {
            onDeleted?.(shareId);
            setTarget(null);
          },
        });
      },
    } satisfies ShareDeleteConfirmProps,
  };
}

export function ShareDeleteConfirm({
  share,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: ShareDeleteConfirmProps) {
  return (
    <ConfirmDialog
      isOpen={share !== null}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Delete this link permanently"
      confirmText={error ? 'Try again' : 'Delete permanently'}
      variant="danger"
      isLoading={isDeleting}
      message={
        <>
          {/* A project can have several links, and this dialog covers the row it
              was opened from — so it names the one that is about to go. */}
          {share && (
            <p style={{ marginBottom: 'var(--spacing-sm)' }}>
              <code style={{ wordBreak: 'break-all' }}>{shareUrl(share.token)}</code>
            </p>
          )}
          <p>
            Revoking stops a link working but keeps everything, and can be undone. Deleting cannot:
            the published files for every revision are erased from storage, along with this
            link&apos;s view history.
          </p>
          <p style={{ marginTop: 'var(--spacing-sm)' }}>
            Anyone holding the URL sees the same message as an expired link. The project and its
            vessel models are untouched — only this published snapshot goes.
          </p>
          {error != null && (
            <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--clean-badge-red-text)' }}>
              {error instanceof Error ? error.message : 'The link could not be deleted.'} Some
              published files may already have been removed — confirm again to finish.
            </p>
          )}
        </>
      }
    />
  );
}
