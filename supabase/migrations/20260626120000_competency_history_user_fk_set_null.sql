-- ============================================================================
-- FIX: Deleting a user fails with "Database error deleting user" (FK 23503)
--      when that user is referenced by competency_history.
-- ============================================================================
-- Symptom:
--   Deleting an auth.users row (e.g. an obsolete test account) via the Supabase
--   dashboard / GoTrue admin API returns "Database error deleting user".
--
-- Root cause:
--   competency_history.user_id and competency_history.changed_by referenced
--   auth.users(id) with ON DELETE NO ACTION. Deleting the user (which cascades
--   profiles + employee_competencies) is blocked because these audit rows still
--   point at the user. This is the same audit-table-pins-parent pattern fixed
--   for competency_history.employee_competency_id in
--   20260625130000_fix_competency_history_delete_fk.sql — that migration only
--   covered the competency FK, not the two user FKs.
--
-- Fix:
--   Switch both FKs to ON DELETE SET NULL. Both columns are nullable, so the
--   audit history survives the user's deletion with the user reference nulled
--   (consistent with the "preserve history" intent of the 06-25 migration and
--   with activity_log.user_id, which is already ON DELETE SET NULL).
--
--   Parent for both constraints is auth.users(id).
-- ============================================================================

-- competency_history.user_id -> auth.users(id)  (NO ACTION -> SET NULL)
ALTER TABLE competency_history
    DROP CONSTRAINT IF EXISTS competency_history_user_id_fkey;
ALTER TABLE competency_history
    ADD CONSTRAINT competency_history_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- competency_history.changed_by -> auth.users(id)  (NO ACTION -> SET NULL)
ALTER TABLE competency_history
    DROP CONSTRAINT IF EXISTS competency_history_changed_by_fkey;
ALTER TABLE competency_history
    ADD CONSTRAINT competency_history_changed_by_fkey
    FOREIGN KEY (changed_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
