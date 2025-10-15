// Edge Function to transfer assets between organizations
// This uses the service role to bypass RLS restrictions

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
    const { asset_id, target_organization_id, user_id } = await req.json()

    // Validate required fields
    if (!asset_id || !target_organization_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: asset_id, target_organization_id, user_id' }),
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

    // Verify user is in SYSTEM organization
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, organizations(name)')
      .eq('id', user_id)
      .single()

    if (profileError || !userProfile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is in SYSTEM org
    if (userProfile.organizations?.name !== 'SYSTEM') {
      return new Response(
        JSON.stringify({ error: 'Only SYSTEM organization users can transfer assets' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify asset exists
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('assets')
      .select('id, name, organization_id')
      .eq('id', asset_id)
      .single()

    if (assetError || !asset) {
      return new Response(
        JSON.stringify({ error: 'Asset not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already in target org
    if (asset.organization_id === target_organization_id) {
      return new Response(
        JSON.stringify({ error: 'Asset is already in this organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify target organization exists
    const { data: targetOrg, error: targetOrgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', target_organization_id)
      .single()

    if (targetOrgError || !targetOrg) {
      return new Response(
        JSON.stringify({ error: 'Target organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Transferring asset ${asset_id} from org ${asset.organization_id} to org ${target_organization_id}`)

    // Transfer the asset using service role (bypasses RLS)
    const { error: updateError } = await supabaseAdmin
      .from('assets')
      .update({
        organization_id: target_organization_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', asset_id)

    if (updateError) {
      console.error('Asset transfer error:', updateError)
      return new Response(
        JSON.stringify({ error: `Failed to transfer asset: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Asset ${asset_id} successfully transferred to org ${target_organization_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Asset "${asset.name}" transferred to ${targetOrg.name}`,
        asset_id: asset_id,
        from_organization_id: asset.organization_id,
        to_organization_id: target_organization_id
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
