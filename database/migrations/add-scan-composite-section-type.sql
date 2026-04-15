-- ============================================================================
-- Migration: Add section_type to scan_composites
-- ============================================================================
-- Tags each scan composite with the vessel section it covers.
-- Predefined values: 'shell', 'dome_end', 'nozzle', or a custom string.
-- Displayed as a badge on the inspection detail page, similar to model_type
-- on vessel_models.
-- ============================================================================

ALTER TABLE scan_composites ADD COLUMN IF NOT EXISTS section_type TEXT;

COMMENT ON COLUMN scan_composites.section_type IS 'Vessel section tag: shell, dome_end, nozzle, or custom text';
