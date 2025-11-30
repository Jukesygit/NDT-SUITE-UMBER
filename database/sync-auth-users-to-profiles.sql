-- Sync auth.users to profiles table for users that are missing profiles
-- This fixes the issue where CSV imports created auth users but profiles weren't created

-- First, create profiles for any auth users that don't have profiles
INSERT INTO public.profiles (id, username, email, role, organization_id)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)) as username,
    u.email,
    COALESCE(u.raw_user_meta_data->>'role', 'viewer') as role,
    (u.raw_user_meta_data->>'organization_id')::UUID as organization_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Show the results
SELECT
    p.id,
    p.username,
    p.email,
    p.role,
    p.organization_id,
    p.created_at
FROM public.profiles p
ORDER BY p.created_at DESC
LIMIT 20;
