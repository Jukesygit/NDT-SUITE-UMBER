-- Verification Script - Run this AFTER applying the fix
-- This will confirm the helper functions exist and work

-- 1. Check if helper functions exist
SELECT
    proname as function_name,
    pronargs as num_arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname LIKE 'auth_%'
ORDER BY proname;

-- 2. Test the helper functions (will only work if you're logged in)
SELECT
    public.auth_user_role() as your_role,
    public.auth_is_admin() as is_admin,
    public.auth_is_org_admin() as is_org_admin;

-- 3. Check current policies on profiles table
SELECT
    policyname,
    cmd as operation,
    permissive
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'profiles'
ORDER BY policyname;

-- 4. Test a simple query (should NOT cause recursion)
SELECT COUNT(*) as profile_count FROM profiles;

-- 5. Check if the trigger exists
SELECT
    tgname as trigger_name,
    tgtype
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass
AND tgname = 'check_profile_role_update_trigger';

-- If all queries above complete without errors, the fix is applied correctly!