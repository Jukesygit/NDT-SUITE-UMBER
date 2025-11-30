-- Clean up orphaned auth users that don't have profiles
-- This removes users created before the trigger fix was applied

-- First, disable the trigger that logs competency changes
ALTER TABLE employee_competencies DISABLE TRIGGER log_employee_competency_changes;

-- Delete competency history for orphaned users
DELETE FROM competency_history
WHERE user_id IN (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL
);

-- Now delete any competencies for users without profiles
DELETE FROM employee_competencies
WHERE user_id IN (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL
);

-- Re-enable the trigger
ALTER TABLE employee_competencies ENABLE TRIGGER log_employee_competency_changes;

-- Delete any other related records
DELETE FROM permission_requests
WHERE user_id IN (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL
);

-- Now we can safely delete the auth users without profiles
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN
        SELECT au.id, au.email
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
    LOOP
        -- Delete from auth.users (this will cascade)
        DELETE FROM auth.users WHERE id = user_record.id;
        RAISE NOTICE 'Deleted user: % (%)', user_record.email, user_record.id;
    END LOOP;
END $$;

-- Verify cleanup
SELECT
    COUNT(*) as orphaned_users,
    string_agg(au.email, ', ') as emails
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;
