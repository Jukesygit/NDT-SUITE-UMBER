-- Fix RLS policy to allow trigger-based profile creation
-- The handle_new_user trigger needs to be able to insert profiles when new auth users are created

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can create users" ON profiles;

-- Create a new policy that allows:
-- 1. Admins and org_admins to create users (authenticated context)
-- 2. System/trigger to create profiles (no auth context, for new user signups)
CREATE POLICY "Allow profile creation"
    ON profiles FOR INSERT
    WITH CHECK (
        -- Allow if no auth context (trigger creating profile for new user)
        auth.uid() IS NULL
        OR
        -- Allow if authenticated user is admin or org_admin
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = profiles.organization_id)
            )
        )
    );
