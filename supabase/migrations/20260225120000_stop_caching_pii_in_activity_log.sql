-- Stop caching PII (email, username) in activity_log rows.
-- Columns remain for backward compat but are no longer populated.
-- Display names are resolved via JOIN at read time.

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
