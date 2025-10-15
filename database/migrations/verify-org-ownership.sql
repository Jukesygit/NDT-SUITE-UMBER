-- ============================================
-- Verification Queries for Org-Based Ownership
-- ============================================
-- Run these queries after applying the migration to verify everything works

-- 1. Check if SYSTEM organization exists
SELECT id, name, created_at
FROM organizations
WHERE name = 'SYSTEM';
-- Expected: 1 row with SYSTEM organization

-- 2. Check if the helper function exists and works
SELECT is_system_org_user();
-- Expected: true if you're logged in as SYSTEM org user, false otherwise

-- 3. Count assets by organization
SELECT
    o.name as organization_name,
    o.id as organization_id,
    COUNT(a.id) as asset_count
FROM organizations o
LEFT JOIN assets a ON a.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY o.name;
-- Expected: Shows how many assets each organization owns

-- 4. Test the get_accessible_assets function
SELECT * FROM get_accessible_assets();
-- Expected:
-- - If you're SYSTEM org user: see ALL assets from ALL orgs
-- - If you're regular org user: see only your org's assets + shared assets

-- 5. Check which RLS policies are active on assets table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'assets';
-- Expected: Should see "Users can view accessible assets" policy

-- 6. Check RLS policies on related tables
SELECT
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename IN ('vessels', 'strakes', 'scans', 'vessel_images')
ORDER BY tablename, policyname;
-- Expected: Should see SELECT policies for all these tables

-- 7. Test asset visibility (replace with actual user email)
-- This shows what the current user can see
SELECT
    a.id,
    a.name,
    a.organization_id,
    o.name as org_name,
    a.created_by,
    a.created_at
FROM assets a
JOIN organizations o ON a.organization_id = o.id
ORDER BY o.name, a.name;
-- Expected:
-- - SYSTEM org users: see all assets
-- - Regular users: see only their org's assets

-- 8. Verify your current user's organization
SELECT
    p.username,
    p.email,
    p.role,
    o.name as organization_name,
    o.id as organization_id
FROM profiles p
JOIN organizations o ON p.organization_id = o.id
WHERE p.id = auth.uid();
-- Expected: Shows your current user's org membership
