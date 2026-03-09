/**
 * Gemini API Key Provider Edge Function
 *
 * Returns the Gemini API key to authenticated users so the client can call
 * Gemini directly. This avoids proxying large image payloads through the
 * edge function (which causes 504 timeouts on engineering drawings).
 *
 * SECURITY: Requires authentication — only logged-in users can obtain the key.
 * The key is never in the client bundle; it's fetched at runtime.
 */

import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

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

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return errorResponse(req, 'Service configuration error', 500);
  }

  return jsonResponse(req, { apiKey });
});
