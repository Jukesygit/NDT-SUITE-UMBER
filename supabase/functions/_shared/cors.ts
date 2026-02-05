/**
 * Shared CORS configuration for Supabase Edge Functions
 * SECURITY: Restricts CORS to specific allowed origins instead of wildcard
 */

// Get allowed origins from environment variable or use defaults
// Set ALLOWED_ORIGINS in your Supabase project settings as comma-separated list
// Example: "https://yourdomain.com,https://www.yourdomain.com"
const ALLOWED_ORIGINS_ENV = Deno.env.get('ALLOWED_ORIGINS') || '';

// Default allowed origins (update these for your production domain)
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
];

// Parse environment variable or use defaults
const ALLOWED_ORIGINS: string[] = ALLOWED_ORIGINS_ENV
    ? ALLOWED_ORIGINS_ENV.split(',').map(origin => origin.trim())
    : DEFAULT_ALLOWED_ORIGINS;

/**
 * Get CORS headers for a request
 * Returns appropriate Access-Control-Allow-Origin based on request origin
 */
export function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin') || '';

    // Check if origin is in allowed list
    const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
        // Also allow if ALLOWED_ORIGINS contains '*' (for development only)
        ALLOWED_ORIGINS.includes('*');

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
    };
}

/**
 * Handle CORS preflight OPTIONS request
 */
export function handleCorsPreflightRequest(req: Request): Response {
    return new Response('ok', { headers: getCorsHeaders(req) });
}

/**
 * Create a JSON response with proper CORS headers
 */
export function jsonResponse(
    req: Request,
    data: Record<string, unknown>,
    status = 200
): Response {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                ...getCorsHeaders(req),
                'Content-Type': 'application/json',
            },
        }
    );
}

/**
 * Create an error response with proper CORS headers
 * SECURITY: Returns generic error messages to prevent information disclosure
 */
export function errorResponse(
    req: Request,
    message: string,
    status = 400,
    logDetails?: unknown
): Response {
    // Log detailed error server-side only
    if (logDetails) {
        console.error('Error details:', logDetails);
    }

    return jsonResponse(req, { error: message }, status);
}
