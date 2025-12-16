-- Add drawing columns to vessels table
-- These columns store location and GA (General Arrangement) drawings with annotations

-- Add location_drawing column (JSONB for image URL + annotations)
ALTER TABLE vessels
ADD COLUMN IF NOT EXISTS location_drawing JSONB DEFAULT NULL;

-- Add ga_drawing column (JSONB for image URL + annotations)
ALTER TABLE vessels
ADD COLUMN IF NOT EXISTS ga_drawing JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN vessels.location_drawing IS 'Location drawing with structure: { image_url: string, annotations?: Array<{id, type, x, y, width?, height?, label}>, comment?: string }';
COMMENT ON COLUMN vessels.ga_drawing IS 'General Arrangement drawing with structure: { image_url: string, annotations?: Array<{id, type, x, y, width?, height?, label}>, comment?: string }';

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'vessels'
AND column_name IN ('location_drawing', 'ga_drawing');
