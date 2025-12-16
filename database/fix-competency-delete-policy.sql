-- Fix: Allow users to delete their own competencies
-- Previously only admins could delete, causing silent failures for regular users

-- =====================================================
-- PART 1: Fix RLS Policy
-- =====================================================

-- Drop existing policies (both old and new names for idempotency)
DROP POLICY IF EXISTS "Admins can delete competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Users can delete own competencies" ON employee_competencies;

-- Create a new policy that allows:
-- 1. Users to delete their own competencies
-- 2. Admins/org_admins to delete any competencies
CREATE POLICY "Users can delete own competencies"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        -- Users can delete their own competencies
        user_id = auth.uid()
        OR
        -- Admins and org_admins can delete any competencies
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- =====================================================
-- PART 2: Fix the delete trigger foreign key issue
-- =====================================================
-- The AFTER DELETE trigger tries to insert a history record
-- with employee_competency_id referencing the deleted row,
-- which violates the foreign key constraint.
-- Fix: Set employee_competency_id to NULL for delete records.

CREATE OR REPLACE FUNCTION log_competency_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            new_value,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            'created',
            NEW.value,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            new_value,
            old_expiry_date,
            new_expiry_date,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.competency_id,
            CASE
                WHEN NEW.status = 'active' AND OLD.status = 'pending_approval' THEN 'approved'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'updated'
            END,
            OLD.value,
            NEW.value,
            OLD.expiry_date,
            NEW.expiry_date,
            auth.uid()
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- For DELETE, set employee_competency_id to NULL since the parent record
        -- is being deleted. We still preserve user_id and competency_id for audit.
        INSERT INTO competency_history (
            employee_competency_id,
            user_id,
            competency_id,
            action,
            old_value,
            old_expiry_date,
            changed_by
        ) VALUES (
            NULL,  -- Cannot reference deleted record
            OLD.user_id,
            OLD.competency_id,
            'deleted',
            OLD.value,
            OLD.expiry_date,
            auth.uid()
        );
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
