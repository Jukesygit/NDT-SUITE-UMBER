/**
 * serve-client-share — the ONLY unauthenticated entry to published bundles.
 *
 * Design: docs/plans/2026-08-17-client-sharing-design.md ("Security model").
 * Deployed WITHOUT JWT verification (`--no-verify-jwt`) — deliberately, and it
 * is the one function in this project for which that is true. Everything about
 * the shape below follows from that.
 *
 * Request (POST, JSON):
 *   { token, passcode?, path? }
 *     path omitted  → the manifest, plus the share's public-facing metadata
 *     path present  → one bundle asset, streamed
 *
 * What it will and will not tell you:
 *   • nonexistent, revoked and expired tokens produce a BYTE-IDENTICAL 404 —
 *     same status, same body, same headers. (Byte-identical, not
 *     constant-TIME: all three run the same single indexed lookup, so what is
 *     left is sub-microsecond work behind a network round trip. A client cannot
 *     learn from the response whether a link ever existed.)
 *   • a valid share that needs a passcode DOES say so (401 `passcode_required`).
 *     That is intended: the viewer has to be told to type something. It reveals
 *     only what the person holding the link already knows.
 *   • a wrong passcode is 401 `passcode_invalid`, rate-limited hard.
 *
 * Blast radius of the service-role key used here: exactly one table read
 * (`client_shares`), one table insert (`client_share_views`) and one storage
 * bucket read (`client-shares`). It never touches project data, never accepts a
 * caller-supplied table or column, and never proxies a query.
 *
 * Bytes are proxied rather than handed out as signed URLs, so the bucket stays
 * unreachable from outside this function — the design's invariant. If bundle
 * payloads ever make that too expensive, short-lived signed URLs are the
 * sanctioned next step, and they change that invariant, so they need a decision.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { resolveBundleObjectKey, manifestObjectKey } from './bundle-path.ts';
import { verifyPasscode, timingSafeEqualStrings } from './passcode.ts';
import { consume, PASSCODE_RULE, REQUEST_RULE } from './rate-limit.ts';

const BUCKET = 'client-shares';

/** The single response for missing / revoked / expired. Never varied. */
const GONE_BODY = JSON.stringify({ error: 'not_found' });

interface ShareRow {
  id: string;
  token: string;
  project_id: string;
  bundle_path: string;
  revision: number;
  expires_at: string | null;
  revoked_at: string | null;
  passcode_hash: string | null;
}

function goneResponse(req: Request): Response {
  return new Response(GONE_BODY, {
    status: 404,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function jsonResponse(req: Request, body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Salted hash of the caller's IP. The salt lives only in the environment, so
 *  the stored value cannot be reversed by walking the (small) address space. */
async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${ip}|${salt}`)
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** First hop in x-forwarded-for is the client; the rest are proxies. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

/** Coarse UA family — never the raw string, which is a fingerprint. */
function userAgentFamily(req: Request): string {
  const ua = req.headers.get('user-agent') ?? '';
  if (/\bEdg\//.test(ua)) return 'Edge';
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'Opera';
  if (/\bChrome\//.test(ua)) return 'Chrome';
  if (/\bFirefox\//.test(ua)) return 'Firefox';
  if (/\bSafari\//.test(ua)) return 'Safari';
  return 'Other';
}

function contentTypeFor(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.bin')) return 'application/octet-stream';
  return 'application/octet-stream';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);
  if (req.method !== 'POST') return goneResponse(req);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const ipSalt = Deno.env.get('CLIENT_SHARE_IP_SALT');
  if (!serviceRoleKey || !supabaseUrl || !ipSalt) {
    console.error('serve-client-share is misconfigured (missing url/service key/ip salt)');
    // A configuration fault must not be distinguishable from a dead link either.
    return goneResponse(req);
  }

  const ipHash = await hashIp(clientIp(req), ipSalt);

  const overall = consume(`req:${ipHash}`, REQUEST_RULE);
  if (!overall.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Retry-After': String(overall.retryAfterSeconds),
      },
    });
  }

  let body: { token?: unknown; passcode?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return goneResponse(req);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const passcode = typeof body.passcode === 'string' ? body.passcode : null;
  const requestedPath = typeof body.path === 'string' ? body.path : null;
  if (token.length < 22 || token.length > 64) return goneResponse(req);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // One indexed equality on an unguessable 128-bit value, then a constant-time
  // re-check so the decision itself carries no timing signal.
  const { data, error } = await supabase
    .from('client_shares')
    .select('id, token, project_id, bundle_path, revision, expires_at, revoked_at, passcode_hash')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('client_shares lookup failed', error.message);
    return goneResponse(req);
  }

  const share = data as ShareRow | null;
  if (!share || !timingSafeEqualStrings(share.token, token)) return goneResponse(req);

  // Revoked and expired are the SAME answer as nonexistent. Do not "improve"
  // this into a helpful message — the uniformity is the feature.
  if (share.revoked_at !== null) return goneResponse(req);
  if (share.expires_at !== null && new Date(share.expires_at).getTime() <= Date.now()) {
    return goneResponse(req);
  }

  if (share.passcode_hash) {
    if (passcode === null) {
      return jsonResponse(req, { error: 'passcode_required' }, 401);
    }
    const attempt = consume(`pass:${ipHash}`, PASSCODE_RULE);
    if (!attempt.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          'Retry-After': String(attempt.retryAfterSeconds),
        },
      });
    }
    if (!(await verifyPasscode(passcode, share.passcode_hash))) {
      return jsonResponse(req, { error: 'passcode_invalid' }, 401);
    }
  }

  // ---- Authorised from here on ------------------------------------------
  const objectKey = requestedPath
    ? resolveBundleObjectKey(share.bundle_path, requestedPath)
    : manifestObjectKey(share.bundle_path);

  // A path that fails containment is "not found" — describing it would confirm
  // the share exists and teach an attacker what the filter rejects.
  if (!objectKey) return goneResponse(req);

  const download = await supabase.storage.from(BUCKET).download(objectKey);
  if (download.error || !download.data) return goneResponse(req);

  // Audit only the entry request (the manifest), not every asset fetch — one
  // row per view, not one per texture. Best-effort: a failed log must never
  // cost the client their bundle.
  if (!requestedPath) {
    const { error: auditError } = await supabase.from('client_share_views').insert({
      share_id: share.id,
      user_agent_family: userAgentFamily(req),
      ip_hash: ipHash,
    });
    if (auditError) console.error('client_share_views insert failed', auditError.message);
  }

  const headers: Record<string, string> = {
    ...getCorsHeaders(req),
    'Content-Type': contentTypeFor(objectKey),
    // A published revision is immutable, so the client may cache it hard. The
    // link serves the LATEST revision, and a re-publish changes the manifest's
    // revision — so nothing stale survives a reload of the entry request.
    'Cache-Control': requestedPath ? 'private, max-age=3600' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Share-Revision': String(share.revision),
  };

  return new Response(download.data.stream(), { status: 200, headers });
});
