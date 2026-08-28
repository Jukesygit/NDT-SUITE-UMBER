-- =============================================================================
-- Two-factor backup codes
-- =============================================================================
-- Backing store for the `manage-backup-codes` Edge Function.
--
-- Backup codes are the ONLY self-service recovery path for a user who has
-- enrolled TOTP and lost the authenticator. Until this table existed the client
-- called an Edge Function that was never deployed, so the feature 404'd and the
-- only recovery route was an admin reset.
--
-- SECURITY MODEL
--   * Codes are stored HASHED, never in plaintext. The stored value is the same
--     self-describing string the client-share passcode uses:
--         pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
--     so the work factor can be raised later without a migration.
--   * A code is SINGLE USE. `used_at` is stamped by a conditional UPDATE
--     (`... WHERE id = $1 AND used_at IS NULL`), so two concurrent redemptions of
--     the same code cannot both succeed.
--   * Rows are unreachable from client sessions. RLS is enabled and NO policy is
--     created for `anon` or `authenticated`, so the only reader/writer is the
--     service role inside the Edge Function (service_role bypasses RLS). This is
--     deliberate: a backup-code digest should never be selectable by the browser,
--     not even by its owner.
--   * Erasure rides the `auth.users` FK cascade, so `delete-user` (which removes
--     the auth user last) destroys a user's codes without needing its own step.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.two_factor_backup_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- Encoded PBKDF2 digest. NEVER the code itself.
    code_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at timestamptz
);

COMMENT ON TABLE public.two_factor_backup_codes IS
    'Hashed single-use 2FA recovery codes. Service-role only; no RLS policy exists for client roles.';
COMMENT ON COLUMN public.two_factor_backup_codes.code_hash IS
    'pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>. Never a plaintext code.';
COMMENT ON COLUMN public.two_factor_backup_codes.used_at IS
    'Stamped once, by a conditional UPDATE guarded on used_at IS NULL. Enforces single use.';

-- The hot path: "give me this user's unredeemed codes".
CREATE INDEX IF NOT EXISTS two_factor_backup_codes_unused_idx
    ON public.two_factor_backup_codes (user_id)
    WHERE used_at IS NULL;

-- A batch shares one salt, so two identical codes in a batch would hash
-- identically. The generator already rejects duplicates; this makes a silent
-- duplicate impossible rather than merely unlikely.
CREATE UNIQUE INDEX IF NOT EXISTS two_factor_backup_codes_user_hash_idx
    ON public.two_factor_backup_codes (user_id, code_hash);

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
ALTER TABLE public.two_factor_backup_codes ENABLE ROW LEVEL SECURITY;

-- Belt and braces alongside the (deliberate) absence of any policy: strip the
-- default grants so the table is not even addressable from a client session.
REVOKE ALL ON public.two_factor_backup_codes FROM anon;
REVOKE ALL ON public.two_factor_backup_codes FROM authenticated;

-- NOTE: no CREATE POLICY here, on purpose. Every legitimate read and write goes
-- through the `manage-backup-codes` Edge Function with the service-role key,
-- which bypasses RLS. Adding a policy for `authenticated` would expose the
-- digests to the browser and is not required by any code path.
