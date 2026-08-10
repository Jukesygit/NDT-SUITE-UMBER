-- ============================================================================
-- Competency attribution — creator stamping + activity-log "on behalf of"
-- Design: docs/plans/2026-07-28-competency-attribution-and-session-hardening-design.md
-- ============================================================================
-- Incident: an admin added a certificate + document to the WRONG user's profile.
-- RLS behaved as designed (privileged roles may write on behalf of others); the
-- gap was that nothing recorded WHO performed a competency write, nor FOR WHOM.
--
-- This migration makes two changes (Part A of the design, items A1 + A2):
--
--   1. Attribution column + tamper-proof stamp. Adds created_by to
--      employee_competencies (and, when it exists, competency_documents). A
--      BEFORE INSERT trigger, set_created_by(), overwrites created_by with
--      auth.uid() for every authenticated write, so a client can never spoof the
--      author. Service-role / system writes (auth.uid() IS NULL) keep whatever
--      value they explicitly supply. created_by REFERENCES profiles(id) — not
--      auth.users — so PostgREST can embed the author's name in competency reads.
--      No RLS changes: the column rides the existing per-row policies.
--
--   2. Activity-log "on behalf of" enrichment. CREATE OR REPLACE of
--      audit_row_change() (from 20260626160000_activity_log_audit_triggers.sql).
--      The body is copied verbatim with a SINGLE addition: after the details
--      CASE, any audited row whose user_id differs from the actor records an
--      on_behalf_of UUID in details. The triggers are NOT re-attached here — they
--      already reference audit_row_change() by name. Category taxonomy, PII/bulky
--      key redaction lists, and all other behavior are unchanged.
--
-- competency_documents is created by same-day migration 20260728120000; the
-- timestamp ordering guarantees it exists first when both are pending, but every
-- reference to it here is still guarded with to_regclass so this migration is
-- safe on databases where that table has not (yet) been created.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. Attribution column on employee_competencies.
-- ---------------------------------------------------------------------------
ALTER TABLE employee_competencies
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 1b. Attribution column on competency_documents (guarded — table is created by
--     20260728120000_competency_multi_documents.sql).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.competency_documents') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.competency_documents '
             || 'ADD COLUMN IF NOT EXISTS created_by uuid '
             || 'REFERENCES profiles(id) ON DELETE SET NULL';
    ELSE
        RAISE NOTICE 'Skipping competency_documents.created_by: table public.competency_documents does not exist';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1c. Tamper-proof creator stamp. Runs BEFORE INSERT so an authenticated caller
--     can never spoof created_by; service-role writes (auth.uid() IS NULL) keep
--     whatever they explicitly provide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_created_by_employee_competencies ON public.employee_competencies;
CREATE TRIGGER set_created_by_employee_competencies
    BEFORE INSERT ON public.employee_competencies
    FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- competency_documents trigger — guarded like the column above.
DO $$
BEGIN
    IF to_regclass('public.competency_documents') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS set_created_by_competency_documents ON public.competency_documents';
        EXECUTE 'CREATE TRIGGER set_created_by_competency_documents '
             || 'BEFORE INSERT ON public.competency_documents '
             || 'FOR EACH ROW EXECUTE FUNCTION public.set_created_by()';
    ELSE
        RAISE NOTICE 'Skipping set_created_by trigger: table public.competency_documents does not exist';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Activity-log "on behalf of" enrichment. Body copied verbatim from
--    20260626160000_activity_log_audit_triggers.sql; the ONLY change is the
--    on_behalf_of block after the details CASE (see comment inline). Triggers are
--    intentionally NOT re-attached — they already point at this function by name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Columns never worth diffing (timestamps maintained by other triggers).
    c_noise_keys CONSTANT TEXT[] := ARRAY['created_at', 'updated_at'];
    -- Personal data: record that it changed, never store the value.
    c_pii_keys CONSTANT TEXT[] := ARRAY[
        'email', 'email_address', 'mobile_number', 'home_address', 'date_of_birth',
        'next_of_kin', 'next_of_kin_emergency_contact_number', 'nearest_uk_train_station'
    ];
    -- Large/binary payloads: record that they changed, never store the blob.
    c_bulky_keys CONSTANT TEXT[] := ARRAY[
        'config', 'thickness_data', 'data', 'x_axis', 'y_axis', 'companion_config',
        'equipment_config', 'beamset_config', 'results_summary', 'signoff_details',
        'section_folder_map', 'metadata', 'stats', 'source_files', 'heatmap_url',
        'thumbnail_url', 'data_url', 'model_3d_url', 'avatar_url'
    ];

    v_actor       UUID := auth.uid();
    v_actor_role  TEXT;
    v_actor_org   UUID;
    v_org         UUID;
    v_row         JSONB;
    v_old         JSONB;
    v_new         JSONB;
    v_changes     JSONB;
    v_details     JSONB;
    v_entity_token TEXT;
    v_category    TEXT;
    v_entity_id   TEXT;
    v_entity_name TEXT;
    v_suffix      TEXT;
    v_action      TEXT;
    v_description TEXT;
BEGIN
    -- Skip service-role / system writes (no authenticated caller). These are
    -- covered by edge-function logging (P3) with the real acting admin.
    IF v_actor IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role, organization_id INTO v_actor_role, v_actor_org
      FROM profiles WHERE id = v_actor;

    -- Surviving row image.
    IF TG_OP = 'DELETE' THEN
        v_row := to_jsonb(OLD);
    ELSE
        v_row := to_jsonb(NEW);
    END IF;

    v_entity_id   := v_row->>'id';
    v_entity_name := COALESCE(
        v_row->>'name', v_row->>'title', v_row->>'vessel_name', v_row->>'doc_number',
        v_row->>'file_name', v_row->>'filename', v_row->>'procedure_number',
        v_row->>'username', v_row->>'vessel_tag'
    );

    -- Org context: prefer the entity's own org, else the actor's org.
    v_org := COALESCE((v_row->>'organization_id')::UUID, v_actor_org);
    IF TG_TABLE_NAME = 'organizations' THEN
        v_org := (v_row->>'id')::UUID;
    END IF;

    -- Map table -> (entity token, category).
    CASE TG_TABLE_NAME
        WHEN 'inspection_projects'      THEN v_entity_token := 'project';            v_category := 'inspection';
        WHEN 'project_vessels'          THEN v_entity_token := 'vessel';             v_category := 'inspection';
        WHEN 'vessel_models'            THEN v_entity_token := 'vessel_model';        v_category := 'asset';
        WHEN 'scan_composites'          THEN v_entity_token := 'scan_composite';     v_category := 'inspection';
        WHEN 'vessel_scan_placements'   THEN v_entity_token := 'scan_placement';     v_category := 'inspection';
        WHEN 'scan_log_entries'         THEN v_entity_token := 'scan';               v_category := 'inspection';
        WHEN 'calibration_log_entries'  THEN v_entity_token := 'calibration';        v_category := 'inspection';
        WHEN 'inspection_procedures'    THEN v_entity_token := 'procedure';          v_category := 'inspection';
        WHEN 'project_files'            THEN v_entity_token := 'project_file';       v_category := 'inspection';
        WHEN 'project_images'           THEN v_entity_token := 'project_image';      v_category := 'inspection';
        WHEN 'documents'                THEN v_entity_token := 'document';           v_category := 'document';
        WHEN 'document_revisions'       THEN v_entity_token := 'document_revision';  v_category := 'document';
        WHEN 'document_review_schedule' THEN v_entity_token := 'document_review';    v_category := 'document';
        WHEN 'document_categories'      THEN v_entity_token := 'document_category';  v_category := 'document';
        WHEN 'competency_definitions'   THEN v_entity_token := 'definition';         v_category := 'admin';
        WHEN 'competency_categories'    THEN v_entity_token := 'competency_category'; v_category := 'admin';
        WHEN 'employee_competencies'    THEN v_entity_token := 'competency';         v_category := 'competency';
        WHEN 'organizations'            THEN v_entity_token := 'organization';       v_category := 'admin';
        WHEN 'profiles'                 THEN v_entity_token := 'profile';            v_category := 'admin';
        ELSE                                 v_entity_token := TG_TABLE_NAME;        v_category := 'admin';
    END CASE;

    -- A user editing their OWN profile is a 'profile' action; an admin editing
    -- someone else's profile stays an 'admin' action.
    IF TG_TABLE_NAME = 'profiles' AND v_entity_id = v_actor::TEXT THEN
        v_category := 'profile';
    END IF;

    v_suffix := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deleted'
    END;
    v_action := v_entity_token || '_' || v_suffix;

    -- Build details / compute diff.
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);

        SELECT jsonb_object_agg(t.k,
            CASE
                WHEN t.k = ANY(c_pii_keys)   THEN jsonb_build_object('changed', TRUE, 'pii_redacted', TRUE)
                WHEN t.k = ANY(c_bulky_keys) THEN jsonb_build_object('changed', TRUE)
                ELSE jsonb_build_object('old', v_old -> t.k, 'new', v_new -> t.k)
            END)
          INTO v_changes
          FROM jsonb_object_keys(v_new) AS t(k)
         WHERE (v_old -> t.k) IS DISTINCT FROM (v_new -> t.k)
           AND NOT (t.k = ANY(c_noise_keys));

        -- Only noise (timestamps) changed -> nothing meaningful to audit.
        IF v_changes IS NULL THEN
            RETURN NULL;
        END IF;
        v_details := jsonb_build_object('changes', v_changes);

    ELSIF TG_OP = 'DELETE' THEN
        v_details := jsonb_build_object(
            'deleted', jsonb_build_object('id', v_entity_id, 'name', v_entity_name)
        );
    ELSE
        v_details := NULL;  -- INSERT
    END IF;

    -- Record the target user when the actor writes a row owned by someone else.
    IF v_row ? 'user_id' AND (v_row->>'user_id') IS DISTINCT FROM v_actor::text THEN
        v_details := COALESCE(v_details, '{}'::jsonb)
                  || jsonb_build_object('on_behalf_of', v_row->>'user_id');
    END IF;

    v_description := format('%s %s%s',
        initcap(replace(v_entity_token, '_', ' ')),
        v_suffix,
        CASE WHEN v_entity_name IS NOT NULL THEN ': ' || v_entity_name ELSE '' END
    );

    -- Auditing must never break the user's actual write.
    BEGIN
        INSERT INTO activity_log (
            user_id, user_email, user_name,
            action_type, action_category, description, details,
            entity_type, entity_id, entity_name,
            organization_id, actor_role
        ) VALUES (
            v_actor, NULL, NULL,
            v_action, v_category, v_description, v_details,
            TG_TABLE_NAME, v_entity_id, v_entity_name,
            v_org, v_actor_role
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- never propagate an auditing failure to the parent transaction
    END;

    RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;
