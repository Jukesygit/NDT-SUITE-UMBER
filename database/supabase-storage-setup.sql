-- ============================================
-- NDT Suite - Supabase Storage Buckets Setup
-- ============================================
-- This script creates storage buckets for 3D models, images, and scan data

-- ============================================
-- CREATE STORAGE BUCKETS
-- ============================================

-- Bucket for 3D models (.obj files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    '3d-models',
    '3d-models',
    false, -- Private bucket
    52428800, -- 50MB limit per file
    ARRAY['model/obj', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for vessel images (inspection photos - not sensitive personal data)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vessel-images',
    'vessel-images',
    true, -- Public bucket - vessel inspection photos are not sensitive
    10485760, -- 10MB limit per file
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Bucket for scan thumbnails and heatmaps
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'scan-images',
    'scan-images',
    false, -- Private bucket
    5242880, -- 5MB limit per file
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for large scan data files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'scan-data',
    'scan-data',
    false, -- Private bucket
    104857600, -- 100MB limit per file
    ARRAY['application/json', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE POLICIES - 3D MODELS
-- ============================================

-- Users can upload 3D models for their organization's vessels
CREATE POLICY "Users can upload 3D models for own org vessels"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = '3d-models'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
    )
);

-- Users can view 3D models from their org or shared assets
CREATE POLICY "Users can view accessible 3D models"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = '3d-models'
    AND (
        -- Own organization
        (storage.foldername(name))[1] IN (
            SELECT organization_id::text
            FROM profiles
            WHERE id = auth.uid()
        )
        OR
        -- Shared assets (check if asset is shared)
        (storage.foldername(name))[2] IN (
            SELECT a.id
            FROM assets a
            JOIN shared_assets sa ON a.id = sa.asset_id
            WHERE sa.shared_with_organization_id = (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
);

-- Users can update/delete their own organization's 3D models
CREATE POLICY "Users can update own org 3D models"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = '3d-models'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

CREATE POLICY "Editors can delete 3D models"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = '3d-models'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- STORAGE POLICIES - VESSEL IMAGES
-- ============================================

-- Users can upload vessel images for their organization
CREATE POLICY "Users can upload vessel images for own org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'vessel-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
    )
);

-- Users can view vessel images from their org or shared assets
CREATE POLICY "Users can view accessible vessel images"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'vessel-images'
    AND (
        (storage.foldername(name))[1] IN (
            SELECT organization_id::text
            FROM profiles
            WHERE id = auth.uid()
        )
        OR
        (storage.foldername(name))[2] IN (
            SELECT a.id
            FROM assets a
            JOIN shared_assets sa ON a.id = sa.asset_id
            WHERE sa.shared_with_organization_id = (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
);

-- Users can update/delete their own organization's vessel images
CREATE POLICY "Users can update own org vessel images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'vessel-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

CREATE POLICY "Editors can delete vessel images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'vessel-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- STORAGE POLICIES - SCAN IMAGES
-- ============================================

-- Users can upload scan images for their organization
CREATE POLICY "Users can upload scan images for own org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'scan-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
    )
);

-- Users can view scan images from their org or shared assets
CREATE POLICY "Users can view accessible scan images"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'scan-images'
    AND (
        (storage.foldername(name))[1] IN (
            SELECT organization_id::text
            FROM profiles
            WHERE id = auth.uid()
        )
        OR
        (storage.foldername(name))[2] IN (
            SELECT a.id
            FROM assets a
            JOIN shared_assets sa ON a.id = sa.asset_id
            WHERE sa.shared_with_organization_id = (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
);

-- Users can update/delete their own organization's scan images
CREATE POLICY "Users can update own org scan images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'scan-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

CREATE POLICY "Editors can delete scan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'scan-images'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- STORAGE POLICIES - SCAN DATA
-- ============================================

-- Users can upload scan data for their organization
CREATE POLICY "Users can upload scan data for own org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'scan-data'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
    )
);

-- Users can view scan data from their org or shared assets
CREATE POLICY "Users can view accessible scan data"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'scan-data'
    AND (
        (storage.foldername(name))[1] IN (
            SELECT organization_id::text
            FROM profiles
            WHERE id = auth.uid()
        )
        OR
        (storage.foldername(name))[2] IN (
            SELECT a.id
            FROM assets a
            JOIN shared_assets sa ON a.id = sa.asset_id
            WHERE sa.shared_with_organization_id = (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
);

-- Users can update/delete their own organization's scan data
CREATE POLICY "Users can update own org scan data"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'scan-data'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

CREATE POLICY "Editors can delete scan data"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'scan-data'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM profiles
        WHERE id = auth.uid()
        AND role IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- HELPER FUNCTIONS FOR STORAGE
-- ============================================

-- Function to generate storage path for 3D models
-- Format: {org_id}/{asset_id}/{vessel_id}/{filename}
CREATE OR REPLACE FUNCTION generate_3d_model_path(
    p_org_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_filename TEXT
)
RETURNS TEXT AS $$
BEGIN
    RETURN p_org_id::text || '/' || p_asset_id || '/' || p_vessel_id || '/' || p_filename;
END;
$$ LANGUAGE plpgsql;

-- Function to generate storage path for vessel images
-- Format: {org_id}/{asset_id}/{vessel_id}/{image_id}.{ext}
CREATE OR REPLACE FUNCTION generate_vessel_image_path(
    p_org_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_image_id TEXT,
    p_extension TEXT
)
RETURNS TEXT AS $$
BEGIN
    RETURN p_org_id::text || '/' || p_asset_id || '/' || p_vessel_id || '/' || p_image_id || '.' || p_extension;
END;
$$ LANGUAGE plpgsql;

-- Function to generate storage path for scan images
-- Format: {org_id}/{asset_id}/{vessel_id}/{scan_id}_{type}.{ext}
CREATE OR REPLACE FUNCTION generate_scan_image_path(
    p_org_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_scan_id TEXT,
    p_image_type TEXT, -- 'thumbnail' or 'heatmap'
    p_extension TEXT
)
RETURNS TEXT AS $$
BEGIN
    RETURN p_org_id::text || '/' || p_asset_id || '/' || p_vessel_id || '/' || p_scan_id || '_' || p_image_type || '.' || p_extension;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION generate_3d_model_path IS 'Generates consistent storage path for 3D model files';
COMMENT ON FUNCTION generate_vessel_image_path IS 'Generates consistent storage path for vessel images';
COMMENT ON FUNCTION generate_scan_image_path IS 'Generates consistent storage path for scan images';
