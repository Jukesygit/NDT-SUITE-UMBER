-- Add personal detail fields to profiles table
-- These fields store personal information directly in the profile

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS mobile_number TEXT,
ADD COLUMN IF NOT EXISTS email_address TEXT,
ADD COLUMN IF NOT EXISTS home_address TEXT,
ADD COLUMN IF NOT EXISTS nearest_uk_train_station TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_emergency_contact_number TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN profiles.mobile_number IS 'User mobile phone number';
COMMENT ON COLUMN profiles.email_address IS 'User email address (may differ from auth email)';
COMMENT ON COLUMN profiles.home_address IS 'User home address';
COMMENT ON COLUMN profiles.nearest_uk_train_station IS 'Nearest UK train station for travel purposes';
COMMENT ON COLUMN profiles.next_of_kin IS 'Emergency contact name';
COMMENT ON COLUMN profiles.next_of_kin_emergency_contact_number IS 'Emergency contact phone number';
COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth';
COMMENT ON COLUMN profiles.avatar_url IS 'URL to user profile picture';

-- Create storage bucket for avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for avatars bucket
-- Allow authenticated users to upload their own avatars
CREATE POLICY IF NOT EXISTS "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatars
CREATE POLICY IF NOT EXISTS "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow everyone to view avatars (they're public)
CREATE POLICY IF NOT EXISTS "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatars
CREATE POLICY IF NOT EXISTS "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
