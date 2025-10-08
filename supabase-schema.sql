-- NDT Suite Database Schema for Supabase
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard -> SQL Editor)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'org_admin', 'editor', 'viewer')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Account requests table
CREATE TABLE IF NOT EXISTS account_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    requested_role TEXT NOT NULL CHECK (requested_role IN ('admin', 'org_admin', 'editor', 'viewer')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    rejected_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_account_requests_status ON account_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_requests_org ON account_requests(organization_id);

-- Enable Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
-- Admins can see all organizations, others can only see their own
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (
        id IN (
            SELECT organization_id
            FROM profiles
            WHERE id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can create organizations
CREATE POLICY "Only admins can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can update organizations
CREATE POLICY "Only admins can update organizations"
    ON organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can delete organizations
CREATE POLICY "Only admins can delete organizations"
    ON organizations FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for profiles
-- Users can view their own profile and admins/org_admins can view users in their org
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
            )
        )
    );

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admins and org_admins can create users
CREATE POLICY "Admins can create users"
    ON profiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = profiles.organization_id)
            )
        )
    );

-- Admins and org_admins can delete users in their org
CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    USING (
        id != auth.uid() -- Can't delete yourself
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
            )
        )
    );

-- RLS Policies for account_requests
-- Anyone can create account requests (no auth required)
CREATE POLICY "Anyone can create account requests"
    ON account_requests FOR INSERT
    WITH CHECK (true);

-- Admins and org_admins can view requests
CREATE POLICY "Admins can view account requests"
    ON account_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
            )
        )
    );

-- Admins and org_admins can update requests
CREATE POLICY "Admins can update account requests"
    ON account_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
            )
        )
    );

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
        (NEW.raw_user_meta_data->>'organization_id')::UUID
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system organization and admin user
-- Note: You'll need to create the admin user through Supabase Auth first, then update this
INSERT INTO organizations (name) VALUES ('SYSTEM') ON CONFLICT DO NOTHING;
INSERT INTO organizations (name) VALUES ('Demo Organization') ON CONFLICT DO NOTHING;

-- After running this schema, you should:
-- 1. Go to Supabase Auth -> Users and create an admin user
-- 2. Copy that user's UUID
-- 3. Run this SQL to make them an admin:
--    INSERT INTO profiles (id, username, email, role, organization_id)
--    VALUES (
--        'USER_UUID_HERE',
--        'admin',
--        'admin@yourdomain.com',
--        'admin',
--        (SELECT id FROM organizations WHERE name = 'SYSTEM')
--    );
