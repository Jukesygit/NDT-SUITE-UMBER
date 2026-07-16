/**
 * Helpers for surfacing meaningful errors from Supabase Edge Function calls.
 */

/**
 * Extract a human-readable message from a failed `supabase.functions.invoke` call.
 *
 * For a non-2xx response, supabase-js throws a `FunctionsHttpError` whose `.message`
 * is the unhelpful generic string "Edge Function returned a non-2xx status code".
 * The actual server payload (e.g. `{ error: "A user with this email already exists" }`)
 * lives on `.context`, which is the raw `Response`. Read it so the UI can show the
 * real reason instead of the generic message.
 *
 * @param fnError  The `error` returned by `supabase.functions.invoke`.
 * @param fallback Message to use when no specific reason can be recovered.
 */
export async function extractFunctionErrorMessage(fnError: unknown, fallback: string): Promise<string> {
    const context = (fnError as { context?: unknown })?.context;
    if (context && typeof (context as Response).json === 'function') {
        try {
            const body = (await (context as Response).json()) as { error?: string; message?: string };
            if (body?.error) return body.error;
            if (body?.message) return body.message;
        } catch {
            // Response body was not JSON or was already consumed — fall through.
        }
    }
    const message = (fnError as { message?: string })?.message;
    // Skip supabase-js's generic non-2xx string; it tells the user nothing.
    if (message && !/non-2xx status code/i.test(message)) return message;
    return fallback;
}
