# Supabase Integration Setup Guide

This guide will walk you through setting up Supabase for authentication and profile management in the NDT Suite.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Access to your project dashboard

## Step 1: Create a Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: NDT Suite (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your users
5. Wait for the project to be created (2-3 minutes)

## Step 2: Get Your API Credentials

1. In your Supabase dashboard, go to **Settings** > **API**
2. Copy the following values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (under "Project API keys")

## Step 3: Configure the Application

1. Open `src/supabase-client.js` in your code editor
2. Replace the placeholder values with your actual credentials:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co'; // Your Project URL
const SUPABASE_ANON_KEY = 'your-anon-key-here'; // Your anon/public key
```

3. Save the file

## Step 4: Set Up the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Open the `../database/supabase-schema.sql` file from the database folder
4. Copy the entire contents and paste it into the SQL Editor
5. Click "Run" to execute the schema creation
6. You should see "Success. No rows returned" message

## Step 5: Create Your First Admin User

### Option A: Using Supabase Dashboard

1. Go to **Authentication** > **Users** in your Supabase dashboard
2. Click "Add user" > "Create new user"
3. Enter:
   - **Email**: your-admin@yourdomain.com
   - **Password**: Create a strong password
   - **Auto Confirm User**: ✓ (check this box)
4. Click "Create user"
5. Copy the user's UUID (you'll see it in the users list)

6. Go back to **SQL Editor** and run this query (replace the UUID and email):

```sql
INSERT INTO profiles (id, username, email, role, organization_id)
VALUES (
    'PASTE_USER_UUID_HERE',
    'admin',
    'your-admin@yourdomain.com',
    'admin',
    (SELECT id FROM organizations WHERE name = 'SYSTEM')
);
```

### Option B: Using Supabase Auth API

You can also create users programmatically through your application after setup.

## Step 6: Configure Email Authentication (Optional but Recommended)

By default, Supabase uses email confirmation. You can customize this:

1. Go to **Authentication** > **Providers** > **Email**
2. Configure:
   - **Enable Email provider**: ✓
   - **Confirm email**: Choose based on your needs
   - **Secure email change**: Recommended ✓

## Step 7: Test the Integration

1. Start your application
2. Open the browser console and look for:
   - `"Initializing with Supabase backend"` - Supabase is configured correctly
   - `"Initializing with local storage"` - Supabase is not configured (check credentials)

3. Try logging in with your admin credentials
4. Check the browser console for any errors

## Understanding the Dual-Mode System

The application supports **two modes**:

### Supabase Mode (Production)
- When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured
- Uses Supabase Auth for authentication
- Stores user profiles in Supabase database
- Data persists across browsers and devices
- Proper password hashing and security

### Local Mode (Development/Demo)
- When Supabase credentials are not configured
- Uses local IndexedDB storage
- Data only persists in the current browser
- Default admin account: `admin` / `admin123`
- Good for testing without backend

## Database Schema Overview

The schema creates three main tables:

### `organizations`
- Stores organization information
- Each user belongs to one organization

### `profiles`
- Extends Supabase's built-in `auth.users` table
- Stores username, role, and organization assignment
- Automatically created when a new user signs up (via trigger)

### `account_requests`
- Stores pending account requests
- Admins can approve/reject requests

## Row Level Security (RLS)

The schema includes RLS policies that:
- Users can only see data from their organization
- Admins can see all data
- Org admins can manage users in their organization
- Regular users have limited access based on their role

## Troubleshooting

### "Supabase not configured" message
- Check that you've updated `src/supabase-client.js` with your actual credentials
- Make sure there are no extra spaces or quotes in the values
- Restart your development server after making changes

### Login fails with "Invalid credentials"
- Verify the user exists in Supabase Auth (check Authentication > Users)
- Verify the profile exists in the profiles table (check Table Editor > profiles)
- Check that `is_active` is true in the profiles table
- Try resetting the password in Supabase dashboard

### "Profile not found" error
- The profile may not have been created automatically
- Manually create the profile using the SQL query in Step 5
- Check that the trigger `on_auth_user_created` exists (SQL Editor > Functions)

### Can't create new users
- Verify you're logged in as an admin or org_admin
- Check browser console for detailed error messages
- Verify RLS policies are set up correctly

## Security Notes

1. **Never commit your Supabase credentials** to version control
   - Add `src/supabase-client.js` to `.gitignore` if it contains real credentials
   - Use environment variables for production deployments

2. **The anon key is safe to expose** in client-side code
   - RLS policies protect your data
   - Users can only access data they have permission to see

3. **Row Level Security is crucial**
   - Always test RLS policies
   - Never disable RLS on production tables

4. **Admin operations** require the service role key
   - This is handled server-side by Supabase
   - The anon key has limited admin capabilities

## Next Steps

After setup:
1. Create your organization(s)
2. Add team members as users
3. Configure roles and permissions
4. Start using the NDT Suite with cloud-backed authentication!

## Support

For Supabase-specific issues:
- Visit https://supabase.com/docs
- Check https://github.com/supabase/supabase/discussions

For NDT Suite issues:
- Check the application logs in browser console
- Verify your database schema matches `../database/supabase-schema.sql`
