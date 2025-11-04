-- Add additional fields to employee_competencies for certification details
-- This allows storing issuing body, certification ID number, and expiry date
-- as separate, queryable fields for better data management

ALTER TABLE employee_competencies
ADD COLUMN IF NOT EXISTS issuing_body TEXT,
ADD COLUMN IF NOT EXISTS certification_id TEXT;

COMMENT ON COLUMN employee_competencies.issuing_body IS 'Name of the certification issuing organization (e.g., ASME, API, BINDT)';
COMMENT ON COLUMN employee_competencies.certification_id IS 'Unique certification ID or certificate number';
COMMENT ON COLUMN employee_competencies.expiry_date IS 'Expiry date for certifications that expire';
