-- Fix the handle_new_user trigger to handle organization_id more gracefully
-- This ensures that user creation doesn't fail if organization_id is missing or invalid

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    org_id UUID;
BEGIN
    -- Try to parse organization_id, default to NULL if invalid
    BEGIN
        org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        org_id := NULL;
    END;

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
        -- Log the error but don't fail the auth user creation
        RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
