-- Add model_type column to vessel_models
-- Tracks what kind of model this is: blank, coverage, scan_overlayed, fully_annotated, or custom text
ALTER TABLE vessel_models ADD COLUMN IF NOT EXISTS model_type TEXT;
