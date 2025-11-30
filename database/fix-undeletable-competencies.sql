-- Fix undeletable competencies by removing orphaned history entries
-- This addresses the issue where competencies can't be deleted due to foreign key constraints

-- First, let's identify competencies with minimal data (likely abandoned during creation)
SELECT
    ec.id,
    ec.user_id,
    p.username,
    cd.name as competency_name,
    ec.value,
    ec.issuing_body,
    ec.certification_id,
    ec.expiry_date,
    ec.created_at,
    (SELECT COUNT(*) FROM competency_history WHERE employee_competency_id = ec.id) as history_count
FROM employee_competencies ec
JOIN profiles p ON p.id = ec.user_id
JOIN competency_definitions cd ON cd.id = ec.competency_id
WHERE
    -- Likely incomplete: has no value, issuing_body, cert_id, or expiry_date
    ec.value IS NULL
    AND ec.issuing_body IS NULL
    AND ec.certification_id IS NULL
    AND ec.expiry_date IS NULL
ORDER BY ec.created_at DESC;

-- To delete a specific competency (replace with actual ID from above query)
-- The ON DELETE CASCADE should handle the history entries automatically
-- But if that's not working, we can manually delete them first:

-- Example for a specific user and competency:
-- DELETE FROM competency_history
-- WHERE employee_competency_id IN (
--     SELECT id FROM employee_competencies
--     WHERE user_id = 'YOUR_USER_ID_HERE'
--     AND competency_id = 'COMPETENCY_DEF_ID_HERE'
-- );

-- Then delete the competency:
-- DELETE FROM employee_competencies
-- WHERE id = 'COMPETENCY_ID_HERE';

-- Or, if you want to delete ALL empty competencies for a specific user:
-- UNCOMMENT ONLY AFTER REVIEWING THE SELECT QUERY ABOVE
/*
DO $$
DECLARE
    comp_record RECORD;
BEGIN
    FOR comp_record IN
        SELECT ec.id
        FROM employee_competencies ec
        WHERE ec.user_id = 'YOUR_USER_ID_HERE'
        AND ec.value IS NULL
        AND ec.issuing_body IS NULL
        AND ec.certification_id IS NULL
        AND ec.expiry_date IS NULL
    LOOP
        -- Delete history first
        DELETE FROM competency_history WHERE employee_competency_id = comp_record.id;
        -- Then delete the competency
        DELETE FROM employee_competencies WHERE id = comp_record.id;
        RAISE NOTICE 'Deleted competency: %', comp_record.id;
    END LOOP;
END $$;
*/
