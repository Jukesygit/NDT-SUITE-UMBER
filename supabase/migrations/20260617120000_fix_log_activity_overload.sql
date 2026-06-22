-- Fix: Drop stale 5-parameter log_activity overload
-- The 20260209 security migration accidentally created a second overloaded
-- log_activity(UUID, TEXT, TEXT, JSONB, UUID) alongside the original 10-param
-- version. PostgreSQL kept both because CREATE OR REPLACE only replaces when
-- signatures match. PostgREST cannot disambiguate the two overloads, so all
-- RPC calls silently fail — breaking activity logging.

-- Drop the broken 5-param overload (references non-existent organization_id column)
DROP FUNCTION IF EXISTS public.log_activity(UUID, TEXT, TEXT, JSONB, UUID);

-- Re-affirm the correct 10-parameter version (idempotent)
CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_category TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO activity_log (
        user_id, user_email, user_name,
        action_type, action_category, description, details,
        entity_type, entity_id, entity_name,
        ip_address, user_agent
    ) VALUES (
        p_user_id, NULL, NULL,
        p_action_type, p_action_category, p_description, p_details,
        p_entity_type, p_entity_id, p_entity_name,
        p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Ensure authenticated users can call it
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INET, TEXT) TO authenticated;
