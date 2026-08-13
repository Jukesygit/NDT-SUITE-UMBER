/**
 * Gemini Relay Proxy Edge Function
 *
 * Relays a `generateContent` call to the Gemini API on behalf of an
 * authenticated client. The client posts { model?, contents, generationConfig? };
 * this function attaches GEMINI_API_KEY as an HTTP header and forwards Gemini's
 * JSON body back.
 *
 * SECURITY: The key never leaves the server — it is not in any response body and
 * never in a URL (query strings are logged by intermediaries, so the key goes in
 * the `x-goog-api-key` header). This function previously returned the raw key to
 * any authenticated caller (security audit C1); that key must be treated as
 * compromised and rotated.
 *
 * The Gemini response body is forwarded verbatim with HTTP 200 — including
 * application-level `{ error: { status, message } }` payloads — because the
 * client relies on `error.status` to walk its model-fallback list. Only
 * transport-level failures return a non-2xx status.
 *
 * NOTE: proxying large engineering-drawing payloads was the original 504 risk
 * (which is why the key used to be vended). If those timeouts reappear, the
 * follow-up is to stream the Gemini response from this function — never to send
 * the key to the browser again.
 */

import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** The model id is interpolated into the upstream URL — allow-list its shape. */
const MODEL_PATTERN = /^gemini-[a-z0-9.-]{1,40}$/;

/** Reject oversized uploads (~15 MB) before spending an upstream call. */
const MAX_REQUEST_BYTES = 15000000;

interface GeminiProxyRequest {
  model?: unknown;
  contents?: unknown;
  generationConfig?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  const { errorResponse: authError } = await requireAuth(req);
  if (authError) {
    return authError;
  }

  const declaredLength = Number.parseInt(req.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse(req, 'Request payload too large', 413);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return errorResponse(req, 'Service configuration error', 500);
  }

  let payload: GeminiProxyRequest;
  try {
    payload = (await req.json()) as GeminiProxyRequest;
  } catch {
    return errorResponse(req, 'Invalid JSON body', 400);
  }

  const { model, contents, generationConfig } = payload ?? {};

  if (!Array.isArray(contents) || contents.length === 0) {
    return errorResponse(req, 'Invalid request: contents must be a non-empty array', 400);
  }

  if (model !== undefined && (typeof model !== 'string' || !MODEL_PATTERN.test(model))) {
    // Wording matters: the client's drawing-parser treats /unsupported/i in an
    // error as "model not found → fall back to another model". The word must not
    // appear here or a rejected (non-allowlisted) model reads as a model outage.
    return errorResponse(req, 'Invalid request: model not allowed', 400);
  }

  if (
    generationConfig !== undefined &&
    (typeof generationConfig !== 'object' || generationConfig === null || Array.isArray(generationConfig))
  ) {
    return errorResponse(req, 'Invalid request: generationConfig must be an object', 400);
  }

  const resolvedModel = typeof model === 'string' ? model : DEFAULT_MODEL;

  const upstreamBody: Record<string, unknown> = { contents };
  if (generationConfig !== undefined) {
    upstreamBody.generationConfig = generationConfig;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${GEMINI_API_BASE}/${resolvedModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // SECURITY: header, never a `?key=` query string (query strings get logged).
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    return errorResponse(req, 'Model request failed', 502, err);
  }

  let data: Record<string, unknown>;
  try {
    data = (await upstream.json()) as Record<string, unknown>;
  } catch (err) {
    return errorResponse(req, 'Model returned an unreadable response', 502, err);
  }

  // Forward Gemini's body as-is with 200 — application-level errors included,
  // so the client can read `error.status` instead of losing it to a non-2xx throw.
  return jsonResponse(req, data);
});
