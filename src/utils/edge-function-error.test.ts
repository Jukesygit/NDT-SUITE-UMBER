import { describe, it, expect } from 'vitest';
import { extractFunctionErrorMessage } from './edge-function-error';

/** Build a minimal stand-in for a fetch Response carrying a JSON body. */
function jsonResponse(body: unknown): Response {
    return { json: async () => body } as unknown as Response;
}

describe('extractFunctionErrorMessage', () => {
    it('returns the server `error` field from the response body (FunctionsHttpError shape)', async () => {
        const fnError = {
            message: 'Edge Function returned a non-2xx status code',
            context: jsonResponse({ error: 'A user with this email already exists' }),
        };
        expect(await extractFunctionErrorMessage(fnError, 'fallback')).toBe(
            'A user with this email already exists'
        );
    });

    it('falls back to the `message` field in the body when there is no `error`', async () => {
        const fnError = { context: jsonResponse({ message: 'Boom' }) };
        expect(await extractFunctionErrorMessage(fnError, 'fallback')).toBe('Boom');
    });

    it('uses the fallback (not the generic non-2xx string) when the body has nothing useful', async () => {
        const fnError = {
            message: 'Edge Function returned a non-2xx status code',
            context: jsonResponse({}),
        };
        expect(await extractFunctionErrorMessage(fnError, 'Failed to update login email')).toBe(
            'Failed to update login email'
        );
    });

    it('surfaces a specific error.message when it is not the generic supabase string', async () => {
        const fnError = { message: 'Network unreachable' };
        expect(await extractFunctionErrorMessage(fnError, 'fallback')).toBe('Network unreachable');
    });

    it('uses the fallback when the response body is not valid JSON', async () => {
        const fnError = {
            context: {
                json: async () => {
                    throw new Error('not json');
                },
            } as unknown as Response,
        };
        expect(await extractFunctionErrorMessage(fnError, 'fallback')).toBe('fallback');
    });

    it('uses the fallback when there is no context and no message', async () => {
        expect(await extractFunctionErrorMessage({}, 'fallback')).toBe('fallback');
    });
});
