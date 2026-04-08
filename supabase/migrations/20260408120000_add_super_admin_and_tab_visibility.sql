-- ============================================================================
-- Add Super Admin Role & Tab Visibility Settings
-- ============================================================================

-- 1. Update role CHECK constraints to include 'super_admin'
-- ----------------------------------------------------------------------------

-- profiles table
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'org_admin', 'editor', 'viewer'));

-- account_requests table
ALTER TABLE account_requests DROP CONSTRAINT IF EXISTS account_requests_requested_role_check;
ALTER TABLE account_requests ADD CONSTRAINT account_requests_requested_role_check
  CHECK (requested_role IN ('super_admin', 'admin', 'manager', 'org_admin', 'editor', 'viewer'));

-- permission_requests table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permission_requests') THEN
    EXECUTE 'ALTER TABLE permission_requests DROP CONSTRAINT IF EXISTS permission_requests_requested_role_check';
    EXECUTE 'ALTER TABLE permission_requests ADD CONSTRAINT permission_requests_requested_role_check
      CHECK (requested_role IN (''super_admin'', ''admin'', ''manager'', ''org_admin'', ''editor'', ''viewer''))';

    EXECUTE 'ALTER TABLE permission_requests DROP CONSTRAINT IF EXISTS permission_requests_user_current_role_check';
    EXECUTE 'ALTER TABLE permission_requests ADD CONSTRAINT permission_requests_user_current_role_check
      CHECK (user_current_role IN (''super_admin'', ''admin'', ''manager'', ''org_admin'', ''editor'', ''viewer''))';
  END IF;
END $$;

-- 2. Update RLS policies to include super_admin where admin is referenced
-- ----------------------------------------------------------------------------

-- Organizations: super_admin can view all
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can create organizations" ON organizations;
CREATE POLICY "Only admins can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can update organizations" ON organizations;
CREATE POLICY "Only admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can delete organizations" ON organizations;
CREATE POLICY "Only admins can delete organizations"
  ON organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- Profiles: super_admin can view all
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'admin')
        OR p.role = 'manager'
        OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
      )
    )
  );

-- Profiles: super_admin can create
DROP POLICY IF EXISTS "Admins can create users" ON profiles;
CREATE POLICY "Admins can create users"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin')
        OR role = 'manager'
        OR (role = 'org_admin' AND organization_id = profiles.organization_id)
      )
    )
  );

-- Profiles: super_admin can delete
DROP POLICY IF EXISTS "Admins can delete users" ON profiles;
CREATE POLICY "Admins can delete users"
  ON profiles FOR DELETE
  USING (
    id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'admin')
        OR p.role = 'manager'
        OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
      )
    )
  );

-- Profiles: super_admin can update other users
DROP POLICY IF EXISTS "Admins can update users" ON profiles;
CREATE POLICY "Admins can update users"
  ON profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'org_admin'
      AND p.organization_id = profiles.organization_id
      AND profiles.role NOT IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'manager'
      AND p.organization_id = profiles.organization_id
      AND profiles.role NOT IN ('super_admin', 'admin', 'manager')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'org_admin'
      AND p.organization_id = profiles.organization_id
      AND profiles.role NOT IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'manager'
      AND p.organization_id = profiles.organization_id
      AND profiles.role NOT IN ('super_admin', 'admin', 'manager')
    )
  );

-- Account requests: super_admin can view/update
DROP POLICY IF EXISTS "Admins can view account requests" ON account_requests;
CREATE POLICY "Admins can view account requests"
  ON account_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin')
        OR role = 'manager'
        OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
      )
    )
  );

DROP POLICY IF EXISTS "Admins can update account requests" ON account_requests;
CREATE POLICY "Admins can update account requests"
  ON account_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin')
        OR role = 'manager'
        OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
      )
    )
  );

-- System announcements: super_admin access
DROP POLICY IF EXISTS "Users can view active announcements, admins can view all" ON system_announcements;
CREATE POLICY "Users can view active announcements, admins can view all"
  ON system_announcements FOR SELECT
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can insert announcements" ON system_announcements;
CREATE POLICY "Only admins can insert announcements"
  ON system_announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can update announcements" ON system_announcements;
CREATE POLICY "Only admins can update announcements"
  ON system_announcements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can delete announcements" ON system_announcements;
CREATE POLICY "Only admins can delete announcements"
  ON system_announcements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- 3. Update role escalation protection to include super_admin
-- ----------------------------------------------------------------------------

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

    -- Cannot change your own role
    IF NEW.id = current_user_id AND OLD.role IS DISTINCT FROM NEW.role THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own role';
    END IF;

    -- Cannot change your own organization
    IF NEW.id = current_user_id AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own organization';
    END IF;

    -- Only super_admin and admin can change roles
    IF OLD.role IS DISTINCT FROM NEW.role AND current_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user roles';
    END IF;

    -- Only super_admin can assign/remove super_admin role
    IF (OLD.role = 'super_admin' OR NEW.role = 'super_admin') AND OLD.role IS DISTINCT FROM NEW.role AND current_user_role != 'super_admin' THEN
        RAISE EXCEPTION 'Security violation: Only super admins can assign the super admin role';
    END IF;

    -- Only super_admin and admin can change organizations
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id AND current_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user organizations';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Create Tab Visibility Settings table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tab_visibility_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tab_id TEXT UNIQUE NOT NULL,
    tab_label TEXT NOT NULL,
    is_visible BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE tab_visibility_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read tab visibility settings
CREATE POLICY "Authenticated users can view tab visibility"
  ON tab_visibility_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only super_admin can modify tab visibility settings
CREATE POLICY "Only super admins can update tab visibility"
  ON tab_visibility_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Only super admins can insert tab visibility"
  ON tab_visibility_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Only super admins can delete tab visibility"
  ON tab_visibility_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_tab_visibility_settings_updated_at
    BEFORE UPDATE ON tab_visibility_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default tab visibility settings (all visible by default)
INSERT INTO tab_visibility_settings (tab_id, tab_label, is_visible) VALUES
  ('personnel', 'Personnel', true),
  ('documents', 'Documents', true),
  ('tools', 'Tools', true),
  ('profile', 'Profile', true),
  ('admin', 'Admin', true)
ON CONFLICT (tab_id) DO NOTHING;
