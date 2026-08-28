/**
 * Avatar URL Service — the ONE place `profiles.avatar_url` is turned into
 * something an `<img>` can display.
 *
 * Security (audit 2026-08-12, M11): the `avatars` bucket is the last bucket that
 * still hands out permanent, world-readable object URLs. Closing that is an app
 * change before it is a migration — the four steps are written into
 * supabase/migrations/20260812122000_bucket_privacy_hardening.sql:67-71. This
 * module is steps 1-2; the bucket flip and the backfill are parked in
 * database/parked-migrations/avatars_private.sql until this ships.
 *
 * ---------------------------------------------------------------------------
 * THE BOTH-SHAPES CONTRACT — the load-bearing property of this file
 * ---------------------------------------------------------------------------
 * `profiles.avatar_url` holds ONE of two shapes at any moment, and which one
 * depends on when a row was last written relative to the backfill:
 *
 *   legacy  `https://<project>.supabase.co/storage/v1/object/public/avatars/<path>`
 *           — written by every upload before this change. Passed through
 *           UNCHANGED: while the bucket is still public it renders, and the
 *           backfill (parked SQL) is what retires the shape. Deliberately NOT
 *           re-signed here, so the frontend can deploy before, with, or after
 *           the SQL and never be the thing that breaks.
 *   path    `<userId>/avatar-<ts>.<ext>` — written by every upload after this
 *           change. Resolved to a short-lived signed URL, batched.
 *
 * Anything else (empty, another scheme, traversal) resolves to nothing, and the
 * caller falls back to initials. A display failure must never be a broken-image
 * icon; the avatar components also carry an `onError` fallback for the case
 * where a URL resolves fine and then fails to load.
 *
 * Sibling precedent: `annotation-attachment-service.ts` (audit finding H2) does
 * the same job for `vessel-annotations`, and `getDocumentUrls`
 * (competency-mutations.ts) is the batching idiom this mirrors. The one
 * deliberate difference from H2 is legacy-URL passthrough, for the deploy-order
 * reason above — H2 had no backfill to sequence against.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
// @ts-ignore - accessing property from untyped module
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

/** The avatar bucket. Public today; private once the parked migration lands. */
export const AVATAR_BUCKET = 'avatars';

/** Signed-URL lifetime in seconds (mirrors the competency/document precedent). */
export const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

/** A stored `profiles.avatar_url` value, in either shape, or nothing. */
export type AvatarRef = string | null | undefined;

/** Raw stored value → displayable URL. Unresolvable refs are simply absent. */
export type AvatarUrlMap = Record<string, string>;

/**
 * What a stored value is, decided once so every consumer agrees.
 *  - `none` — nothing to show (null, blank, or a value we refuse to trust)
 *  - `url`  — already displayable; pass through untouched
 *  - `path` — a bucket object path; needs signing
 */
export type AvatarRefKind =
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'path'; path: string };

const NONE: AvatarRefKind = { kind: 'none' };

/**
 * Classify a stored avatar reference. Pure — no network, no client needed.
 *
 * Passthrough is limited to schemes an `<img>` can actually render and that we
 * could not sign anyway (http/https/data/blob). Every other scheme is treated as
 * garbage rather than passed to the DOM.
 */
export function classifyAvatarRef(ref: AvatarRef): AvatarRefKind {
  if (typeof ref !== 'string') return NONE;

  const value = ref.trim();
  if (!value) return NONE;

  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  if (/^(?:data|blob):/i.test(value)) return { kind: 'url', url: value };

  // Any other scheme (javascript:, file:, ftp:, …) is not an avatar.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return NONE;

  const path = value.replace(/^\/+/, '').split('?')[0];
  if (!path || path.includes('..')) return NONE;

  return { kind: 'path', path };
}

/**
 * Stable, deduplicated list of the refs worth resolving, sorted so a React Query
 * key built from it does not churn when a list is merely re-ordered.
 */
export function avatarRefKeys(refs: readonly AvatarRef[]): string[] {
  const keys = new Set<string>();
  for (const ref of refs) {
    if (classifyAvatarRef(ref).kind === 'none') continue;
    keys.add((ref as string).trim());
  }
  return Array.from(keys).sort();
}

/**
 * Read a resolved URL back out of a map, keyed by the raw stored value.
 * Returns undefined — not '' — so an `<img src>` is never set to the empty
 * string (which re-requests the current page).
 */
export function avatarUrlFor(map: AvatarUrlMap | undefined, ref: AvatarRef): string | undefined {
  if (!map || typeof ref !== 'string') return undefined;
  return map[ref.trim()] || undefined;
}

/**
 * Resolve a batch of stored avatar references to displayable URLs.
 *
 * Legacy URLs pass through; paths are signed in ONE `createSignedUrls` call.
 * A per-object signing failure drops that entry (caller falls back to initials);
 * a transport failure throws, so React Query can retry rather than caching a
 * blank result for the whole staleTime.
 *
 * With Supabase unconfigured this degrades to passthrough-only rather than
 * throwing — an unconfigured environment still renders legacy avatars.
 */
export async function resolveAvatarUrls(refs: readonly AvatarRef[]): Promise<AvatarUrlMap> {
  const result: AvatarUrlMap = {};
  const pathByRef = new Map<string, string>();

  for (const ref of refs) {
    if (typeof ref !== 'string') continue;
    const key = ref.trim();
    if (!key || result[key] || pathByRef.has(key)) continue;

    const classified = classifyAvatarRef(ref);
    if (classified.kind === 'url') result[key] = classified.url;
    else if (classified.kind === 'path') pathByRef.set(key, classified.path);
  }

  if (pathByRef.size === 0) return result;
  if (!supabase || !isSupabaseConfigured()) return result;

  const paths = Array.from(new Set(pathByRef.values()));
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(paths, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const signedByPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item?.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }

  for (const [key, path] of pathByRef) {
    const signed = signedByPath.get(path);
    if (signed) result[key] = signed;
  }

  return result;
}

/** Single-reference convenience over {@link resolveAvatarUrls}. */
export async function resolveAvatarUrl(ref: AvatarRef): Promise<string | null> {
  const map = await resolveAvatarUrls([ref]);
  return avatarUrlFor(map, ref) ?? null;
}
