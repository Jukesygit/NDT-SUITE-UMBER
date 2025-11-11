-- Add Witness Check Fields to Employee Competencies
-- This adds the ability to track competency witness inspections for NDT certifications

-- Add witness check fields to employee_competencies table
ALTER TABLE employee_competencies
  ADD COLUMN IF NOT EXISTS witness_checked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS witnessed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS witnessed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS witness_notes TEXT;

-- Add index for performance on witness queries
CREATE INDEX IF NOT EXISTS idx_employee_competencies_witness
  ON employee_competencies(witness_checked, witnessed_by);

-- Add comment to document the purpose
COMMENT ON COLUMN employee_competencies.witness_checked IS 'Indicates if this competency has been witnessed/verified through matrix competency inspection';
COMMENT ON COLUMN employee_competencies.witnessed_by IS 'User ID of the person who performed the witness check';
COMMENT ON COLUMN employee_competencies.witnessed_at IS 'Timestamp when the witness check was performed';
COMMENT ON COLUMN employee_competencies.witness_notes IS 'Optional notes from the witness check';

-- Verify the columns were added
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'employee_competencies'
  AND column_name IN ('witness_checked', 'witnessed_by', 'witnessed_at', 'witness_notes')
ORDER BY ordinal_position;
