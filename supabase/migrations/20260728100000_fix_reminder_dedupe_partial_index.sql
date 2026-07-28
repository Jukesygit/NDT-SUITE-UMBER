-- Fix: daily-repeat certification reminders (2026-07-17..28)
--
-- Root cause: January 2026 sends failed ("matrixportal.io domain is not
-- verified") and were logged with status='failed'. The candidate function
-- get_users_for_expiration_reminder only excludes users with a status='sent'
-- row, but idx_unique_user_threshold_year counted ANY row — so trapped users
-- were re-emailed every morning while the duplicate log insert silently
-- collided with the January failed row and recorded nothing.
--
-- Fix: (1) close out the pre-Feb-2026 failed rows (those users have since
-- been reminded, repeatedly); (2) make the unique index partial on
-- status='sent' so the index and the candidate query finally agree — failed
-- sends may retry on later runs, and only a successful send closes the
-- user+threshold+year slot.

UPDATE email_reminder_log
SET status = 'sent',
    error_message = 'jan-2026 send failed (unverified domain); superseded by repeated sends 2026-07-17..2026-07-28 caused by dedupe bug; closed 2026-07-28'
WHERE status = 'failed'
  AND sent_at < '2026-02-01';

DROP INDEX IF EXISTS idx_unique_user_threshold_year;

CREATE UNIQUE INDEX idx_unique_user_threshold_year
    ON email_reminder_log (
        user_id,
        threshold_months,
        (EXTRACT(YEAR FROM (sent_at AT TIME ZONE 'Europe/London'))::INTEGER)
    )
    WHERE status = 'sent';
