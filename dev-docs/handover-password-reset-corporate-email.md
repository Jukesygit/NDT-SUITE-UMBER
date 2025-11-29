# Handover: Password Reset Not Working with Corporate Email

## Issue Summary
Password reset emails work with personal email (Gmail) but fail with corporate email addresses (Microsoft 365/Outlook).

## Error
```
http://localhost:5173/login?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
```

## Root Cause
Corporate email security systems (Microsoft Safe Links, ATP) **pre-scan/click links** for security purposes. This consumes the one-time password reset token before the user can click it.

## What We've Done
1. **Fixed redirect URL** - Changed from `/` to `/login` in `auth-manager.js:396`
2. **Added redirect URLs in Supabase** - Added `http://localhost:5173/**` and production URLs
3. **Confirmed works with personal email** - Gmail works fine
4. **Confirmed fails with corporate email** - Token consumed by email scanner

## Files Modified
- `src/auth-manager.js` - Updated `redirectTo` in `resetPassword()` and `signUp()`
- `email-templates/reset-password.html` - Updated branding
- `email-templates/change-email.html` - Updated branding

## Potential Solutions (Not Yet Implemented)

### Option 1: Enable PKCE Flow (Recommended)
PKCE stores a `code_verifier` in the browser that email scanners can't access.
- Check Supabase Dashboard → Authentication → Settings for PKCE option
- May require Supabase client configuration changes

### Option 2: Use OTP Code Instead of Link
Some Supabase versions support 6-digit codes instead of magic links.
- User enters code manually instead of clicking link
- Immune to link scanning

### Option 3: Build Custom Password Reset Flow
Create our own password reset using Supabase Edge Functions:
1. Generate our own token, store in database
2. Send email with token
3. User enters token + new password on a form
4. Edge function validates and updates password

## Current Workaround
Corporate users can:
1. Copy (not click) the link from email
2. Open incognito browser
3. Paste link immediately (before scanner gets it)

## Supabase Config
- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173/**`, `https://matrixportal.io/**`
- Custom SMTP: Resend (`smtp.resend.com`) via `updates.matrixportal.io` subdomain

## Next Steps
1. Check Supabase for PKCE or OTP code options
2. If not available, implement custom password reset flow
3. This is critical for business use since all users will have corporate emails
