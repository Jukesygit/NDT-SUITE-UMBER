// Edge Function to transfer assets between organizations
// This uses the service role to bypass RLS restrictions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // Parse request body
    const { asset_id, target_organization_id, user_id } = await req.json()

    // Validate required fields
    if (!asset_id || !target_organization_id || !user_id) {
      return errorResponse(req, 'Missing required fields: asset_id, target_organization_id, user_id', 400)
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
      return errorResponse(req, 'User not found', 404)
    }

    // Check if user is in SYSTEM org
    if (userProfile.organizations?.name !== 'SYSTEM') {
      return errorResponse(req, 'Only SYSTEM organization users can transfer assets', 403)
    }

    // Verify asset exists
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('assets')
      .select('id, name, organization_id')
      .eq('id', asset_id)
      .single()

    if (assetError || !asset) {
      return errorResponse(req, 'Asset not found', 404)
    }

    // Check if already in target org
    if (asset.organization_id === target_organization_id) {
      return errorResponse(req, 'Asset is already in this organization', 400)
    }

    // Verify target organization exists
    const { data: targetOrg, error: targetOrgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', target_organization_id)
      .single()

    if (targetOrgError || !targetOrg) {
      return errorResponse(req, 'Target organization not found', 404)
    }

    console.log(`Transferring asset ${asset_id} to org ${target_organization_id}`)

    // Transfer the asset using service role (bypasses RLS)
    const { error: updateError } = await supabaseAdmin
      .from('assets')
      .update({
        organization_id: target_organization_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', asset_id)

    if (updateError) {
      return errorResponse(
        req,
        'Failed to transfer asset. Please try again.',
        500,
        updateError
      )
    }

    console.log(`Asset ${asset_id} successfully transferred`)

    return jsonResponse(req, {
      success: true,
      message: `Asset "${asset.name}" transferred to ${targetOrg.name}`,
      asset_id: asset_id,
      from_organization_id: asset.organization_id,
      to_organization_id: target_organization_id
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
