-- Add level field to employee_competencies for structured certification levels
-- Used by IRATA (L1, L2, L3) and potentially other leveled certifications

ALTER TABLE employee_competencies
ADD COLUMN IF NOT EXISTS level TEXT;

COMMENT ON COLUMN employee_competencies.level IS 'Certification level (e.g., L1, L2, L3 for IRATA)';
