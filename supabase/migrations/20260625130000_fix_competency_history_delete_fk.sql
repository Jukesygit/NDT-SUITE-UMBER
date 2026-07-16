-- ============================================================================
-- FIX: Deleting an employee competency fails with 409 (FK violation 23503)
-- ============================================================================
-- Symptom:
--   DELETE /rest/v1/employee_competencies?id=eq.<id>  -> 409 Conflict
--   code 23503, constraint "competency_history_employee_competency_id_fkey":
--   "Key (employee_competency_id)=(<id>) is not present in table
--    employee_competencies."
--
-- Root cause:
--   The AFTER DELETE trigger log_competency_change() inserts a 'deleted'
--   audit row into competency_history with
--       employee_competency_id = OLD.id
--   but OLD.id has just been removed from employee_competencies in the same
--   statement, so the FK check fails. This made every competency delete fail.
--
-- This re-applies the intended fix from database/fix-competency-delete-policy.sql
-- (which was never committed as a migration), matched to the table shape that
-- is actually live (base competency-schema.sql: employee_competency_id,
-- competency_id, value/expiry columns, action CHECK uses 'created'/'updated'/
-- 'deleted'/...), and preserves the SECURITY DEFINER + search_path hardening
-- added by the 2026-02 security migrations.
--
-- Two changes:
--   PART 1 — Retain audit history of deleted competencies by switching the FK
--            from ON DELETE CASCADE to ON DELETE SET NULL. (Without this, all
--            prior history rows for the competency are cascade-deleted too.)
--   PART 2 — Stop the DELETE branch from referencing the just-deleted row:
--            insert NULL into employee_competency_id (column is nullable).
-- ============================================================================

-- PART 1: Preserve history across deletes (CASCADE -> SET NULL)
-- employee_competency_id is nullable, so SET NULL is valid.
ALTER TABLE competency_history
    DROP CONSTRAINT IF EXISTS competency_history_employee_competency_id_fkey;

ALTER TABLE competency_history
    ADD CONSTRAINT competency_history_employee_competency_id_fkey
    FOREIGN KEY (employee_competency_id)
    REFERENCES employee_competencies(id)
    ON DELETE SET NULL;

-- PART 2: Fix the audit trigger so DELETE does not reference the deleted row.
CREATE OR REPLACE FUNCTION log_competency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO competency_history (
            employee_competency_id, user_id, competency_id,
            action, new_value, new_expiry_date, changed_by
        ) VALUES (
            NEW.id, NEW.user_id, NEW.competency_id,
            'created', NEW.value, NEW.expiry_date, auth.uid()
        );
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO competency_history (
            employee_competency_id, user_id, competency_id,
            action, old_value, new_value, old_expiry_date, new_expiry_date, changed_by
        ) VALUES (
            NEW.id, NEW.user_id, NEW.competency_id,
            CASE
                WHEN NEW.status = 'active' AND OLD.status = 'pending_approval' THEN 'approved'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'updated'
            END,
            OLD.value, NEW.value, OLD.expiry_date, NEW.expiry_date, auth.uid()
        );
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        -- Parent row is being deleted; do NOT reference OLD.id here or the
        -- FK check fails (23503). Preserve user_id/competency_id/value for audit.
        INSERT INTO competency_history (
            employee_competency_id, user_id, competency_id,
            action, old_value, old_expiry_date, changed_by
        ) VALUES (
            NULL,
            OLD.user_id, OLD.competency_id,
            'deleted', OLD.value, OLD.expiry_date, auth.uid()
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;
