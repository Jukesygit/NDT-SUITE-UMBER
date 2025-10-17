-- Add indexes to improve query performance
-- These indexes will significantly speed up common queries
-- Note: Some indexes may already exist from the main schema

-- Index for scans by vessel_id (CRITICAL - fixes timeout errors)
-- This is the most important index for performance
CREATE INDEX IF NOT EXISTS idx_scans_vessel_id_perf ON scans(vessel_id);

-- Index for strakes by vessel_id
CREATE INDEX IF NOT EXISTS idx_strakes_vessel_id ON strakes(vessel_id);

-- Index for scans by strake_id
CREATE INDEX IF NOT EXISTS idx_scans_strake_id ON scans(strake_id);

-- Index for profiles by organization_id
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);

-- Composite index for scans by vessel and created date (for pagination)
-- This helps with ordering and range queries
CREATE INDEX IF NOT EXISTS idx_scans_vessel_created ON scans(vessel_id, created_at DESC);

-- Index for shared_assets to improve permission checks
CREATE INDEX IF NOT EXISTS idx_shared_assets_shared_with_org ON shared_assets(shared_with_organization_id);
