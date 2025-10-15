# Supabase Edge Functions

## Deploying the Edge Function

To deploy the `submit-account-request` edge function:

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
