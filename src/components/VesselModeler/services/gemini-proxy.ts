/**
 * Gemini access for the Vessel Modeler drawing importer.
 *
 * Every call goes through the `gemini-proxy` Supabase edge function, which holds
 * GEMINI_API_KEY server-side and relays the request to Gemini. The browser never
 * receives the key — this module used to fetch and cache it (security audit C1).
 *
 * The proxy forwards Gemini's JSON body verbatim with HTTP 200, application-level
 * `{ error: { status, message } }` payloads included, so `errorStatus` survives
 * for the model-fallback logic in engine/drawing-parser.ts.
 *
 * NOTE: proxying large drawing payloads was the original 504 risk. If those
 * timeouts reappear, the follow-up is response streaming from the edge function —
 * never sending the key to the client again.
 */

import { supabase } from '../../../supabase-client';
import { extractFunctionErrorMessage } from '../../../utils/edge-function-error';

const DEFAULT_MODEL = 'gemini-3.5-flash';

export interface GeminiImagePart {
  mimeType: string;
  data: string; // base64 encoded image data (without data URL prefix)
}

export interface GeminiResponse {
  text: string;
  error?: string;
  /** Gemini API error status (e.g. 'NOT_FOUND') when the call failed. */
  errorStatus?: string;
}

export interface GeminiCallOptions {
  /** Gemini generationConfig (responseSchema, temperature, seed, ...). */
  generationConfig?: Record<string, unknown>;
  /** Override the model ID (defaults to the current known-good Flash model). */
  model?: string;
}

/** Shape of the Gemini `generateContent` body relayed by the edge function. */
interface GeminiApiPayload {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; status?: string };
}

/**
 * Send cropped drawing images plus a prompt to Gemini via the auth-gated
 * `gemini-proxy` edge function and return the model's text output.
 */
export async function callGeminiProxy(
  imageParts: GeminiImagePart[],
  prompt: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResponse> {
  try {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase client not configured');
    }

    const contentParts: Record<string, unknown>[] = [{ text: prompt }];
    for (const part of imageParts) {
      contentParts.push({
        inline_data: {
          mime_type: part.mimeType || 'image/png',
          data: part.data,
        },
      });
    }

    const body: Record<string, unknown> = {
      model: options.model || DEFAULT_MODEL,
      contents: [{ parts: contentParts }],
    };
    if (options.generationConfig) {
      body.generationConfig = options.generationConfig;
    }

    const { data, error } = await client.functions.invoke('gemini-proxy', { body });

    if (error) {
      // supabase-js wraps a non-2xx invoke in a FunctionsHttpError whose
      // `.context` is the raw Response — read the JSON body for the real reason.
      return {
        text: '',
        error: await extractFunctionErrorMessage(error, 'Gemini proxy request failed'),
      };
    }

    const payload = (data ?? null) as GeminiApiPayload | null;

    if (payload?.error) {
      return {
        text: '',
        error: payload.error.message || 'Gemini API error',
        errorStatus: payload.error.status,
      };
    }

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) {
      return { text: '', error: 'Gemini returned no content' };
    }

    return { text };
  } catch (err) {
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling Gemini API',
    };
  }
}
