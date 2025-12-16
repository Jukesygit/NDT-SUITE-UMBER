-- Migration: Fix competency_history RLS policy
-- Issue: The current policy allows any authenticated user to insert history records,
-- potentially allowing audit trail manipulation.
-- Fix: Restrict direct inserts - only the trigger (SECURITY DEFINER) can insert.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;

-- Create a restrictive policy that blocks direct inserts
-- The trigger function uses SECURITY DEFINER so it bypasses RLS
CREATE POLICY "Triggers only can insert competency history"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (false);

-- Note: The log_competency_change() function is defined with SECURITY DEFINER
-- which means it bypasses RLS and can still insert records.
-- Direct INSERT statements from users will be blocked.

-- Add policy to prevent deletion of history (audit trail must be immutable)
DROP POLICY IF EXISTS "No one can delete competency history" ON competency_history;
CREATE POLICY "No one can delete competency history"
    ON competency_history FOR DELETE
    TO authenticated
    USING (false);

-- Add policy to prevent updates to history (audit trail must be immutable)
DROP POLICY IF EXISTS "No one can update competency history" ON competency_history;
CREATE POLICY "No one can update competency history"
    ON competency_history FOR UPDATE
    TO authenticated
    USING (false);

COMMENT ON POLICY "Triggers only can insert competency history" ON competency_history IS
'Audit trail entries can only be created by the log_competency_change() trigger. Direct inserts are blocked.';

COMMENT ON POLICY "No one can delete competency history" ON competency_history IS
'Audit trail records cannot be deleted to maintain data integrity.';

COMMENT ON POLICY "No one can update competency history" ON competency_history IS
'Audit trail records cannot be modified to maintain data integrity.';
