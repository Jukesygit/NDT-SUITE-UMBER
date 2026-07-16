-- ============================================================================
-- Activity Log v2 — schema additions (P1 of the true audit-trail rework)
-- Design: docs/plans/2026-06-26-activity-log-true-audit-trail-design.md
-- ============================================================================
-- Additive only. Keeps every existing activity_log row. This migration just
-- widens the table so the integrity + trigger migrations that follow have the
-- columns/indexes they need. No behavior change on its own.
-- ============================================================================

-- 1. New context columns -----------------------------------------------------
-- organization_id is denormalized AUDIT CONTEXT, intentionally NOT a foreign key:
-- audit rows must survive (and never be mutated by) deletion of the org, and the
-- log is read admin-only, so org is a filter/grouping aid rather than a live link.
ALTER TABLE activity_log
    ADD COLUMN IF NOT EXISTS organization_id UUID;

-- actor_role: the actor's role at the time of the action (audit context — a user's
-- role can change later, so we snapshot it here rather than resolving it at read).
ALTER TABLE activity_log
    ADD COLUMN IF NOT EXISTS actor_role TEXT;

COMMENT ON COLUMN activity_log.organization_id IS
    'Organization context for the event when derivable (denormalized, no FK). Filter/grouping aid only; read access is admin-only and not org-scoped.';
COMMENT ON COLUMN activity_log.actor_role IS
    'Role of the actor at the time of the action: super_admin/admin/manager/org_admin/editor/viewer.';

-- 2. Indexes for the new filter dimensions -----------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id
    ON activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor_role
    ON activity_log(actor_role);
-- Supports the viewer's "entity type" filter and entity drill-down.
CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type
    ON activity_log(entity_type);

-- 3. v2 category taxonomy -----------------------------------------------------
-- action_category was historically free TEXT (documented only by a column comment).
-- The trigger layer introduces new categories (security, inspection, data), so we
-- enforce the v2 taxonomy on NEW rows. NOT VALID so the constraint never fails
-- against pre-existing legacy rows; new inserts are still checked.
ALTER TABLE activity_log
    DROP CONSTRAINT IF EXISTS activity_log_action_category_check;
ALTER TABLE activity_log
    ADD CONSTRAINT activity_log_action_category_check
    CHECK (action_category IN (
        'auth',        -- sign-in / sign-out / session
        'security',    -- password reset, 2FA, permission/role grants, PII reveal
        'profile',     -- a user editing their own profile
        'competency',  -- employee competency records
        'admin',       -- user / org / definition administration
        'asset',       -- vessel models, reports, generic assets
        'inspection',  -- inspection projects, project vessels, scans, logs, files
        'document',    -- document control register + revisions
        'config',      -- system configuration / announcements
        'data'         -- exports, log purges, bulk data operations
    )) NOT VALID;

COMMENT ON COLUMN activity_log.action_category IS
    'Categories: auth, security, profile, competency, admin, asset, inspection, document, config, data';
