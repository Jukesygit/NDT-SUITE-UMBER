-- Quick check to see if witness columns exist
-- Run this in Supabase SQL Editor

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'employee_competencies'
  AND column_name IN ('witness_checked', 'witnessed_by', 'witnessed_at', 'witness_notes')
ORDER BY ordinal_position;

-- If this returns 4 rows, the migration was successful!
-- If this returns 0 rows, you need to run add-witness-check-fields.sql
