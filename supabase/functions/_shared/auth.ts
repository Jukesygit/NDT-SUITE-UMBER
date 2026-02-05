/**
 * Shared authentication helpers for Supabase Edge Functions
 * SECURITY: Validates JWT tokens and checks user roles before allowing operations
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { errorResponse } from './cors.ts'

export interface AuthResult {
  authenticated: boolean
  user: {
    id: string
    email: string
    role: string
    organization_id: string | null
  } | null
  error: string | null
  supabaseAdmin: SupabaseClient | null
}

/**
 * Verify the Authorization header contains a valid JWT and extract user info
 * Returns user details including role from profiles table
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      user: null,
      error: 'Missing or invalid Authorization header',
      supabaseAdmin: null
    }
  }

  const token = authHeader.replace('Bearer ', '')

  // Create admin client for verification
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify the JWT token
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return {
      authenticated: false,
      user: null,
      error: 'Invalid or expired token',
      supabaseAdmin: null
    }
  }

  // Get user's role from profiles table
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      authenticated: false,
      user: null,
      error: 'User profile not found',
      supabaseAdmin: null
    }
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email || '',
      role: profile.role,
      organization_id: profile.organization_id
    },
    error: null,
    supabaseAdmin
  }
}

/**
 * Check if user has admin role
 */
export function isAdmin(role: string): boolean {
  return role === 'admin'
}

/**
 * Check if user has org_admin or higher role
 */
export function isOrgAdminOrHigher(role: string): boolean {
  return ['admin', 'org_admin'].includes(role)
}

/**
 * Check if user has editor or higher role
 */
export function isEditorOrHigher(role: string): boolean {
  return ['admin', 'org_admin', 'editor'].includes(role)
}

/**
 * Require admin authentication - returns error response if not authorized
 * Use this at the start of admin-only functions
 */
export async function requireAdmin(req: Request): Promise<{ auth: AuthResult; errorResponse?: Response }> {
  const auth = await verifyAuth(req)

  if (!auth.authenticated) {
    return {
      auth,
      errorResponse: errorResponse(req, auth.error || 'Authentication required', 401)
    }
  }

  if (!isAdmin(auth.user!.role)) {
    return {
      auth,
      errorResponse: errorResponse(req, 'Admin access required', 403)
    }
  }

  return { auth }
}

/**
 * Require org_admin or higher authentication
 */
export async function requireOrgAdmin(req: Request): Promise<{ auth: AuthResult; errorResponse?: Response }> {
  const auth = await verifyAuth(req)

  if (!auth.authenticated) {
    return {
      auth,
      errorResponse: errorResponse(req, auth.error || 'Authentication required', 401)
    }
  }

  if (!isOrgAdminOrHigher(auth.user!.role)) {
    return {
      auth,
      errorResponse: errorResponse(req, 'Organization admin access required', 403)
    }
  }

  return { auth }
}

/**
 * Require any authenticated user
 */
export async function requireAuth(req: Request): Promise<{ auth: AuthResult; errorResponse?: Response }> {
  const auth = await verifyAuth(req)

  if (!auth.authenticated) {
    return {
      auth,
      errorResponse: errorResponse(req, auth.error || 'Authentication required', 401)
    }
  }

  return { auth }
}

/**
 * Verify a cron/system secret for internal-only functions
 * Set CRON_SECRET in your Supabase project secrets
 */
export function verifyCronSecret(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured')
    return false
  }

  const providedSecret = req.headers.get('x-cron-secret')
  return providedSecret === cronSecret
}
