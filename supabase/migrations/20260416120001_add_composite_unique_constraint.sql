-- ============================================================================
-- Migration: Add unique constraint on scan_composites + UPDATE RLS policy
-- ============================================================================
-- Enables atomic upsert (INSERT ... ON CONFLICT DO UPDATE) for composites,
-- eliminating the data-loss window of delete-then-insert.
-- ============================================================================

-- Step 1: De-duplicate existing rows — keep only the most recent per pair
DELETE FROM scan_composites sc
WHERE sc.id NOT IN (
    SELECT DISTINCT ON (project_vessel_id, section_type) id
    FROM scan_composites
    WHERE project_vessel_id IS NOT NULL
      AND section_type IS NOT NULL
    ORDER BY project_vessel_id, section_type, created_at DESC
)
AND sc.project_vessel_id IS NOT NULL
AND sc.section_type IS NOT NULL;

-- Step 2: Add unique constraint (NULLS NOT DISTINCT so NULL pairs also deduplicate)
ALTER TABLE scan_composites
    ADD CONSTRAINT uq_scan_composites_vessel_section
    UNIQUE NULLS NOT DISTINCT (project_vessel_id, section_type);

-- Step 3: Add UPDATE RLS policy (needed for upsert ON CONFLICT DO UPDATE)
CREATE POLICY "Owner or admin can update scan composites"
    ON scan_composites FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = scan_composites.organization_id
              AND profiles.role IN ('admin', 'org_admin')
        )
    )
    WITH CHECK (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = scan_composites.organization_id
              AND profiles.role IN ('admin', 'org_admin')
        )
    );
