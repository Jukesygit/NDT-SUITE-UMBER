// Edge Function to handle account request approvals
// Uses admin auth to create user accounts
// SECURITY: Requires admin authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { canGrantRole } from '../_shared/role-rank.ts'
import { logAuditEvent, maskEmail } from '../_shared/audit.ts'

// SECURITY (audit L7): approval used to silently overwrite a pre-existing
// account whose email matched the request — an anonymous self-submitted request
// could rewrite a live user's username, role and organization_id. Approval now
// refuses on conflict and the admin resolves it explicitly.
const ACCOUNT_CONFLICT_MESSAGE =
  'An account already exists for this email address. Approval was refused so the existing user is not overwritten — reject this request and update the user directly instead.'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    // Parse request body
    const { request_id } = await req.json()

    // Use authenticated user's ID as approver (not from request body - prevents spoofing)
    const approved_by_user_id = auth.user!.id

    console.log('Received approval request:', { request_id, approved_by_user_id })

    // Validate required fields
    if (!request_id) {
      console.error('Missing required fields')
      return errorResponse(req, 'Missing required field: request_id', 400)
    }

    // Fetch the account request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('account_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    console.log('Fetched request:', { request: !!request, fetchError: !!fetchError })

    if (fetchError || !request) {
      return errorResponse(req, 'Request not found', 404, fetchError)
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return errorResponse(req, `Request has already been ${request.status}`, 400)
    }

    // SECURITY: Validate role against allowlist at runtime. 'manager' is listed so
    // an approved manager request is not silently downgraded to viewer — the
    // canGrantRole check below is the actual privilege control, not this list.
    const VALID_ROLES = ['admin', 'manager', 'org_admin', 'editor', 'viewer']
    const validatedRole = VALID_ROLES.includes(request.requested_role) ? request.requested_role : 'viewer'

    // SECURITY: approval mints a real account, so it is a role GRANT and must obey
    // the same rank rules as create-user/bulk-create-users. Without this an admin
    // could approve a request asking for 'admin' and mint a peer; admin and
    // super_admin may only be granted by a super_admin, manager by admin or above.
    const callerRole = auth.user!.role
    if (!canGrantRole(callerRole, validatedRole)) {
      return errorResponse(
        req,
        'You are not permitted to grant the role this request asks for. A higher-privileged administrator must approve it.',
        403
      )
    }

    const requestEmail = String(request.email ?? '').toLowerCase().trim()

    // SECURITY (audit L7): refuse rather than overwrite. Targeted lookup, not
    // listUsers (which has pagination issues).
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', requestEmail)
      .maybeSingle()

    if (existingProfileError) {
      return errorResponse(
        req,
        'Failed to check for an existing account. Please try again.',
        500,
        existingProfileError
      )
    }

    if (existingProfile) {
      // The request stays 'pending' so an admin can reject it explicitly and
      // the conflict remains visible in the queue.
      return errorResponse(req, ACCOUNT_CONFLICT_MESSAGE, 409)
    }

    // SECURITY: Generate cryptographically secure temporary password
    const tempPassword = crypto.randomUUID()

    // Create user account using admin auth
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: requestEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        username: request.username,
        role: validatedRole,
        organization_id: request.organization_id
      }
    })

    if (createError) {
      // An auth user can exist without a matching profile row (orphan), so the
      // profile check above can miss it. Report GoTrue's duplicate-email
      // rejection as the same conflict instead of a generic failure.
      const createMessage = (createError.message || '').toLowerCase()
      const isDuplicateEmail =
        createMessage.includes('already') &&
        (createMessage.includes('registered') || createMessage.includes('exists'))

      if (isDuplicateEmail) {
        return errorResponse(req, ACCOUNT_CONFLICT_MESSAGE, 409, createError)
      }

      return errorResponse(
        req,
        'Failed to create user. Please try again.',
        400,
        createError
      )
    }

    if (!authData?.user) {
      console.error('No user data returned from auth.admin.createUser')
      return errorResponse(req, 'Failed to create user. Please try again.', 500)
    }

    const userId: string = authData.user.id

    // SECURITY: The handle_new_user trigger always sets role='viewer'.
    // Set the actual requested role via a direct profile update using service_role.
    if (validatedRole !== 'viewer') {
      await supabaseAdmin
        .from('profiles')
        .update({ role: validatedRole })
        .eq('id', userId)
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

    // Audit log: forgery-proof record with JWT-verified actor (never client-supplied)
    await logAuditEvent(supabaseAdmin, {
      actorId: auth.user!.id,
      actorRole: auth.user!.role,
      organizationId: request.organization_id,
      actionType: 'account_request_approved',
      category: 'admin',
      description: 'Account request approved',
      entityType: 'account_request',
      entityId: request_id,
      entityName: request.username,
      details: {
        granted_role: validatedRole,
        organization_id: request.organization_id,
        // Approval now only ever creates a new account; a pre-existing one is
        // refused with 409 above rather than overwritten (audit L7).
        created_new_user: true,
        email_masked: maskEmail(requestEmail),
      },
    })

    return jsonResponse(req, {
      success: true,
      message: 'Account created successfully. You can now send the user a password reset link via the Supabase dashboard or have them use "Forgot Password" on the login page.',
      user_id: userId
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
