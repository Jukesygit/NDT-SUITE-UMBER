-- SIMPLER ALTERNATIVE: Just mark request as approved without creating auth user
-- This allows you to manually create users through Supabase dashboard
-- Or you can set up a Supabase Edge Function later for full automation

-- For now, let's just fix the immediate issue by using Supabase's built-in auth.signup
-- You'll need to call this from client using signUp, not admin.createUser

-- Alternative approach: Use a webhook or Edge Function
-- Create this Edge Function at: supabase/functions/approve-account-request/index.ts

/*
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { requestId, password } = await req.json()

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get request
  const { data: request } = await supabaseAdmin
    .from('account_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  // Create auth user
  const { data: authData, error } = await supabaseAdmin.auth.admin.createUser({
    email: request.email,
    password: password,
    email_confirm: true,
    user_metadata: {
      username: request.username,
      role: request.requested_role,
      organization_id: request.organization_id
    }
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }))
  }

  // Update request
  await supabaseAdmin
    .from('account_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', requestId)

  return new Response(JSON.stringify({ success: true }))
})
*/

-- For immediate fix: Update the client code to use signUp instead of admin.createUser
