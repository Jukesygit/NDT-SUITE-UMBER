-- ============================================
-- QUERY TO GET EXACT PROFILES TABLE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- Get complete column information for profiles table
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Alternative: Get formatted output
SELECT
    ordinal_position as "#",
    column_name as "Column Name",
    CASE
        WHEN character_maximum_length IS NOT NULL THEN
            data_type || '(' || character_maximum_length || ')'
        ELSE
            data_type
    END as "Data Type",
    is_nullable as "Nullable",
    COALESCE(column_default, '-') as "Default"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Get constraints on profiles table
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    CASE
        WHEN tc.constraint_type = 'FOREIGN KEY' THEN
            ccu.table_name || '(' || ccu.column_name || ')'
        ELSE NULL
    END as references
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'profiles'
ORDER BY tc.constraint_type, kcu.column_name;

-- Get indexes on profiles table
SELECT
    indexname as "Index Name",
    indexdef as "Index Definition"
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY indexname;

-- Count total profiles
SELECT COUNT(*) as total_profiles FROM profiles;

-- Show sample profile data (if any exists)
SELECT * FROM profiles LIMIT 1;
