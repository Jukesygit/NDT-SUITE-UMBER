-- ============================================================================
-- Activity Log v2 — audit triggers (P2 of the true audit-trail rework)
-- Design: docs/plans/2026-06-26-activity-log-true-audit-trail-design.md
-- ============================================================================
-- A single shared AFTER INSERT/UPDATE/DELETE trigger function that records a
-- forgery-proof activity_log row for every change to the core domain tables.
--
-- Key behaviors:
--   * Actor is auth.uid() (the authenticated caller). Service-role / system
--     writes (auth.uid() IS NULL) are SKIPPED here — those are audited inside the
--     edge functions in P3 with the real admin from the JWT. This avoids both
--     null-actor noise and double-logging.
--   * UPDATEs record a diff of only the columns that actually changed; PII columns
--     are redacted (recorded as changed, value withheld) and bulky payload columns
--     (geometry/thickness blobs, JSONB config) are recorded as "changed" without
--     their values, so the log never balloons.
--   * The audit INSERT is wrapped in EXCEPTION WHEN OTHERS so a logging failure can
--     NEVER roll back the user's actual write.
--   * Coexists with the existing log_competency_change() trigger (which writes the
--     separate competency_history table) — they write to different tables.
-- ============================================================================

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

-- ============================================================================
-- Attach the trigger to each audited table.
-- Guarded by to_regclass so the migration is resilient across environments where
-- some tables (defined only in non-timestamped database/*.sql scripts) may not
-- exist on a given database — e.g. vessel_scan_placements. Missing tables are
-- skipped with a NOTICE rather than failing the whole migration.
-- Most tables: INSERT + UPDATE + DELETE. profiles: UPDATE only (creation and
-- deletion happen via service-role edge functions, audited in P3).
-- ============================================================================
DO $$
DECLARE
    t TEXT;
    full_audit_tables TEXT[] := ARRAY[
        'inspection_projects', 'project_vessels', 'vessel_models', 'scan_composites',
        'vessel_scan_placements', 'scan_log_entries', 'calibration_log_entries',
        'inspection_procedures', 'project_files', 'project_images',
        'documents', 'document_revisions', 'document_review_schedule', 'document_categories',
        'employee_competencies', 'competency_definitions', 'competency_categories',
        'organizations'
    ];
BEGIN
    FOREACH t IN ARRAY full_audit_tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'audit_' || t, t);
            EXECUTE format(
                'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                || 'FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
                'audit_' || t, t
            );
        ELSE
            RAISE NOTICE 'Skipping audit trigger: table public.% does not exist', t;
        END IF;
    END LOOP;

    -- profiles: UPDATE only.
    IF to_regclass('public.profiles') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_profiles ON public.profiles';
        EXECUTE 'CREATE TRIGGER audit_profiles AFTER UPDATE ON public.profiles '
             || 'FOR EACH ROW EXECUTE FUNCTION audit_row_change()';
    END IF;
END $$;
