-- Fix RLS policies for inspections table
-- The issue is nested RLS checks blocking permission lookups
-- Solution: Use SECURITY DEFINER function to check vessel access

-- Step 1: Create a SECURITY DEFINER function to check vessel access
-- This function runs with elevated privileges and can bypass RLS on other tables
CREATE OR REPLACE FUNCTION public.user_can_access_vessel(check_vessel_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    vessel_org_id UUID;
    user_org_id UUID;
    is_system_org BOOLEAN;
BEGIN
    -- Get the organization ID for the vessel (via asset)
    SELECT a.organization_id INTO vessel_org_id
    FROM vessels v
    JOIN assets a ON v.asset_id = a.id
    WHERE v.id = check_vessel_id;

    -- If vessel not found, deny access
    IF vessel_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get current user's organization and check if it's SYSTEM
    SELECT p.organization_id, (o.name = 'SYSTEM')
    INTO user_org_id, is_system_org
    FROM profiles p
    LEFT JOIN organizations o ON p.organization_id = o.id
    WHERE p.id = auth.uid();

    -- SYSTEM org has access to everything
    IF is_system_org THEN
        RETURN TRUE;
    END IF;

    -- User's org must match vessel's org
    RETURN user_org_id = vessel_org_id;
END;
$$;

-- Step 2: Drop existing policies on inspections
DROP POLICY IF EXISTS "Users can view inspections for vessels in their org" ON inspections;
DROP POLICY IF EXISTS "Users can create inspections for vessels in their org" ON inspections;
DROP POLICY IF EXISTS "Users can update inspections for vessels in their org" ON inspections;
DROP POLICY IF EXISTS "Users can delete inspections for vessels in their org" ON inspections;

-- Step 3: Re-enable RLS (in case it was disabled)
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- Step 4: Create new policies using the SECURITY DEFINER function
-- SELECT policy
CREATE POLICY "inspections_select_policy"
ON inspections
FOR SELECT
TO authenticated
USING (public.user_can_access_vessel(vessel_id));

-- INSERT policy
CREATE POLICY "inspections_insert_policy"
ON inspections
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_access_vessel(vessel_id));

-- UPDATE policy
CREATE POLICY "inspections_update_policy"
ON inspections
FOR UPDATE
TO authenticated
USING (public.user_can_access_vessel(vessel_id))
WITH CHECK (public.user_can_access_vessel(vessel_id));

-- DELETE policy
CREATE POLICY "inspections_delete_policy"
ON inspections
FOR DELETE
TO authenticated
USING (public.user_can_access_vessel(vessel_id));

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.user_can_access_vessel(TEXT) TO authenticated;

-- Verify: Show policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'inspections';
