-- Add support for custom fields in competency definitions
-- This allows competencies like NDT certs to have multiple sub-fields
-- (e.g., Issuing Body, Certificate Number, Expiry Date)

-- Add custom_fields JSONB column to competency_definitions
ALTER TABLE competency_definitions
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL;

-- Add issuing_body to employee_competencies for certifications
ALTER TABLE employee_competencies
ADD COLUMN IF NOT EXISTS issuing_body TEXT,
ADD COLUMN IF NOT EXISTS certificate_number TEXT;

COMMENT ON COLUMN competency_definitions.custom_fields IS 'Custom field configuration for multi-field competencies. Example: {"fields": [{"name": "issuing_body", "type": "text", "label": "Issuing Body"}, {"name": "certificate_number", "type": "text", "label": "Certificate Number"}]}';
COMMENT ON COLUMN employee_competencies.issuing_body IS 'Issuing body for certifications (e.g., PCN, CSWIP, Matrix-AI)';
COMMENT ON COLUMN employee_competencies.certificate_number IS 'Certificate or registration number';
