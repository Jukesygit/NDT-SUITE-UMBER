-- Migration: Fix profile self-update RLS policy
-- Issue: Users getting 500 error when trying to update their own profile
-- Date: 2025-01-15

-- ============================================================================
-- Ensure "Users can update own profile" policy exists
-- ============================================================================

-- Drop if exists to make this idempotent
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate the policy allowing users to update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================================
-- Verify all UPDATE policies on profiles
-- ============================================================================
SELECT
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'UPDATE'
ORDER BY policyname;
