-- Verification Script for Asset Sharing Setup
-- Run this after completing both migrations

-- 1. Check if tables exist
SELECT
    table_name,
    CASE
        WHEN table_name = 'shared_assets' THEN '✓ Asset sharing table'
        WHEN table_name = 'asset_access_requests' THEN '✓ Access request table'
    END as description
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('shared_assets', 'asset_access_requests')
ORDER BY table_name;

-- 2. Check if functions exist
SELECT
    routine_name as function_name,
    CASE
        WHEN routine_name = 'approve_asset_access_request' THEN '✓ Approves access requests'
        WHEN routine_name = 'reject_asset_access_request' THEN '✓ Rejects access requests'
        WHEN routine_name = 'get_shared_assets_for_organization' THEN '✓ Gets shared assets'
        WHEN routine_name = 'get_organizations_for_shared_asset' THEN '✓ Gets shared orgs'
        WHEN routine_name = 'get_pending_asset_access_requests_for_org' THEN '✓ Gets pending requests'
        WHEN routine_name = 'get_user_asset_access_requests' THEN '✓ Gets user requests'
    END as description
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'approve_asset_access_request',
    'reject_asset_access_request',
    'get_shared_assets_for_organization',
    'get_organizations_for_shared_asset',
    'get_pending_asset_access_requests_for_org',
    'get_user_asset_access_requests'
)
ORDER BY routine_name;

-- 3. Check RLS policies on shared_assets
SELECT
    schemaname,
    tablename,
    policyname,
    CASE
        WHEN cmd = 'SELECT' THEN '✓ View policy'
        WHEN cmd = 'INSERT' THEN '✓ Create policy'
        WHEN cmd = 'UPDATE' THEN '✓ Update policy'
        WHEN cmd = 'DELETE' THEN '✓ Delete policy'
    END as policy_type
FROM pg_policies
WHERE tablename = 'shared_assets'
ORDER BY policyname;

-- 4. Check RLS policies on asset_access_requests
SELECT
    schemaname,
    tablename,
    policyname,
    CASE
        WHEN cmd = 'SELECT' THEN '✓ View policy'
        WHEN cmd = 'INSERT' THEN '✓ Create policy'
        WHEN cmd = 'UPDATE' THEN '✓ Update policy'
    END as policy_type
FROM pg_policies
WHERE tablename = 'asset_access_requests'
ORDER BY policyname;

-- 5. Check table columns for shared_assets
SELECT
    column_name,
    data_type,
    CASE
        WHEN is_nullable = 'NO' THEN 'Required'
        ELSE 'Optional'
    END as required
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'shared_assets'
ORDER BY ordinal_position;

-- 6. Check table columns for asset_access_requests
SELECT
    column_name,
    data_type,
    CASE
        WHEN is_nullable = 'NO' THEN 'Required'
        ELSE 'Optional'
    END as required
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'asset_access_requests'
ORDER BY ordinal_position;

-- 7. Summary check
SELECT
    'Setup Status' as check_type,
    CASE
        WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('shared_assets', 'asset_access_requests')) = 2
        AND (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE '%asset%') >= 6
        THEN '✓ COMPLETE - All tables and functions created successfully!'
        ELSE '✗ INCOMPLETE - Please run both migration scripts'
    END as status;
