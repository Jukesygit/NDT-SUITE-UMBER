-- Migration: Add vantage_number column to profiles table
-- Date: 2026-01-16
-- Description: Adds a Vantage Number field for user personal details

-- Add vantage_number column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS vantage_number TEXT DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN profiles.vantage_number IS 'User Vantage Number - unique identifier for external systems';

-- Verify column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name = 'vantage_number';
