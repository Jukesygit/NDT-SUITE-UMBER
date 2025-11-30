-- Clean up issued/expiry dates from personal detail fields
-- Personal details like email, phone, address don't have "issued" or "expiry" dates
-- This migration removes expiry_date, issuing_body, and certification_id from these fields

-- Get the Personal Details category ID
DO $$
DECLARE
    personal_details_category_id UUID;
BEGIN
    -- Find the Personal Details category
    SELECT id INTO personal_details_category_id
    FROM competency_categories
    WHERE name ILIKE '%personal%detail%'
    LIMIT 1;

    -- If we found the category, clean up the dates
    IF personal_details_category_id IS NOT NULL THEN
        -- Clear expiry_date for all personal detail competencies
        UPDATE employee_competencies
        SET expiry_date = NULL,
            issuing_body = NULL,
            certification_id = NULL
        WHERE competency_id IN (
            SELECT id FROM competency_definitions
            WHERE category_id = personal_details_category_id
        );

        RAISE NOTICE 'Cleaned up dates for Personal Details category';
    END IF;

    -- Also clean up specific field names that shouldn't have dates
    UPDATE employee_competencies
    SET expiry_date = NULL,
        issuing_body = NULL,
        certification_id = NULL
    WHERE competency_id IN (
        SELECT id FROM competency_definitions
        WHERE LOWER(name) SIMILAR TO '%(date of birth|mobile number|email address|home address|nearest uk train station|next of kin|emergency contact|phone|postcode|pension information|vantage no)%'
    );

    RAISE NOTICE 'Cleaned up dates for specific personal detail fields';
END $$;
