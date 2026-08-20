/**
 * Client Share Service — publish, list and revoke client-share links.
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

/** Revocation is a state change, never a delete: the audit trail outlives it. */
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
  /** Bundle-relative path, e.g. `vessels/<id>/model.json`. */
  path: string;
  body: Record<string, unknown> | Blob;
  contentType: string;
}

/**
 * Upload one revision's files into `<bundlePath>/…`.
 *
 * The manifest is uploaded LAST regardless of its position in the list: the
 * viewer's entry request is the manifest, so a partial upload reads as a dead
 * link rather than as a half-published project. `upsert` is on so a retried
 * publish overwrites its own partial revision instead of erroring out.
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
    const body =
      file.body instanceof Blob
        ? file.body
        : new Blob([JSON.stringify(file.body)], { type: file.contentType });

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
