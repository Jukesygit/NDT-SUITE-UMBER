/**
 * Client Share Service — publish, list, revoke and delete client-share links.
 *
 * Design: docs/plans/2026-08-17-client-sharing-design.md. This is the
 * AUTHENTICATED half; the loginless half is the `serve-client-share` edge
 * function, and nothing here is reachable without a session.
 *
 * Two things the caller does NOT get to decide, because the database decides
 * them (see the migration's trigger): `organization_id` and `bundle_path`. They
 * are derived from the project and the revision, so a publish cannot be aimed at
 * another org or another share's storage prefix. That is why `bundle_path` is
 * read BACK from the insert rather than sent with it.
 *
 * Ordering is load-bearing, in two nested ways:
 *
 *   • UPLOAD FIRST, FLIP LAST. A re-publish writes the whole of rev-N+1 into
 *     storage while the live link still serves rev-N, and only then bumps the
 *     row — which is the single moment the link changes what it points at. A
 *     failed re-publish therefore leaves the client's existing link working, not
 *     staring at an empty prefix. (A FIRST publish has nothing to protect: its
 *     row is minted before the upload because the storage policy keys on the
 *     share id, and the link is not handed out until the upload succeeds.)
 *
 *   • MANIFEST LAST within a revision. The manifest is the viewer's entry
 *     request, so a half-finished revision reads as a dead link rather than as a
 *     half-published project.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

import { MANIFEST_PATH } from '../components/clientShare/bundle-types';

const BUCKET = 'client-shares';

// ============================================================================
// Types
// ============================================================================

export interface ClientShareRecord {
  id: string;
  token: string;
  project_id: string;
  organization_id: string;
  bundle_path: string;
  revision: number;
  expires_at: string | null;
  revoked_at: string | null;
  /** Present only so the UI can show "passcode set"; never the passcode itself. */
  passcode_hash: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Link primitives (token, expiry, status) are pure and live in
// `utils/client-share-link` so the publish dialog can use them without pulling
// in the data layer. Re-exported so service consumers keep one import.
export {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHOICES,
  clientShareStatus,
  expiryFromDays,
  mintShareToken,
  shareUrl,
  type ClientShareStatus,
} from '../utils/client-share-link';

// ============================================================================
// Reads
// ============================================================================

/** Every share on a project, newest first. RLS scopes this to the caller's org. */
export async function listClientShares(projectId: string): Promise<ClientShareRecord[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('client_shares')
    .select(
      'id, token, project_id, organization_id, bundle_path, revision, expires_at, revoked_at, passcode_hash, created_by, created_at, updated_at'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ClientShareRecord[];
}

export interface ClientShareViewSummary {
  /** Total recorded views of this share, all revisions. */
  total: number;
  /** Views in the last 7 days. */
  recent: number;
  lastViewedAt: string | null;
}

/** "Viewed 3× this week" — counts only, never a viewer. */
export async function getClientShareViews(shareId: string): Promise<ClientShareViewSummary> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('client_share_views')
    .select('viewed_at')
    .eq('share_id', shareId)
    .order('viewed_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  const rows = (data ?? []) as { viewed_at: string }[];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    total: rows.length,
    recent: rows.filter((r) => new Date(r.viewed_at).getTime() >= weekAgo).length,
    lastViewedAt: rows[0]?.viewed_at ?? null,
  };
}

// ============================================================================
// Writes
// ============================================================================

/** Settings a re-publish may change. `undefined` leaves a field untouched. */
export interface ClientShareSettingsPatch {
  expiresAt?: string | null;
  passcodeHash?: string | null;
}

export interface CreateClientShareParams {
  projectId: string;
  userId: string;
  token: string;
  expiresAt: string | null;
  /** Pre-hashed by the publish dialog; the plaintext never reaches this layer. */
  passcodeHash: string | null;
}

/**
 * Mint the share row. `bundle_path` and `organization_id` are placeholders the
 * trigger overwrites — sent only because the columns are NOT NULL, and read back
 * from the returned row, which is the value that actually landed.
 */
export async function createClientShare(
  params: CreateClientShareParams
): Promise<ClientShareRecord> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('client_shares')
    .insert({
      project_id: params.projectId,
      created_by: params.userId,
      token: params.token,
      expires_at: params.expiresAt,
      passcode_hash: params.passcodeHash,
      // Overwritten by client_shares_derive_fields(); never trusted from here.
      organization_id: '00000000-0000-0000-0000-000000000000',
      bundle_path: 'pending',
      revision: 1,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as ClientShareRecord;
}

/**
 * Storage prefix the NEXT revision will occupy — mirroring the trigger's own
 * `id || '/rev-' || revision` derivation, so a re-publish can upload into it
 * before the row is flipped. The trigger remains the authority: this is the
 * only place that anticipates it, and `bumpClientShareRevision` reads back what
 * actually landed.
 */
export function nextBundlePath(share: Pick<ClientShareRecord, 'id' | 'revision'>): string {
  return `${share.id}/rev-${share.revision + 1}`;
}

/**
 * Flip a share to its next revision, AFTER that revision is fully uploaded.
 * Re-publishing keeps the same link — same token, same audit trail — and only
 * repoints it. This call is the atomic moment the client's view changes.
 */
export async function bumpClientShareRevision(
  shareId: string,
  currentRevision: number,
  settings: ClientShareSettingsPatch = {}
): Promise<ClientShareRecord> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const update: Record<string, unknown> = { revision: currentRevision + 1 };
  // `undefined` means "leave as it was"; `null` means "clear it". Distinguishing
  // the two matters: a re-publish that did not touch the passcode must not
  // silently unlock a link the client already has.
  if (settings.expiresAt !== undefined) update.expires_at = settings.expiresAt;
  if (settings.passcodeHash !== undefined) update.passcode_hash = settings.passcodeHash;

  const { data, error } = await supabase!
    .from('client_shares')
    .update(update)
    .eq('id', shareId)
    .select('*')
    .single();

  if (error) throw error;
  return data as ClientShareRecord;
}

/**
 * Revocation is a state change, never a delete: the audit trail outlives it, and
 * `restoreClientShare` below undoes it exactly. The irreversible sibling is
 * `deleteClientShare` at the bottom of this file — the two are deliberately
 * different actions, and the UI must not blur them.
 */
export async function revokeClientShare(shareId: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('client_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId);

  if (error) throw error;
}

/** Lift a revocation — the same link starts working again. */
export async function restoreClientShare(shareId: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('client_shares')
    .update({ revoked_at: null })
    .eq('id', shareId);

  if (error) throw error;
}

export interface UploadBundleFile {
  /** Bundle-relative path, e.g. `vessels/<id>/model.json.gz`. */
  path: string;
  body: Record<string, unknown> | Blob;
  contentType: string;
  /**
   * Compress this file's JSON body before uploading it. The builder marks the
   * vessel models and stays pure; the compression is THIS layer's job because it
   * is async and it is a property of the transfer, not of the bundle's content.
   * Ignored for bodies that are already Blobs — a PNG is not worth re-packing.
   */
  encoding?: 'gzip';
}

/**
 * Gzip a JSON payload for storage.
 *
 * `CompressionStream` is browser-native (and a Node global since 18), which is
 * why the share feature gained compression without gaining a dependency — a hard
 * constraint on the viewer side, and one this side has no reason to break either.
 *
 * The bytes are stored gzipped and served back verbatim: the edge function
 * proxies the object without a `Content-Encoding` header, so no browser inflates
 * this for us. `client-share-client.ts` does it explicitly, keyed off the `.gz`
 * in the file name.
 */
async function gzipJson(payload: Record<string, unknown>, contentType: string): Promise<Blob> {
  const source = new Response(JSON.stringify(payload)).body;
  if (!source) throw new Error('Could not compress the share bundle for upload.');
  return new Response(source.pipeThrough(new CompressionStream('gzip')), {
    headers: { 'Content-Type': contentType },
  }).blob();
}

/**
 * Upload one revision's files into `<bundlePath>/…`.
 *
 * The manifest is uploaded LAST regardless of its position in the list: the
 * viewer's entry request is the manifest, so a partial upload reads as a dead
 * link rather than as a half-published project. `upsert` is on so a retried
 * publish overwrites its own partial revision instead of erroring out.
 *
 * Files marked `encoding: 'gzip'` are compressed here. That is not an
 * optimisation: a full-resolution vessel model as raw JSON was refused outright
 * by Storage (2026-08-21, "The object exceeded the maximum allowed size" against
 * the project's ~50MB upload cap), and a publish that cannot upload is a client
 * with no report.
 */
export async function uploadShareBundle(
  bundlePath: string,
  files: UploadBundleFile[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const manifest = files.filter((f) => f.path === MANIFEST_PATH);
  const rest = files.filter((f) => f.path !== MANIFEST_PATH);
  const ordered = [...rest, ...manifest];

  let done = 0;
  for (const file of ordered) {
    let body: Blob;
    if (file.body instanceof Blob) {
      body = file.body;
    } else if (file.encoding === 'gzip') {
      body = await gzipJson(file.body, file.contentType);
    } else {
      body = new Blob([JSON.stringify(file.body)], { type: file.contentType });
    }

    const { error } = await supabase!.storage
      .from(BUCKET)
      .upload(`${bundlePath}/${file.path}`, body, {
        contentType: file.contentType,
        upsert: true,
      });

    if (error) throw error;
    onProgress?.((done += 1), ordered.length);
  }
}

// ============================================================================
// Deletion and revision pruning
// ============================================================================
//
// Both of these remove objects from the bucket, which the original design
// deliberately never did ("prior revisions are kept as the audit trail"; bundle
// cleanup listed under Out of scope). The OWNER relaxed that on 2026-08-21:
// revisions are full-resolution copies of every published grid and accumulate
// forever, and a share a publisher wants gone should actually go. The audit
// weight moved to `client_share_views`, which still records every view for as
// long as the share exists, and to revocation, which stays reversible.
//
// The storage DELETE policy that authorises this is
// `supabase/migrations/20260821140000_client_share_storage_delete.sql`.

/** Storage lists cap at 1000 entries per call; anything longer is paginated. */
const LIST_PAGE_SIZE = 1000;
/** `remove()` takes a path array; batched so a big share is not one giant call. */
const REMOVE_BATCH_SIZE = 100;
/**
 * A bundle is exactly three levels deep below the share id
 * (`rev-N/vessels/<id>/<file>`), so this cap can never bite a real share. It
 * exists so a listing that somehow reports a folder as its own child cannot spin
 * forever against the network.
 */
const MAX_LIST_DEPTH = 8;

interface ShareDirEntry {
  name: string;
  /**
   * Storage marks folders with a null `id` — they are prefixes, not rows. A file
   * always carries an id, so "no id" is the folder test, not a name heuristic.
   */
  isFolder: boolean;
}

/** One directory's entries, following pagination to the end. */
async function listShareDir(dir: string): Promise<ShareDirEntry[]> {
  const entries: ShareDirEntry[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase!.storage
      .from(BUCKET)
      .list(dir, { limit: LIST_PAGE_SIZE, offset });

    if (error) throw error;

    const page = (data ?? []) as { name: string; id?: string | null }[];
    for (const entry of page) {
      entries.push({ name: entry.name, isFolder: entry.id === null || entry.id === undefined });
    }

    // A short page is the end of the listing. Asking for one more page would
    // work too, but this is one fewer round trip on every bundle we walk.
    if (page.length < LIST_PAGE_SIZE) break;
    offset += page.length;
  }

  return entries;
}

/**
 * Every object path under `prefix`, recursively.
 *
 * Storage has no "delete this prefix" call: `remove()` takes explicit paths, so
 * anything that deletes has to enumerate first. The walk is written generically
 * rather than hard-coded to `rev-N/vessels/<id>/<file>` — the bundle layout is a
 * property of the builder, and a layout change must not silently start leaving
 * objects behind.
 *
 * @internal Exported for `__tests__/client-share-deletion.test.ts`.
 */
export async function listShareObjectPaths(prefix: string): Promise<string[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const paths: string[] = [];
  const pending: { dir: string; depth: number }[] = [{ dir: prefix, depth: 0 }];

  while (pending.length > 0) {
    const { dir, depth } = pending.shift()!;
    for (const entry of await listShareDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (!entry.isFolder) {
        paths.push(path);
      } else if (depth < MAX_LIST_DEPTH) {
        pending.push({ dir: path, depth: depth + 1 });
      }
    }
  }

  return paths;
}

/** Remove paths in batches, stopping at the first storage error. */
async function removeShareObjects(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const { error } = await supabase!.storage
      .from(BUCKET)
      .remove(paths.slice(i, i + REMOVE_BATCH_SIZE));

    if (error) throw error;
  }
}

/**
 * Permanently remove a share: its storage objects first, then its row.
 *
 * THE ORDER IS LOAD-BEARING. The storage DELETE policy authorises an object by
 * an EXISTS over the share ROW that owns its prefix, so the row must still be
 * there while the objects are being removed. Delete the row first and every
 * object under it becomes an orphan no authenticated session can ever touch
 * again — only a service-role script could clean up.
 *
 * Throws on any error, and the caller reports it. A partial failure leaves the
 * share in a defined, retryable state: objects gone but the row alive means the
 * link serves a dead bundle (the edge function 404s on the missing manifest),
 * which is no worse than the revoked state, and pressing Delete again finishes
 * the job. `client_share_views` rows go with the row via ON DELETE CASCADE.
 */
export async function deleteClientShare(share: Pick<ClientShareRecord, 'id'>): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  await removeShareObjects(await listShareObjectPaths(share.id));

  const { error } = await supabase!.from('client_shares').delete().eq('id', share.id);

  if (error) throw error;
}

/**
 * Which `rev-N` folders a share at `currentRevision` no longer needs.
 *
 * KEEP THE LATEST TWO: the live revision, and one previous. The previous one is
 * the quick restore — a publisher who spots a mistake in what they just sent can
 * re-publish the older bundle rather than reconstruct it. Everything at or below
 * `currentRevision - 2` goes.
 *
 * Pure so the rule is testable without storage. Names that are not exactly
 * `rev-<digits>` are ignored rather than guessed at: this function's output is
 * fed straight to a recursive delete, so anything it cannot positively identify
 * as a superseded revision must be left alone. `rev-0` is likewise ignored —
 * revisions start at 1 (the table's CHECK constraint), so a `rev-0` is something
 * this code did not create and does not understand.
 */
export function revisionsToPrune(currentRevision: number, folderNames: string[]): string[] {
  const oldest = currentRevision - 2;

  return folderNames.filter((name) => {
    const match = /^rev-(\d+)$/.exec(name);
    if (!match) return false;

    const revision = Number(match[1]);
    return revision >= 1 && revision <= oldest;
  });
}

/**
 * Delete every superseded revision of a share, keeping the latest two.
 *
 * Called after a re-publish has flipped the row, so `share.revision` is the LIVE
 * revision — pass the record `bumpClientShareRevision` returned, never the
 * pre-flip one, or this prunes the revision the client is currently reading.
 *
 * BEST-EFFORT IS THE CALLER'S CONTRACT, NOT THIS FUNCTION'S. This throws like
 * everything else here; the publish mutation catches and warns, because a client
 * link that is live and correct must never be reported as a failed publish just
 * because some old bytes could not be swept up. Anything left behind is retried
 * by the next re-publish, which recomputes the whole set from what is actually
 * in the bucket.
 */
export async function pruneShareRevisions(
  share: Pick<ClientShareRecord, 'id' | 'revision'>
): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const revisionFolders = (await listShareDir(share.id))
    .filter((entry) => entry.isFolder)
    .map((entry) => entry.name);

  for (const folder of revisionsToPrune(share.revision, revisionFolders)) {
    await removeShareObjects(await listShareObjectPaths(`${share.id}/${folder}`));
  }
}
