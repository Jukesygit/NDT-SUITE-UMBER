// Edge Function to sync Supabase Auth users with profiles table
// Creates missing profiles for auth users and removes orphaned profiles
// SECURITY: Requires admin authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    // Get all auth users
    const { data: authData, error: authError2 } = await supabaseAdmin.auth.admin.listUsers()

    if (authError2) {
      return errorResponse(req, 'Failed to fetch auth users', 500, authError2)
    }

    const authUsers = authData?.users || []

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')

    if (profilesError) {
      return errorResponse(req, 'Failed to fetch profiles', 500, profilesError)
    }

    const profileIds = new Set((profiles || []).map(p => p.id))

    const results = {
      authUsersCount: authUsers.length,
      profilesCount: profiles?.length || 0,
      createdProfiles: [] as string[],
      deletedOrphanedProfiles: [] as string[],
      errors: [] as string[]
    }

    // Create profiles for auth users that don't have one
    for (const authUser of authUsers) {
      if (!profileIds.has(authUser.id)) {
        const metadata = authUser.user_metadata || {}
        const username = metadata.username || authUser.email?.split('@')[0] || 'user'
        const organizationId = metadata.organization_id || null

        // SECURITY: user_metadata is client-controllable, so it must never
        // decide a role. Recreated profiles always start as 'viewer', mirroring
        // the handle_new_user trigger; elevate deliberately afterwards.
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.id,
            email: authUser.email,
            username: username,
            role: 'viewer',
            organization_id: organizationId,
            is_active: true
          })

        if (insertError) {
          // SECURITY: Don't expose email in error messages
          console.error('Error creating profile:', insertError)
          results.errors.push(`Failed to create profile for user`)
        } else {
          console.log('Created profile for user:', authUser.id)
          results.createdProfiles.push(authUser.id)
        }
      }
    }

    await logAuditEvent(supabaseAdmin, {
      actorId: auth.user!.id,
      actorRole: auth.user!.role,
      organizationId: auth.user!.organization_id,
      actionType: 'user_sync_run',
      category: 'admin',
      description: `User sync run: ${results.authUsersCount} auth users, ${results.profilesCount} profiles, ${results.createdProfiles.length} profiles created.`,
      details: {
        auth_users_count: results.authUsersCount,
        profiles_count: results.profilesCount,
        created_profiles_count: results.createdProfiles.length
      }
    })

    return jsonResponse(req, {
      success: true,
      message: `Sync complete. Created ${results.createdProfiles.length} profiles.`,
      ...results
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
