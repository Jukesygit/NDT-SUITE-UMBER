-- Security Fix: Medium-severity vulnerability remediation
-- Date: 2026-02-09
-- Fixes: M8 (profiles SELECT policy too broad), M11 (unvalidated organization_id in handle_new_user)
-- Run this migration on the production database.

-- ============================================================================
-- FIX M8: Profiles SELECT policy — scope visibility by role and organization
-- ============================================================================
-- PROBLEM: The current "Users can view profiles" policy allows admin and manager
-- roles to see ALL profiles globally, while org_admin can see their org's profiles,
-- but regular users (editor, viewer) can ONLY see their own profile. This is both
-- too broad (manager sees everything) and too narrow (editor/viewer can't see
-- colleagues in their own organization, breaking personnel lists and user search).
--
-- FIX: Replace with organization-scoped visibility:
--   - admin: can see ALL profiles (global system administration)
--   - org_admin, manager, editor, viewer: can see profiles in their own organization
--   - Everyone can always see their own profile (regardless of org membership)
--
-- This ensures multi-tenant isolation: users in Org A cannot see users in Org B,
-- unless they are a system admin.
-- ============================================================================

-- Drop the existing policy by exact name from supabase-schema.sql
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- Create the new organization-scoped SELECT policy
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        -- Everyone can always see their own profile
        id = auth.uid()
        OR
        -- Admins can see ALL profiles (global administration)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        OR
        -- Non-admin authenticated users can see profiles in their own organization
        -- This covers org_admin, manager, editor, and viewer roles
        (
            organization_id IS NOT NULL
            AND organization_id = (
                SELECT p.organization_id
                FROM profiles p
                WHERE p.id = auth.uid()
            )
        )
    );


-- ============================================================================
-- FIX M11: Validate organization_id in handle_new_user() trigger
-- ============================================================================
-- PROBLEM: The handle_new_user() trigger accepts any UUID as organization_id from
-- raw_user_meta_data without verifying that the organization actually exists in the
-- organizations table. A malicious user could self-signup via Supabase Auth with
-- an arbitrary organization_id in their metadata, claiming membership in any org.
--
-- FIX: After parsing the organization_id UUID, verify it exists in the organizations
-- table. If it does not exist, set org_id to NULL so the user is created without
-- an organization assignment (an admin can assign them later).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    org_id UUID;
BEGIN
    -- Step 1: Try to parse organization_id from user metadata, default to NULL if invalid
    BEGIN
        org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        org_id := NULL;
    END;

    -- Step 2 (M11 FIX): Validate that the organization actually exists.
    -- Without this check, a user could claim membership in any org by passing
    -- an arbitrary UUID in their signup metadata.
    IF org_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.organizations WHERE id = org_id
        ) THEN
            -- Organization does not exist — clear the org_id to prevent
            -- the user from being associated with a non-existent org.
            -- An administrator can assign the correct organization later.
            RAISE WARNING 'handle_new_user: organization_id % does not exist, setting to NULL for user %', org_id, NEW.id;
            org_id := NULL;
        END IF;
    END IF;

    -- Step 3: Create the profile with validated data
    INSERT INTO public.profiles (id, username, email, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        'viewer',  -- SECURITY: Always default to viewer. Only admin Edge Functions should set elevated roles.
        org_id
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;
