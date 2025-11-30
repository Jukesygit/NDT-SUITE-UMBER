-- Fix imported users that have invalid 'user' role
-- Step 1: Update the raw_user_meta_data in auth.users to change 'user' to 'viewer'

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    raw_user_meta_data,
    '{role}',
    '"viewer"'::jsonb
)
WHERE raw_user_meta_data->>'role' = 'user';

-- Step 2: Now create profiles for users that don't have them
INSERT INTO public.profiles (id, username, email, role, organization_id)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)) as username,
    u.email,
    COALESCE(
        CASE
            WHEN u.raw_user_meta_data->>'role' = 'user' THEN 'viewer'
            ELSE u.raw_user_meta_data->>'role'
        END,
        'viewer'
    ) as role,
    (u.raw_user_meta_data->>'organization_id')::UUID as organization_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Step 3: Show the results
SELECT
    p.id,
    p.username,
    p.email,
    p.role,
    o.name as organization,
    p.created_at
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id
ORDER BY p.created_at DESC
LIMIT 25;
