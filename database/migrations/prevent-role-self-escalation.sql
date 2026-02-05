-- ============================================================================
-- SECURITY FIX: Prevent Role Self-Escalation
-- ============================================================================
-- This migration prevents users from changing their own role or organization,
-- which would allow privilege escalation attacks.
--
-- RUN THIS IMMEDIATELY IN SUPABASE SQL EDITOR
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS protect_sensitive_profile_fields_trigger ON profiles;
DROP FUNCTION IF EXISTS protect_sensitive_profile_fields();

-- Create function to protect sensitive profile fields
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role TEXT;
    current_user_id UUID;
BEGIN
    -- Get current user's ID and role
    current_user_id := auth.uid();

    -- If no auth context (system/trigger), allow the update
    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get current user's role
    SELECT role INTO current_user_role
    FROM profiles
    WHERE id = current_user_id;

    -- RULE 1: Users cannot change their own role
    IF NEW.id = current_user_id THEN
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            RAISE EXCEPTION 'Security violation: Cannot change your own role';
        END IF;
        -- Users also cannot change their own organization
        IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
            RAISE EXCEPTION 'Security violation: Cannot change your own organization';
        END IF;
    END IF;

    -- RULE 2: Only admins can change anyone's role
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF current_user_role != 'admin' THEN
            RAISE EXCEPTION 'Security violation: Only admins can change user roles';
        END IF;
    END IF;

    -- RULE 3: Only admins can change anyone's organization
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
        IF current_user_role != 'admin' THEN
            RAISE EXCEPTION 'Security violation: Only admins can change user organizations';
        END IF;
    END IF;

    -- RULE 4: Prevent deactivating yourself
    IF NEW.id = current_user_id THEN
        IF OLD.is_active = true AND NEW.is_active = false THEN
            RAISE EXCEPTION 'Security violation: Cannot deactivate your own account';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
CREATE TRIGGER protect_sensitive_profile_fields_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_sensitive_profile_fields();

-- ============================================================================
-- VERIFICATION: Test the trigger works
-- ============================================================================
-- Run this to verify (it should fail with "Cannot change your own role"):
--
-- UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
--
-- Expected error: "Security violation: Cannot change your own role"

-- ============================================================================
-- Grant execute permission
-- ============================================================================
GRANT EXECUTE ON FUNCTION protect_sensitive_profile_fields() TO authenticated;

-- Log that migration was applied
DO $$
BEGIN
    RAISE NOTICE 'Security fix applied: Users can no longer change their own role or organization';
END $$;
