// Edge Function to bulk create user accounts from a list of user data
// SECURITY: Requires admin authentication
// Deploy with: supabase functions deploy bulk-create-users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'

interface UserToCreate {
  email: string
  username: string
  role: 'admin' | 'org_admin' | 'editor' | 'viewer'
  organization_id?: string
}

// SECURITY: Runtime role allowlist (TypeScript types are not enforced at runtime)
const VALID_ROLES = ['admin', 'org_admin', 'editor', 'viewer']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    const { users, send_password_reset = true } = await req.json() as {
      users: UserToCreate[]
      send_password_reset?: boolean
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      return errorResponse(req, 'No users provided. Expected array of {email, username, role, organization_id?}', 400)
    }

    // SECURITY: Limit bulk creation to prevent abuse
    if (users.length > 50) {
      return errorResponse(req, 'Maximum 50 users per bulk operation', 400)
    }

    // Build a set of existing emails using a single query (not listUsers which has pagination issues)
    const emailList = users.map(u => u.email?.toLowerCase()).filter(Boolean)
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .in('email', emailList)
    const existingEmails = new Set((existingProfiles || []).map(p => p.email?.toLowerCase()))

    const results: Array<{ email: string; success: boolean; error?: string; user_id?: string }> = []

    for (const user of users) {
      try {
        // Validate required fields
        if (!user.email || !user.username || !user.role) {
          results.push({
            email: user.email || 'unknown',
            success: false,
            error: 'Missing required fields: email, username, role'
          })
          continue
        }

        // SECURITY: Validate role against allowlist at runtime
        const validatedRole = VALID_ROLES.includes(user.role) ? user.role : 'viewer'

        // Check if user already exists using pre-fetched set
        if (existingEmails.has(user.email.toLowerCase())) {
          results.push({
            email: user.email,
            success: false,
            error: 'User already exists'
          })
          continue
        }

        // SECURITY: Generate cryptographically secure temporary password
        const tempPassword = crypto.randomUUID()

        // Create auth user - trigger will auto-create profile with role='viewer'
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: tempPassword,
          email_confirm: true, // Pre-verify email
          user_metadata: {
            username: user.username,
            role: validatedRole,
            organization_id: user.organization_id || null
          }
        })

        if (createError) {
          results.push({
            email: user.email,
            success: false,
            error: 'Failed to create user'
          })
          continue
        }

        // SECURITY: The handle_new_user trigger always sets role='viewer'.
        // Set the actual requested role via a direct profile update using service_role.
        if (authData?.user && validatedRole !== 'viewer') {
          await supabaseAdmin
            .from('profiles')
            .update({ role: validatedRole })
            .eq('id', authData.user.id)
        }

        // Optionally send password reset email so user can set their own password
        if (send_password_reset && authData?.user) {
          const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: user.email
          })

          if (resetError) {
            console.warn('Created user but failed to generate reset link')
          }
        }

        // Track newly created email to prevent duplicates within same batch
        existingEmails.add(user.email.toLowerCase())

        results.push({
          email: user.email,
          success: true,
          user_id: authData?.user?.id
        })

      } catch (err) {
        results.push({
          email: user.email,
          success: false,
          error: 'Unexpected error creating user'
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return jsonResponse(req, {
      message: `Created ${successCount} users, ${failCount} failed`,
      results
    })

  } catch (error) {
    return errorResponse(
      req,
      'An unexpected error occurred. Please try again.',
      500,
      error
    )
  }
})
