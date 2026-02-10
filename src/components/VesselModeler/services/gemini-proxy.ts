import { supabase } from '../../../supabase-client.js';

export interface GeminiImagePart {
  mimeType: string;
  data: string; // base64 encoded image data (without data URL prefix)
}

export interface GeminiResponse {
  text: string;
  error?: string;
}

/**
 * Call the Gemini API via the Supabase edge function proxy.
 * Sends image parts and a text prompt, returns the model's text response.
 */
export async function callGeminiProxy(
  imageParts: GeminiImagePart[],
  prompt: string,
): Promise<GeminiResponse> {
  try {
    if (!supabase) {
      return { text: '', error: 'Supabase client not configured' };
    }

    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: {
        imageParts,
        prompt,
      },
    });

    if (error) {
      return {
        text: '',
        error: `Edge function error: ${error.message}`,
      };
    }

    // Handle edge function returning error in response
    if (data?.error) {
      return {
        text: '',
        error: data.error,
      };
    }

    // Edge function already extracts text from Gemini response
    const text = data?.text || '';

    if (!text) {
      return {
        text: '',
        error: 'No text response from Gemini API',
      };
    }

    return { text };
  } catch (err) {
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling Gemini proxy',
    };
  }
}
