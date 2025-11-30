-- Migration: Add 'changes_requested' status to employee_competencies
-- This allows admins to request changes to submitted competency documents
-- Run this migration in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE employee_competencies
DROP CONSTRAINT IF EXISTS employee_competencies_status_check;

-- Add the new constraint with 'changes_requested' status
ALTER TABLE employee_competencies
ADD CONSTRAINT employee_competencies_status_check
CHECK (status IN ('active', 'expired', 'pending_approval', 'rejected', 'changes_requested'));

-- Optional: Add index for the new status if querying by it frequently
-- CREATE INDEX IF NOT EXISTS idx_employee_competencies_changes_requested
-- ON employee_competencies(status) WHERE status = 'changes_requested';
