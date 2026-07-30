import { supabase } from '../../../supabase-client';

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';
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

/** Cached API key — fetched once per session from the edge function */
let cachedApiKey: string | null = null;

/**
 * Fetch the Gemini API key from the authenticated edge function.
 * The key is cached in memory so subsequent calls don't hit the server.
 */
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  if (!supabase) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: {},
  });

  if (error) {
    throw new Error(`Failed to get API key: ${error.message}`);
  }

  if (!data?.apiKey) {
    throw new Error(data?.error || 'No API key returned');
  }

  cachedApiKey = data.apiKey as string;
  return cachedApiKey;
}

/**
 * Call the Gemini API directly using an authenticated API key.
 *
 * The API key is fetched from a lightweight Supabase edge function (auth-gated),
 * then the heavy image payload goes straight to Gemini — no proxy in between.
 */
export async function callGeminiProxy(
  imageParts: GeminiImagePart[],
  prompt: string,
  options: GeminiCallOptions = {},
): Promise<GeminiResponse> {
  try {
    const apiKey = await getApiKey();

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
      contents: [{ parts: contentParts }],
    };
    if (options.generationConfig) {
      body.generationConfig = options.generationConfig;
    }

    const model = options.model || DEFAULT_MODEL;
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      return {
        text: '',
        error: data.error.message || 'Gemini API error',
        errorStatus: data.error.status,
      };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) {
      return { text: '', error: 'Gemini returned no content' };
    }

    return { text };
  } catch (err) {
    // Clear cached key on auth failures so it retries
    if (err instanceof Error && err.message.includes('API key')) {
      cachedApiKey = null;
    }
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling Gemini API',
    };
  }
}
