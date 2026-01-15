-- Migration: Add CV Document competency to Professional Registration category
-- Date: 2026-01-15
-- Description: Adds a CV Document field for users to upload their CV/Resume

-- Helper function (if not exists)
CREATE OR REPLACE FUNCTION get_category_id(category_name TEXT)
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM competency_categories WHERE name = category_name LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Add CV Document competency definition
-- Placed in Professional Registration so it appears in the certification selection dropdowns
-- (Personal Details category is filtered out from cert selection)
INSERT INTO competency_definitions (
    category_id,
    name,
    description,
    field_type,
    requires_document,
    requires_approval,
    display_order,
    is_active
) VALUES (
    get_category_id('Professional Registration'),
    'CV Document',
    'Upload your current CV/Resume',
    'file',
    true,
    false,
    5,
    true
)
ON CONFLICT (category_id, name) DO UPDATE SET
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    requires_document = EXCLUDED.requires_document,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;
