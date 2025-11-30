// Edge Function to handle account request submissions
// This bypasses RLS by using the service role and allows anonymous submissions

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
    const { username, email, organization_id, requested_role, message } = await req.json()

    // Validate required fields
    if (!username || !email || !organization_id || !requested_role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate requested_role is one of the allowed values
    const allowedRoles = ['admin', 'manager', 'org_admin', 'editor', 'viewer']
    if (!allowedRoles.includes(requested_role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate username length
    if (username.length < 3 || username.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Username must be between 3 and 50 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate message length (if provided)
    if (message && message.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Message too long (max 500 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role (bypasses RLS)
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

    // Insert account request
    const { data, error } = await supabaseAdmin
      .from('account_requests')
      .insert({
        username,
        email,
        requested_role,
        organization_id,
        message: message || ''
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({ success: true, request: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
