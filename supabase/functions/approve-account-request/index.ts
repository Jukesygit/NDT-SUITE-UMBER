// Edge Function to handle account request approvals
// Uses admin auth to create user accounts

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

    console.log('Received approval request:', { request_id, approved_by_user_id })

    // Validate required fields
    if (!request_id || !approved_by_user_id) {
      console.error('Missing required fields')
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
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

    // Fetch the account request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('account_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    console.log('Fetched request:', { request, fetchError })

    if (fetchError || !request) {
      console.error('Request not found:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Request not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate temporary password
    const tempPassword = crypto.randomUUID()

    console.log('Creating user with data:', {
      email: request.email,
      username: request.username,
      role: request.requested_role,
      organization_id: request.organization_id
    })

    // Create user account using admin auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: request.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        username: request.username,
        role: request.requested_role,
        organization_id: request.organization_id
      }
    })

    console.log('User creation result:', { authData: authData?.user?.id, authError })

    if (authError) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({
          error: `Failed to create user: ${authError.message}`,
          details: authError,
          code: authError.code || authError.status
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!authData?.user) {
      console.error('No user data returned from auth.admin.createUser')
      return new Response(
        JSON.stringify({ error: 'Failed to create user: No user data returned' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
      console.error('Error updating request status:', updateError)
    }

    console.log('Account approval completed successfully')

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
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
