// Edge Function to send password reset codes
// Bypasses corporate email link scanners by using 6-digit codes instead of links

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Generate a 6-digit code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Email template for reset code
function getEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Code - Matrix Portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background: linear-gradient(135deg, rgba(23, 23, 23, 0.98) 0%, rgba(15, 15, 15, 0.98) 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden;">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">Matrix Portal</h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f8fafc;">Password Reset Code</h2>

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3;">
                                You requested to reset your password. Enter this code on the password reset page:
                            </p>

                            <!-- Code Display -->
                            <div style="margin: 32px 0; text-align: center;">
                                <div style="display: inline-block; padding: 20px 40px; font-size: 36px; font-weight: 700; font-family: monospace; letter-spacing: 8px; color: #ffffff; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 12px;">
                                    ${code}
                                </div>
                            </div>

                            <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">
                                This code will expire in <strong style="color: #a3a3a3;">15 minutes</strong>.
                            </p>

                            <!-- Security Notice -->
                            <div style="margin-top: 32px; padding: 16px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #fbbf24;">
                                    <strong>Security Notice:</strong> If you didn't request this code, please ignore this email. Your password will remain unchanged.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #525252;">
                                Need help? Contact support at
                                <a href="mailto:support@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">support@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #404040;">
                                &copy; Matrix Inspection Services. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    // Validate email
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Create Supabase client with service role for admin operations
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

    // Check if user exists in auth.users
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()

    if (userError) {
      console.error('Error checking user:', userError)
      // Don't reveal if user exists or not for security
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists with this email, a reset code has been sent.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userExists = users?.users?.some(u => u.email?.toLowerCase() === normalizedEmail)

    if (!userExists) {
      // Don't reveal that user doesn't exist - security best practice
      console.log('User not found, returning success anyway:', normalizedEmail)
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists with this email, a reset code has been sent.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting: Check for recent codes sent to this email
    const { data: recentCodes } = await supabaseAdmin
      .from('password_reset_codes')
      .select('created_at')
      .eq('email', normalizedEmail)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 1 minute
      .order('created_at', { ascending: false })
      .limit(1)

    if (recentCodes && recentCodes.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Please wait 1 minute before requesting another code.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate code and expiration (15 minutes)
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    // Invalidate any existing unused codes for this email
    await supabaseAdmin
      .from('password_reset_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('email', normalizedEmail)
      .is('used_at', null)

    // Store the new code
    const { error: insertError } = await supabaseAdmin
      .from('password_reset_codes')
      .insert({
        email: normalizedEmail,
        code,
        expires_at: expiresAt
      })

    if (insertError) {
      console.error('Error storing reset code:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to generate reset code. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Matrix Portal <noreply@updates.matrixportal.io>',
        to: [normalizedEmail],
        subject: 'Your Password Reset Code - Matrix Portal',
        html: getEmailHtml(code),
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData)
      // Clean up the code since email failed
      await supabaseAdmin
        .from('password_reset_codes')
        .delete()
        .eq('email', normalizedEmail)
        .eq('code', code)

      return new Response(
        JSON.stringify({ error: 'Failed to send reset code email. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Reset code sent successfully to:', normalizedEmail)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'If an account exists with this email, a reset code has been sent.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-reset-code:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
