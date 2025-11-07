-- ========================================
-- MANUAL MIGRATION SCRIPT FOR SUPABASE CLOUD
-- Run this in your Supabase SQL Editor
-- ========================================

-- Step 1: Add personal detail fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS mobile_number TEXT,
ADD COLUMN IF NOT EXISTS email_address TEXT,
ADD COLUMN IF NOT EXISTS home_address TEXT,
ADD COLUMN IF NOT EXISTS nearest_uk_train_station TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_emergency_contact_number TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN profiles.mobile_number IS 'User mobile phone number';
COMMENT ON COLUMN profiles.email_address IS 'User email address (may differ from auth email)';
COMMENT ON COLUMN profiles.home_address IS 'User home address';
COMMENT ON COLUMN profiles.nearest_uk_train_station IS 'Nearest UK train station for travel purposes';
COMMENT ON COLUMN profiles.next_of_kin IS 'Emergency contact name';
COMMENT ON COLUMN profiles.next_of_kin_emergency_contact_number IS 'Emergency contact phone number';
COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth';
COMMENT ON COLUMN profiles.avatar_url IS 'URL to user profile picture';

-- Step 3: Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN (
  'mobile_number',
  'email_address',
  'home_address',
  'nearest_uk_train_station',
  'next_of_kin',
  'next_of_kin_emergency_contact_number',
  'date_of_birth',
  'avatar_url'
)
ORDER BY column_name;
