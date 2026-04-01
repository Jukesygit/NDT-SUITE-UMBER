import { supabase } from '../../../supabase-client';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

export interface GeminiImagePart {
  mimeType: string;
  data: string; // base64 encoded image data (without data URL prefix)
}

export interface GeminiResponse {
  text: string;
  error?: string;
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

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentParts }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { text: '', error: data.error.message || 'Gemini API error' };
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
