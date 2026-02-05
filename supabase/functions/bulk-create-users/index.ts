// Edge Function to bulk create user accounts from a list of user data
// Deploy with: supabase functions deploy bulk-create-users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface UserToCreate {
  email: string
  username: string
  role: 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer'
  organization_id?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { users, send_password_reset = true } = await req.json() as {
      users: UserToCreate[]
      send_password_reset?: boolean
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      return errorResponse(req, 'No users provided. Expected array of {email, username, role, organization_id?}', 400)
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

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

        // Check if user already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(u => u.email === user.email)

        if (existingUser) {
          results.push({
            email: user.email,
            success: false,
            error: 'User already exists',
            user_id: existingUser.id
          })
          continue
        }

        // SECURITY: Generate cryptographically secure temporary password
        const tempPassword = crypto.randomUUID()

        // Create auth user - trigger will auto-create profile
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: tempPassword,
          email_confirm: true, // Pre-verify email
          user_metadata: {
            username: user.username,
            role: user.role,
            organization_id: user.organization_id || null
          }
        })

        if (authError) {
          results.push({
            email: user.email,
            success: false,
            // SECURITY: Don't expose detailed error messages
            error: 'Failed to create user'
          })
          console.error(`Error creating user ${user.email}:`, authError)
          continue
        }

        // Optionally send password reset email so user can set their own password
        if (send_password_reset && authData?.user) {
          const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: user.email
          })

          if (resetError) {
            console.warn(`Created user but failed to generate reset link`)
          }
        }

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
        console.error(`Unexpected error creating user ${user.email}:`, err)
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return jsonResponse(req, {
      message: `Created ${successCount} users, ${failCount} failed`,
      results
    })

  } catch (error) {
    // SECURITY: Generic error message, log details server-side
    return errorResponse(
      req,
      'An unexpected error occurred. Please try again.',
      500,
      error
    )
  }
})
