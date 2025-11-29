# Supabase Edge Functions

## Available Functions

| Function | Description |
|----------|-------------|
| `submit-account-request` | Handle anonymous account request submissions |
| `approve-account-request` | Process account request approvals |
| `transfer-asset` | Handle asset transfers between users |
| `send-email` | Send transactional emails via Resend |

---

## Deploying Edge Functions

### Prerequisites

1. Install the Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref cngschckqhfpwjcvsbad
```

### Deploy All Functions
```bash
supabase functions deploy
```

### Deploy Individual Function
```bash
supabase functions deploy send-email
supabase functions deploy submit-account-request
```

---

## Function: send-email

Sends transactional emails via Resend API.

### Setup

1. **Add Resend API Key as Secret:**
```bash
supabase secrets set RESEND_API_KEY=re_AmFX7KEW...your_full_key
```

2. **Deploy the function:**
```bash
supabase functions deploy send-email
```

### Usage

```javascript
import { sendEmail, sendCompetencyExpirationNotification } from './services/email-service';

// Simple email
await sendEmail({
    to: 'user@example.com',
    subject: 'Hello',
    html: '<h1>Hello World</h1>',
});

// Competency expiration notification
await sendCompetencyExpirationNotification({
    recipientEmail: 'user@example.com',
    recipientName: 'John Smith',
    competency: {
        name: 'NDT Level II',
        expiryDate: '2025-02-15',
    },
    daysUntilExpiry: 30,
});
```

### Security
- Requires authenticated user (Bearer token)
- API key stored as Supabase secret (never exposed to client)

---

## Function: submit-account-request

Handle anonymous account request submissions (bypasses RLS).

1. Install the Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref cngschckqhfpwjcvsbad
```

4. Deploy the function:
```bash
supabase functions deploy submit-account-request
```

## Testing the Function

After deployment, the function will be available at:
```
https://cngschckqhfpwjcvsbad.supabase.co/functions/v1/submit-account-request
```

Test it with curl:
```bash
curl -X POST https://cngschckqhfpwjcvsbad.supabase.co/functions/v1/submit-account-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "organization_id": "f5e9c09a-d7ff-4845-996d-93f6e5986c4d",
    "requested_role": "viewer",
    "message": "Test request"
  }'
```

## Why We Need This

The Edge Function bypasses Row Level Security (RLS) restrictions by using the service role key, allowing anonymous users to submit account requests without authentication.
