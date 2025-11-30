# NDT Suite Email Templates

This folder contains professionally designed email templates for the NDT Suite application.

## Available Templates

### 1. **reset-password.html**
Used when users request to reset their forgotten password.
- **Trigger**: Password reset request
- **Supabase Variable**: `{{ .ConfirmationURL }}`
- **Expiry**: 1 hour

### 2. **confirm-signup.html**
Sent to new users to verify their email address after registration.
- **Trigger**: New user signup
- **Supabase Variable**: `{{ .ConfirmationURL }}`
- **Expiry**: 24 hours

### 3. **magic-link.html**
Provides passwordless authentication via email link.
- **Trigger**: Magic link login request
- **Supabase Variable**: `{{ .ConfirmationURL }}`
- **Expiry**: 1 hour

### 4. **change-email.html**
Confirms a user's request to change their account email address.
- **Trigger**: Email change request
- **Supabase Variable**: `{{ .ConfirmationURL }}`
- **Expiry**: 24 hours

### 5. **invite-user.html**
Sent when an admin invites a new user to join their organization.
- **Trigger**: User invitation
- **Supabase Variables**:
  - `{{ .ConfirmationURL }}`
  - `{{ .OrganizationName }}`
- **Expiry**: 7 days

## Supabase Template Variables

All templates use Supabase's Go template syntax:

- `{{ .ConfirmationURL }}` - The action link (required in all templates)
- `{{ .SiteURL }}` - Your application's URL
- `{{ .Token }}` - The confirmation token (if needed separately)
- `{{ .TokenHash }}` - The hashed token (if needed)
- `{{ .OrganizationName }}` - Organization name (for invite emails)

## How to Use These Templates in Supabase

### Step 1: Access Email Templates
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**

### Step 2: Apply Each Template
For each template type:

1. Select the template type (e.g., "Reset Password")
2. Copy the HTML content from the corresponding `.html` file
3. Paste it into the "Email Template" editor in Supabase
4. Click **Save**

### Step 3: Configure Email Provider
Before templates will work, you need to configure your email provider:

1. Go to **Authentication** → **Sign In / Providers**
2. Click on **Email** provider
3. Click **"Configure email provider"**
4. Choose either:
   - **Supabase's default SMTP** (limited, good for testing)
   - **Custom SMTP provider** (recommended for production)

### Recommended SMTP Providers for Production:
- **SendGrid** (99% deliverability, generous free tier)
- **AWS SES** (very cost-effective for high volume)
- **Mailgun** (developer-friendly)
- **Postmark** (excellent deliverability)

## Design Features

All templates include:
- ✅ Dark theme matching NDT Suite's design system
- ✅ Responsive design for mobile devices
- ✅ Professional branding with NDT Suite logo
- ✅ Security warnings where appropriate
- ✅ Clear call-to-action buttons
- ✅ Fallback text links for accessibility
- ✅ Company branding (Matrix Inspection Services)

## Customization

To customize these templates:

1. **Company Information**: Replace "Matrix Inspection Services" and support email
2. **Colors**: Update the color values (currently using blue/indigo palette)
3. **Logo**: The SVG icon can be replaced with your own logo
4. **Copy Text**: Modify the messaging to match your brand voice

## Testing

Before going live:

1. **Test each template** by triggering the corresponding action
2. **Check spam folders** - emails may initially land in spam
3. **Test on multiple email clients** (Gmail, Outlook, Apple Mail)
4. **Verify all links work** and redirect to the correct pages
5. **Check mobile rendering** on different devices

## Troubleshooting

### Emails not sending?
- Verify email provider is configured in Supabase
- Check Supabase Auth logs for errors
- Ensure templates are saved correctly
- Check rate limits haven't been exceeded

### Emails landing in spam?
- Configure SPF, DKIM, and DMARC records
- Use a custom domain for sending
- Warm up your sending domain gradually
- Use a reputable SMTP provider

### Links not working?
- Verify `Site URL` is set correctly in Supabase settings
- Check `Redirect URLs` includes your application domain
- Ensure templates contain `{{ .ConfirmationURL }}`

## Support

For issues with these templates, contact:
- **Email**: support@matrixinspectionservices.com
- **Supabase Docs**: https://supabase.com/docs/guides/auth/auth-email-templates

---

**Created for NDT Suite by Matrix Inspection Services**
