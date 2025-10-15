// Edge Function to approve account requests and send confirmation emails
// This uses the service role to create users and send password reset emails

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { request_id, approved_by_user_id } = await req.json()

    // Validate required fields
    if (!request_id || !approved_by_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: request_id and approved_by_user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client with service role (bypasses RLS)
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

    // Get the account request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('account_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    if (fetchError || !request) {
      console.error('Request fetch error:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already approved
    if (request.status === 'approved') {
      return new Response(
        JSON.stringify({ error: 'Request already approved' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create user account
    const redirectUrl = `${req.headers.get('origin') || 'http://localhost:5173'}/#/reset-password`
    const tempPassword = crypto.randomUUID()

    console.log('Creating user account for:', request.email)

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: request.email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email since it's admin-created
      user_metadata: {
        username: request.username,
        role: request.requested_role,
        organization_id: request.organization_id
      }
    })

    if (authError) {
      console.error('User creation error:', authError)
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${authError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User created successfully:', authData.user.id)

    // Send password reset email using admin API
    console.log('Sending password reset email...')

    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: request.email,
      options: {
        redirectTo: redirectUrl
      }
    })

    if (resetError) {
      console.error('Password reset email error:', resetError)
      // Don't fail the whole operation - user can use "Forgot Password"
      console.warn('User account created but password reset email failed. User can use Forgot Password link.')
    } else {
      console.log('Password reset email sent successfully')
    }

    // Update request status
    const { error: updateError } = await supabaseAdmin
      .from('account_requests')
      .update({
        status: 'approved',
        approved_by: approved_by_user_id,
        approved_at: new Date().toISOString()
      })
      .eq('id', request_id)

    if (updateError) {
      console.error('Request update error:', updateError)
      return new Response(
        JSON.stringify({ error: `User created but failed to update request status: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account created successfully. User will receive an email to set their password.',
        user_id: authData.user.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
