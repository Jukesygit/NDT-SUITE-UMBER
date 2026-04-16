-- ============================================================================
-- Migration: Add section_folder_map to project_vessels
-- ============================================================================
-- Stores companion app folder-to-section mappings as JSONB.
-- Type: Record<string, string[]> — maps section type names to folder name arrays.
-- Example: {"shell": ["Shell_0-500", "Shell_500-1000"], "dome_end": ["Dome_End_1"]}
-- ============================================================================

ALTER TABLE project_vessels
    ADD COLUMN IF NOT EXISTS section_folder_map JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN project_vessels.section_folder_map
    IS 'Companion app folder-to-section mappings: Record<sectionType, folderNames[]>';
