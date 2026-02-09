-- ============================================================================
-- CRITICAL SECURITY FIX - Document Access Vulnerability
-- Date: 2026-02-05
-- Issue: Ethical hacker was able to access other users' documents from new account
-- ============================================================================

-- This migration fixes multiple security vulnerabilities identified in the
-- Supabase security audit and penetration testing.

-- ============================================================================
-- PART 1: DISABLE ANONYMOUS SIGN-INS (MUST BE DONE IN SUPABASE DASHBOARD)
-- ============================================================================
--
-- CRITICAL: Go to Supabase Dashboard -> Authentication -> Settings ->
--           User Signups -> Disable "Allow anonymous sign-ins"
--
-- This is the ROOT CAUSE of many vulnerabilities. Anonymous sign-ins allow
-- unauthenticated users to get a session and bypass RLS policies designed
-- for authenticated users.

-- ============================================================================
-- PART 2: FIX PUBLIC STORAGE BUCKETS
-- ============================================================================

-- Make avatars bucket PRIVATE (was public, allowing direct URL access)
UPDATE storage.buckets
SET public = false
WHERE id = 'avatars';

-- Make vessel-images bucket PRIVATE (was public)
UPDATE storage.buckets
SET public = false
WHERE id = 'vessel-images';

-- Verify all buckets are private
DO $$
DECLARE
    public_bucket RECORD;
BEGIN
    FOR public_bucket IN
        SELECT id, name FROM storage.buckets WHERE public = true
    LOOP
        RAISE WARNING 'SECURITY: Bucket % (%) is still public!', public_bucket.name, public_bucket.id;
    END LOOP;
END $$;

-- ============================================================================
-- PART 3: FIX STORAGE RLS POLICIES
-- ============================================================================

-- Drop the dangerous "Anyone can view avatars" policy that grants access to public role
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- Create new secure avatar viewing policy - authenticated users only
CREATE POLICY "Authenticated users can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Fix vessel images policy to require authentication and organization membership
DROP POLICY IF EXISTS "Users can view accessible vessel images" ON storage.objects;

CREATE POLICY "Users can view accessible vessel images"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'vessel-images'
    AND (
        -- Admin can see ALL vessel images (no org restriction)
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Manager can see ALL vessel images (no org restriction)
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'manager'
        )
        OR
        -- Users with org can see own organization's images
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.organization_id IS NOT NULL
            )
            AND (storage.foldername(name))[1] IN (
                SELECT organization_id::text
                FROM profiles
                WHERE id = auth.uid()
            )
        )
        OR
        -- Users with org can see shared assets
        EXISTS (
            SELECT 1 FROM shared_assets sa
            JOIN profiles p ON p.id = auth.uid()
            WHERE p.organization_id IS NOT NULL
            AND sa.shared_with_organization_id = p.organization_id
            AND sa.asset_id = (storage.foldername(name))[2]
        )
    )
);

-- ============================================================================
-- PART 4: FIX COMPETENCY DOCUMENT STORAGE POLICIES
-- ============================================================================

-- Drop and recreate competency document policies with stricter checks
DROP POLICY IF EXISTS "Users can view their own competency documents" ON storage.objects;

CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        -- Admins can see ALL documents (no org restriction)
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        OR
        -- Managers can see ALL documents (no org restriction)
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'manager'
        )
        OR
        -- User can see their own documents (must have org)
        (
            (storage.foldername(name))[2] = auth.uid()::text
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.organization_id IS NOT NULL
            )
        )
        OR
        -- Org admins can see documents from users in their org
        EXISTS (
            SELECT 1 FROM profiles p1
            JOIN profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p1.organization_id IS NOT NULL
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

-- ============================================================================
-- PART 5: FIX RLS POLICIES WITH USING(true) / WITH CHECK(true)
-- ============================================================================

-- Fix activity_log INSERT policy
DROP POLICY IF EXISTS "Allow activity logging" ON activity_log;

CREATE POLICY "Authenticated users can log activity"
ON activity_log FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id IS NOT NULL
    )
);

-- Fix competency_history INSERT policy
DROP POLICY IF EXISTS "competency_history_insert_new" ON competency_history;
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;

CREATE POLICY "Authenticated users with org can insert history"
ON competency_history FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id IS NOT NULL
    )
);

-- Fix email_reminder_log INSERT policy
DROP POLICY IF EXISTS "Service role can insert reminder logs" ON email_reminder_log;

-- Only service role should insert reminder logs (not authenticated users)
-- This policy should be restrictive - only triggered by backend
CREATE POLICY "Only service role can insert reminder logs"
ON email_reminder_log FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================================
-- PART 6: FIX FUNCTION SEARCH PATH VULNERABILITIES
-- ============================================================================

-- Fix get_my_role function
DROP FUNCTION IF EXISTS public.get_my_role();
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT role FROM profiles WHERE id = auth.uid()
    );
END;
$$;

-- Fix get_my_organization_id function
DROP FUNCTION IF EXISTS public.get_my_organization_id();
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    );
END;
$$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
        org_id
    );
    RETURN NEW;
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix approve_permission_request function
DROP FUNCTION IF EXISTS public.approve_permission_request(UUID);
CREATE OR REPLACE FUNCTION public.approve_permission_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
    result JSONB;
BEGIN
    -- Verify caller is admin/org_admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Update the user's role
    UPDATE profiles
    SET role = request_record.requested_role,
        updated_at = NOW()
    WHERE id = request_record.user_id;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request approved');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix reject_permission_request function
DROP FUNCTION IF EXISTS public.reject_permission_request(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
BEGIN
    -- Verify caller is admin/org_admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = NOW(),
        rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix log_competency_change function
CREATE OR REPLACE FUNCTION public.log_competency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            new_value,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            'created',
            NEW.value,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            new_value,
            old_expiry_date,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            CASE
                WHEN NEW.status = 'active' AND OLD.status = 'pending_approval' THEN 'approved'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'updated'
            END,
            OLD.value,
            NEW.value,
            OLD.expiry_date,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            old_expiry_date,
            changed_by
        ) VALUES (
            OLD.id,
            OLD.user_id,
            OLD.competency_id,
            'deleted',
            OLD.value,
            OLD.expiry_date,
            auth.uid()
        );
        RETURN OLD;
    END IF;
END;
$$;

-- Fix get_expiring_competencies function
DROP FUNCTION IF EXISTS public.get_expiring_competencies(INTEGER);
CREATE OR REPLACE FUNCTION public.get_expiring_competencies(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date > NOW()
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    ORDER BY ec.expiry_date ASC;
END;
$$;

-- Fix is_privileged_org_user function
DROP FUNCTION IF EXISTS public.is_privileged_org_user();
CREATE OR REPLACE FUNCTION public.is_privileged_org_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'org_admin', 'manager')
        AND organization_id IS NOT NULL
    );
END;
$$;

-- Fix can_access_vessel function
DROP FUNCTION IF EXISTS public.can_access_vessel(TEXT);
CREATE OR REPLACE FUNCTION public.can_access_vessel(vessel_id_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_org_id UUID;
    user_role TEXT;
    vessel_org_id UUID;
BEGIN
    -- Get current user's organization and role
    SELECT organization_id, role INTO user_org_id, user_role
    FROM profiles WHERE id = auth.uid();

    -- Admins and managers can access ALL vessels
    IF user_role IN ('admin', 'manager') THEN
        RETURN TRUE;
    END IF;

    -- Other users must have organization
    IF user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get vessel's organization
    SELECT a.organization_id INTO vessel_org_id
    FROM vessels v
    JOIN assets a ON v.asset_id = a.id
    WHERE v.id = vessel_id_param;

    -- Check if same org or shared
    RETURN user_org_id = vessel_org_id
        OR EXISTS (
            SELECT 1 FROM shared_assets sa
            JOIN vessels v ON v.asset_id = sa.asset_id
            WHERE v.id = vessel_id_param
            AND sa.shared_with_organization_id = user_org_id
        );
END;
$$;

-- ============================================================================
-- PART 7: ADD ORGANIZATION CHECK TO CRITICAL TABLE POLICIES
-- ============================================================================

-- Recreate profiles SELECT policy to prevent users without org from seeing data
DROP POLICY IF EXISTS "profiles_select_new" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
TO authenticated
USING (
    -- Admin can see ALL profiles (no org restriction)
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR
    -- Manager can see ALL profiles (no org restriction)
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
    OR
    -- Users with org can see their own profile
    (
        id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.organization_id IS NOT NULL
        )
    )
    OR
    -- Org admin can see profiles in same org
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = profiles.organization_id
    )
);

-- Fix employee_competencies SELECT policy
DROP POLICY IF EXISTS "employee_competencies_select_new" ON employee_competencies;
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;

CREATE POLICY "Users can view competencies"
ON employee_competencies FOR SELECT
TO authenticated
USING (
    -- Admin can see ALL competencies (no org restriction)
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR
    -- Manager can see ALL competencies (no org restriction)
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
    OR
    -- Users with org can see their own competencies
    (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.organization_id IS NOT NULL
        )
    )
    OR
    -- Org admin can see competencies of users in same org
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = employee_competencies.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = target.organization_id
    )
);

-- ============================================================================
-- PART 8: REVOKE MATERIALIZED VIEW ACCESS FROM ANONYMOUS
-- ============================================================================

-- Revoke access from anonymous role on competency_comment_summary
REVOKE SELECT ON public.competency_comment_summary FROM anon;
REVOKE SELECT ON public.competency_comment_summary FROM public;

-- Grant only to authenticated
GRANT SELECT ON public.competency_comment_summary TO authenticated;

-- ============================================================================
-- PART 9: VERIFICATION QUERIES
-- ============================================================================

-- Check for any remaining public buckets
SELECT id, name, public
FROM storage.buckets
WHERE public = true;

-- Check for any policies granting access to 'public' or 'anon' role
SELECT
    schemaname,
    tablename,
    policyname,
    roles
FROM pg_policies
WHERE 'anon' = ANY(roles) OR 'public' = ANY(roles::text[]);

-- Check for functions without search_path set
SELECT
    n.nspname as schema,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) NOT LIKE '%search_path%';

-- ============================================================================
-- IMPORTANT MANUAL STEPS REQUIRED:
-- ============================================================================
--
-- 1. DISABLE ANONYMOUS SIGN-INS:
--    Supabase Dashboard -> Authentication -> Settings -> User Signups
--    Uncheck "Allow anonymous sign-ins"
--
-- 2. REGENERATE ANON KEY:
--    Supabase Dashboard -> Settings -> API
--    Click "Regenerate" on the anon key to invalidate any cached anonymous sessions
--
-- 3. REVIEW EXISTING USERS:
--    Check for any users with NULL organization_id that shouldn't have access:
--    SELECT id, username, email, organization_id FROM profiles WHERE organization_id IS NULL;
--
-- 4. ASSIGN ORGANIZATIONS:
--    Update any legitimate users to have proper organization_id:
--    UPDATE profiles SET organization_id = 'your-org-uuid' WHERE id = 'user-id';
--
-- ============================================================================
