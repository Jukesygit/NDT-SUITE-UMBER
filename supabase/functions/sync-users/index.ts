// Edge Function to sync Supabase Auth users with profiles table
// Creates missing profiles for auth users and removes orphaned profiles

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get all auth users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers()

    if (authError) {
      return errorResponse(req, 'Failed to fetch auth users', 500, authError)
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
        const role = metadata.role || 'viewer'
        const organizationId = metadata.organization_id || null

        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.id,
            email: authUser.email,
            username: username,
            role: role,
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
