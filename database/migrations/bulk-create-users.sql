-- Bulk Create Users Script
-- Run this in Supabase SQL Editor to create auth users from existing profile data
-- NOTE: This requires the service_role key or running from Edge Function

-- ============================================================================
-- OPTION 1: If you have emails stored elsewhere (spreadsheet, temp table, etc.)
-- Create a temporary table and insert your user data:
-- ============================================================================

-- Step 1: Create temp table with your user data
CREATE TEMP TABLE users_to_create (
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    organization_id UUID
);

-- Step 2: Insert your users (replace with your actual data)
-- Example:
-- INSERT INTO users_to_create (email, username, role, organization_id) VALUES
-- ('john@example.com', 'john_doe', 'editor', 'your-org-uuid-here'),
-- ('jane@example.com', 'jane_smith', 'viewer', 'your-org-uuid-here'),
-- ('bob@example.com', 'bob_jones', 'org_admin', 'your-org-uuid-here');

-- ============================================================================
-- IMPORTANT: The actual user creation must be done via Supabase Auth Admin API
-- You cannot create auth.users directly via SQL.
-- Use one of these methods:
-- ============================================================================

-- Method A: Deploy the Edge Function
-- 1. Run: supabase functions deploy bulk-create-users
-- 2. Call from your app: authManager.bulkCreateUsers(users)

-- Method B: Use Supabase Dashboard
-- 1. Go to Authentication > Users
-- 2. Click "Add User" for each user
-- 3. Enable "Auto confirm" to pre-verify email
-- 4. The trigger will auto-create their profile

-- Method C: Use supabase-js Admin Client (Node.js script)
-- See: database/scripts/bulk-create-users.js

-- ============================================================================
-- VERIFICATION: Check if profiles were created correctly
-- ============================================================================

-- View all profiles
SELECT p.id, p.username, p.email, p.role, o.name as organization
FROM profiles p
LEFT JOIN organizations o ON p.organization_id = o.id
ORDER BY p.created_at DESC;

-- Find users without profiles (orphaned auth users)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Find emails that need accounts created
-- (If you have a staging table with emails)
-- SELECT email FROM your_staging_table
-- WHERE email NOT IN (SELECT email FROM auth.users);
