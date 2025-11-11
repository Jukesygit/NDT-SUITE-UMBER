-- Test Queries for RLS Fix Verification
-- Run these queries after applying all the fixes to ensure everything works correctly

-- ====================
-- PREPARATION
-- ====================

-- First, check if the helper functions exist
SELECT
    p.proname as function_name,
    n.nspname as schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth'
AND p.proname IN ('user_role', 'user_org_id', 'is_admin', 'is_org_admin', 'user_info');

-- ====================
-- TEST 1: Test Helper Functions
-- ====================

-- Test as a regular user (replace with actual user ID)
-- SET LOCAL role TO 'authenticated';
-- SET LOCAL request.jwt.claim.sub TO '<regular_user_id>';

SELECT auth.user_role();           -- Should return user's role
SELECT auth.user_org_id();          -- Should return user's organization ID
SELECT auth.is_admin();             -- Should return false for non-admin
SELECT auth.is_org_admin();         -- Should return false for non-org-admin
SELECT * FROM auth.user_info();     -- Should return user info

-- ====================
-- TEST 2: Profiles Table Access
-- ====================

-- Test 2.1: User viewing own profile
-- Should succeed without recursion error
SELECT * FROM profiles WHERE id = auth.uid();

-- Test 2.2: Count all visible profiles
-- Should NOT cause infinite recursion
SELECT COUNT(*) FROM profiles;

-- Test 2.3: Admin viewing all profiles
-- (Run as admin user)
-- SET LOCAL request.jwt.claim.sub TO '<admin_user_id>';
SELECT COUNT(*) as total_profiles FROM profiles;

-- Test 2.4: Org admin viewing org profiles
-- (Run as org_admin user)
-- SET LOCAL request.jwt.claim.sub TO '<org_admin_user_id>';
SELECT
    p.id,
    p.username,
    p.role,
    p.organization_id
FROM profiles p
WHERE p.organization_id = auth.user_org_id();

-- Test 2.5: Check pending approvals cross-org access
SELECT
    p.username,
    ec.competency_id,
    ec.status
FROM profiles p
JOIN employee_competencies ec ON ec.user_id = p.id
WHERE ec.status = 'pending_approval';

-- ====================
-- TEST 3: Employee Competencies Access
-- ====================

-- Test 3.1: User viewing own competencies
SELECT * FROM employee_competencies WHERE user_id = auth.uid();

-- Test 3.2: Count all competencies (based on role)
SELECT COUNT(*) as visible_competencies FROM employee_competencies;

-- Test 3.3: Check pending approvals
SELECT
    ec.id,
    ec.user_id,
    ec.competency_id,
    ec.status,
    p.username
FROM employee_competencies ec
JOIN profiles p ON p.id = ec.user_id
WHERE ec.status = 'pending_approval';

-- ====================
-- TEST 4: Permission Requests Access
-- ====================

-- Test 4.1: View permission requests
SELECT * FROM permission_requests;

-- Test 4.2: Create a test permission request (as regular user)
-- INSERT INTO permission_requests (user_id, requested_role, reason)
-- VALUES (auth.uid(), 'editor', 'Need edit access for project X');

-- ====================
-- TEST 5: Account Requests Access
-- ====================

-- Test 5.1: View account requests (as admin)
SELECT * FROM account_requests WHERE status = 'pending';

-- ====================
-- TEST 6: Performance Check
-- ====================

-- Check query performance (should be fast, not hanging)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM profiles;

EXPLAIN ANALYZE
SELECT * FROM employee_competencies
WHERE user_id = auth.uid();

-- ====================
-- TEST 7: Complex Queries (Previously Problematic)
-- ====================

-- This query was causing recursion before
SELECT
    p.id,
    p.username,
    p.role,
    o.name as organization_name,
    (SELECT COUNT(*) FROM employee_competencies ec WHERE ec.user_id = p.id) as total_competencies
FROM profiles p
LEFT JOIN organizations o ON o.id = p.organization_id
LIMIT 10;

-- ====================
-- TEST 8: Verify No Recursion in Logs
-- ====================

-- After running all tests, check Supabase logs for any of these errors:
-- - "infinite recursion detected in policy for relation"
-- - "stack depth limit exceeded"
-- - Query timeout errors

-- ====================
-- ROLLBACK TEST (if needed)
-- ====================

-- If any test fails, you can check the specific policy causing issues:
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'employee_competencies', 'permission_requests', 'account_requests')
ORDER BY tablename, policyname;

-- ====================
-- SUCCESS CRITERIA
-- ====================

-- All tests pass if:
-- 1. No "infinite recursion" errors appear
-- 2. All queries return results within 1 second
-- 3. Users can only see data they're authorized to see
-- 4. No stack depth errors in Supabase logs
-- 5. Application functions normally without 500 errors