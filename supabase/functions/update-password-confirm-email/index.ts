// Edge Function to update password and confirm email for authenticated users
// Used by the password reset link flow to ensure email is marked as confirmed

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
    const { newPassword, accessToken } = await req.json()

    if (!newPassword || typeof newPassword !== 'string') {
      return new Response(
        JSON.stringify({ error: 'New password is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!accessToken || typeof accessToken !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Access token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's access token to verify identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      console.error('Error getting user from token:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please request a new password reset.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use admin client to update password AND confirm email
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        email_confirm: true
      }
    )

    if (updateError) {
      console.error('Error updating password:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update password. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Password updated and email confirmed for user:', user.email)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully. You can now sign in.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in update-password-confirm-email:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
