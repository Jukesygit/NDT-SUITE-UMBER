/**
 * Gemini API Proxy Edge Function
 *
 * Proxies requests to Google's Gemini 2.0 Flash API for vessel drawing analysis.
 * SECURITY: Requires authentication, validates inputs, hides API key from client.
 */

import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_IMAGE_SIZE_MB = 20;
const MAX_PROMPT_LENGTH = 10_000;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  // Require authenticated user
  const { auth, errorResponse: authError } = await requireAuth(req);
  if (authError) {
    return authError;
  }

  try {
    // Read API key from environment
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse(req, 'Service configuration error', 500);
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse(req, 'Invalid JSON in request body', 400, e);
    }

    const { imageParts, prompt } = body as { imageParts: unknown; prompt: unknown };

    // Validate imageParts - array of { mimeType, data } objects
    if (!Array.isArray(imageParts) || imageParts.length === 0) {
      return errorResponse(req, 'imageParts must be a non-empty array', 400);
    }

    let totalSizeMB = 0;
    for (const part of imageParts) {
      if (!part || typeof part !== 'object' || typeof part.data !== 'string' || !part.data) {
        return errorResponse(req, 'Each imagePart must have a non-empty data string', 400);
      }
      totalSizeMB += (part.data.length * 0.75) / (1024 * 1024);
    }

    if (totalSizeMB > MAX_IMAGE_SIZE_MB) {
      return errorResponse(req, `Total image data exceeds ${MAX_IMAGE_SIZE_MB}MB limit`, 400);
    }

    // Validate prompt
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return errorResponse(req, 'prompt must be a non-empty string', 400);
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return errorResponse(req, `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit`, 400);
    }

    console.log(
      `Gemini request from user ${auth.user!.id}: ${imageParts.length} image(s) ~${totalSizeMB.toFixed(1)}MB, prompt ${prompt.length} chars`
    );

    // Build Gemini content parts: text prompt + all images
    const contentParts: Record<string, unknown>[] = [{ text: prompt }];
    for (const part of imageParts) {
      contentParts.push({
        inline_data: {
          mime_type: part.mimeType || 'image/png',
          data: part.data,
        },
      });
    }

    // Call Gemini API
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentParts }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      return errorResponse(req, 'AI service request failed', 502);
    }

    const result = await geminiResponse.json();

    // Extract the text response from Gemini's response structure
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

    if (!text) {
      console.error('No text in Gemini response:', JSON.stringify(result).slice(0, 500));
      return errorResponse(req, 'AI service returned no content', 502);
    }

    return jsonResponse(req, { text });
  } catch (error) {
    console.error('Error in gemini-proxy:', error);
    return errorResponse(req, 'Internal server error', 500, error);
  }
});
