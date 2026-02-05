-- ============================================================================
-- SECURITY FIX: Prevent Role Self-Escalation
-- ============================================================================

-- Create function to protect sensitive profile fields
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role TEXT;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role INTO current_user_role FROM profiles WHERE id = current_user_id;

    IF NEW.id = current_user_id AND OLD.role IS DISTINCT FROM NEW.role THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own role';
    END IF;

    IF NEW.id = current_user_id AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own organization';
    END IF;

    IF OLD.role IS DISTINCT FROM NEW.role AND current_user_role != 'admin' THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user roles';
    END IF;

    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id AND current_user_role != 'admin' THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user organizations';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS protect_sensitive_profile_fields_trigger ON profiles;
CREATE TRIGGER protect_sensitive_profile_fields_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_sensitive_profile_fields();
