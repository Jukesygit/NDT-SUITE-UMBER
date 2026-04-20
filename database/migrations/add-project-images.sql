-- ============================================================================
-- Migration: Project Images Pool
-- ============================================================================
-- Named images uploaded per project-vessel, stored in Supabase Storage.
-- These images are available to the vessel modeler for use as inspection
-- images or restriction annotation attachments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES inspection_projects(id) ON DELETE CASCADE,
    project_vessel_id UUID REFERENCES project_vessels(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),

    name TEXT NOT NULL,                -- User-given name (e.g. "North side corrosion")
    description TEXT,                  -- Optional description
    storage_path TEXT NOT NULL,        -- Path in project-files bucket
    storage_bucket TEXT NOT NULL DEFAULT 'project-files',
    filename TEXT NOT NULL,            -- Original filename
    size_bytes INTEGER,
    mime_type TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_images_project ON project_images(project_id);
CREATE INDEX IF NOT EXISTS idx_project_images_vessel ON project_images(project_vessel_id);

ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org project images" ON project_images FOR SELECT
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_images.project_id AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage project images" ON project_images FOR ALL
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_images.project_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_images.project_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );
