// Edge Function to sync Supabase Auth users with profiles table
// Creates missing profiles for auth users and removes orphaned profiles

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
      console.error('Error fetching auth users:', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch auth users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authUsers = authData?.users || []

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const profileIds = new Set((profiles || []).map(p => p.id))
    const authUserIds = new Set(authUsers.map(u => u.id))

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
          console.error('Error creating profile for', authUser.email, ':', insertError)
          results.errors.push(`Failed to create profile for ${authUser.email}: ${insertError.message}`)
        } else {
          console.log('Created profile for:', authUser.email)
          results.createdProfiles.push(authUser.email || authUser.id)
        }
      }
    }

    // Optionally: Remove orphaned profiles (profiles without auth users)
    // Uncomment if you want to auto-delete orphaned profiles
    /*
    for (const profile of (profiles || [])) {
      if (!authUserIds.has(profile.id)) {
        const { error: deleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', profile.id)

        if (deleteError) {
          results.errors.push(`Failed to delete orphaned profile ${profile.email}: ${deleteError.message}`)
        } else {
          results.deletedOrphanedProfiles.push(profile.email || profile.id)
        }
      }
    }
    */

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync complete. Created ${results.createdProfiles.length} profiles.`,
        ...results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error in sync-users:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
