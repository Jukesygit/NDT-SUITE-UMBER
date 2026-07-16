-- Fix: include already-expired certifications in the "expiring competencies" RPCs
--
-- Bug
-- ---
-- The admin "Send to Individual" expiry-reminder picker
-- (ExpiryRemindersSettings.tsx -> useExpiringCompetencies(180) ->
-- get_expiring_competencies) only listed users whose certs expire in the
-- FUTURE. A user whose cert was already past its expiry date never appeared
-- as a candidate, even though the reminder is exactly what they need.
--
-- Root cause: both get_expiring_competencies and
-- get_expiring_competencies_with_comments filtered with
--     AND ec.expiry_date > NOW()
-- which excludes anything already expired.
--
-- This contradicts the rest of the feature, which is designed to include
-- expired certs:
--   * the reminder-threshold UI offers a "0 = Expired / This Month" option,
--   * the send-expiration-reminders edge function (single-user mode) selects
--     competencies with `.lte('expiry_date', now + 180d)` and NO lower bound,
--   * the reminder email template renders a dedicated "Expired" section.
--
-- Fix: drop the `ec.expiry_date > NOW()` lower bound from both functions so
-- the candidate list matches the send path. Certs that expire on or before
-- (NOW() + days_threshold) are returned, including already-expired ones.
-- days_until_expiry is naturally negative for expired certs; existing
-- consumers (ExpiringView, the admin picker) already handle negative values.
--
-- Signatures, SECURITY DEFINER and `SET search_path = public` are preserved
-- from the 2026-02 security-audit definitions.

-- ---------------------------------------------------------------------------
-- get_expiring_competencies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_expiring_competencies(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    ORDER BY ec.expiry_date ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_expiring_competencies_with_comments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_expiring_competencies_with_comments(
    days_threshold INTEGER DEFAULT 30
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_id UUID,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER,
    comment_count BIGINT,
    latest_comment TEXT,
    latest_comment_type TEXT,
    has_renewal_in_progress BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        ec.id as competency_id,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry,
        COUNT(cc.id) as comment_count,
        (
            SELECT cc2.comment_text
            FROM competency_comments cc2
            WHERE cc2.employee_competency_id = ec.id
            ORDER BY cc2.created_at DESC
            LIMIT 1
        ) as latest_comment,
        (
            SELECT cc2.comment_type
            FROM competency_comments cc2
            WHERE cc2.employee_competency_id = ec.id
            ORDER BY cc2.created_at DESC
            LIMIT 1
        ) as latest_comment_type,
        EXISTS (
            SELECT 1 FROM competency_comments cc3
            WHERE cc3.employee_competency_id = ec.id
            AND cc3.comment_type = 'renewal_in_progress'
        ) as has_renewal_in_progress
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    GROUP BY ec.id, ec.user_id, p.username, p.email, cd.name, ec.expiry_date
    ORDER BY ec.expiry_date ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Manual verification (run against a DB that has an expired, active cert):
--
--   SELECT username, competency_name, days_until_expiry
--   FROM get_expiring_competencies(180)
--   WHERE days_until_expiry < 0;
--
-- Expected: rows for users whose certs have already expired (negative
-- days_until_expiry) now appear. Before this migration the result was empty.
-- ---------------------------------------------------------------------------
