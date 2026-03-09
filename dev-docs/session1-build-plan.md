# Session 1 Build Plan: Security + CI/CD + Compliance Logging

## Overview

We're hardening the NDT Suite frontend-exp branch with three categories of changes: (1) fixing genuine security vulnerabilities found during MR review — insecure randomness, hardcoded passwords, regex bugs, authorization bypasses, missing CSP headers; (2) adding CI/CD tooling — pre-commit hooks, secret scanning, and a full GitLab pipeline; (3) building compliance logging — PII sanitization, structured logging, and database migration to stop caching personal data in activity logs. All work happens on the `frontend-exp` branch. No 2FA in this session — that's Session 2.

## Prerequisites

- Node 20+ installed locally (`node --version`)
- On `frontend-exp` branch (`git branch --show-current`)
- `npm ci` has been run and passes
- Access to Supabase dashboard for applying SQL migrations (after review)
- All 3 existing security migrations are present in `database/migrations/`:
  - `security-audit-fix-2026-02.sql`
  - `security-fix-definer-functions-2026-02.sql`
  - `security-fix-medium-severity-2026-02.sql`
- Baseline passes: `npm run lint` (0 errors), `npm run typecheck` (clean), `npm run build` (succeeds)

---

## Build Steps

### PHASE 1: Security Fixes

---

#### Step 1 — Fix `Math.random()` in password generation

**What:** Replace all `Math.random()` calls in `generateSecurePassword()` with cryptographically secure randomness. Add a `secureRandomIndex(max)` helper that uses `crypto.getRandomValues()`. Replace the `.sort(() => Math.random() - 0.5)` shuffle with a Fisher-Yates shuffle.

**Why:** `Math.random()` is not cryptographically secure. Passwords generated with it have predictable entropy. The `.sort()` shuffle is also biased — it doesn't produce uniform permutations.

**Files touched:**
- [security.js:207-229](src/config/security.js#L207-L229)

**Concrete changes:**

1. Add this helper function above `generateSecurePassword` (around line 202):

```javascript
/**
 * Generate a cryptographically secure random index in [0, max)
 */
function secureRandomIndex(max) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
}
```

2. In `generateSecurePassword` (lines 217-220), replace all 4 `Math.floor(Math.random() * X.length)` calls:

```javascript
// Before:
password += uppercase[Math.floor(Math.random() * uppercase.length)];
// After:
password += uppercase[secureRandomIndex(uppercase.length)];
```

Same for lowercase, numbers, special, and the fill loop (line 224).

3. Replace the shuffle on line 228:

```javascript
// Before:
return password.split('').sort(() => Math.random() - 0.5).join('');

// After (Fisher-Yates):
const chars = password.split('');
for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
}
return chars.join('');
```

**Depends on:** Nothing.

**Verification:** `npm run build` still succeeds.

---

#### Step 2 — Delete `crypto.js` and remove `crypto-js` dependency

**What:** Delete the orphan file `src/utils/crypto.js`, remove `crypto-js` from `package.json` dependencies, and remove `'crypto-js'` from the Vite manual chunks config.

**Why:** `crypto.js` is dead code — no file imports from it (verified via grep). It contains dangerous homebrew crypto: `createSessionToken()` appends the decryption key to the ciphertext (line 241: `encryptData(tokenData, secret) + '.' + secret`). The `crypto-js` npm package is only used by this file, so removing both eliminates a 440KB dependency.

**Files touched:**
- [crypto.js](src/utils/crypto.js) — **DELETE**
- [package.json:60](package.json#L60) — remove `"crypto-js": "^4.2.0"` line
- [vite.config.js:106](vite.config.js#L106) — change `['docx', 'papaparse', 'pdfmake', 'crypto-js', 'bcryptjs']` to `['docx', 'papaparse', 'pdfmake', 'bcryptjs']`

**After editing, run:** `npm install` (to update lockfile after removing crypto-js)

**Keep:** `bcryptjs` stays — it's used by edge functions and the `@types/bcryptjs` devDep confirms it's active.

**Depends on:** Nothing. Can run in parallel with Step 1.

**Verification:** `npm run build` — no "module not found" errors. Confirm the `utils-vendor` chunk no longer includes crypto-js.

---

#### Step 3 — Fix hardcoded passwords

**What:** Replace hardcoded temporary passwords with calls to `generateSecurePassword(16)` from `src/config/security.js`.

**Why:** `'ChangeMe123!'` and `'TempPass123!'` are static strings that any attacker can guess. Even though these are temporary passwords, they exist in the window between account creation and the user changing their password.

**Files touched:**
- [auth-manager.js:1155](src/auth-manager.js#L1155)
- [UniversalImportModal.jsx:479](src/components/UniversalImportModal.jsx#L479)

**Concrete changes:**

In `auth-manager.js`, add a static import at the top of the file (after existing imports, around line 5):

```javascript
import { generateSecurePassword } from './config/security.js';
```

Then replace line 1155:

```javascript
// Before:
const tempPassword = 'ChangeMe123!';
// After:
const tempPassword = generateSecurePassword(16);
```

In `UniversalImportModal.jsx`, add the same import at the top:

```javascript
import { generateSecurePassword } from '../config/security.js';
```

Then replace line 479:

```javascript
// Before:
const tempPassword = 'TempPass123!';
// After:
const tempPassword = generateSecurePassword(16);
```

**Note (from steelman):** Use a static import, not dynamic `import()`. Both files support ESM (package.json has `"type": "module"`). A static import keeps the call synchronous and avoids refactoring the surrounding code to handle Promises.

**Depends on:** Step 1 (the function must use secure randomness before we start relying on it).

**Verification:** `npm run typecheck` (auth-manager.js is JS so this is more about the JSX file). `npm run build`.

---

#### Step 4 — Fix regex `/g` flag bug in validation.js

**What:** Remove the `/g` flag from all regex patterns in `SQL_INJECTION_PATTERNS` and `XSS_PATTERNS`.

**Why:** When `.test()` is called on a regex with the `/g` flag, JavaScript's RegExp maintains a `lastIndex` state. The second call to `.test()` with the same regex starts from where the last match ended, causing alternating `true`/`false` results. This means the validation silently passes every other input.

**Files touched:**
- [validation.js:16-29](src/utils/validation.js#L16-L29)

**Concrete changes:**

Lines 16-20, remove `/g` from all three patterns, keeping `/i` where present:

```javascript
// Before:
/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT)\b)/gi,
/(--|#|\/\*|\*\/|;|\||&&|\|\|)/g,
/('|(')|"|(")|(\\x27)|(\\x22))/g

// After:
/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT)\b)/i,
/(--|#|\/\*|\*\/|;|\||&&|\|\|)/,
/('|(')|"|(")|(\\x27)|(\\x22))/
```

Lines 23-29, same for XSS patterns:

```javascript
// Before (all have /gi):
/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
/on\w+\s*=\s*["'][^"']*["']/gi,
/javascript:/gi,
/<iframe/gi,
/<embed/gi,
/<object/gi

// After (keep /i, drop /g):
/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
/on\w+\s*=\s*["'][^"']*["']/i,
/javascript:/i,
/<iframe/i,
/<embed/i,
/<object/i
```

**Depends on:** Nothing. Can run in parallel with Steps 1-3.

**Verification:** `npm run build`.

---

#### Step 5 — Fix userId spoofing in activity logs

**What:** Remove the optional `userId` field from `LogActivityParams` and `createActivityLogger` options. Force all activity logs to use the authenticated user's ID from `supabase.auth.getUser()`.

**Why:** The current code at line 148 does `params.userId || user?.id`, meaning any caller can pass an arbitrary `userId` to attribute actions to another user. This is an impersonation vector.

**Files touched:**
- [activity-log-service.ts:122-131](src/services/activity-log-service.ts#L122-L131) — remove `userId?` from `LogActivityParams`
- [activity-log-service.ts:148](src/services/activity-log-service.ts#L148) — change to `const userId = user?.id`
- [activity-log-service.ts:179-185](src/services/activity-log-service.ts#L179-L185) — remove `userId?` from `createActivityLogger` options type

**Concrete changes:**

1. Line 123 — delete the `userId?: string;` line from the interface.

2. Line 148 — replace:
```typescript
// Before:
const userId = params.userId || user?.id;
// After:
const userId = user?.id;
```

3. Lines 179-185 — remove `userId?: string;` from the options type in `createActivityLogger`.

**TypeScript will catch any callers that were passing `userId`.** Run `npm run typecheck` and fix any compile errors by removing the `userId` argument from those call sites.

**Depends on:** Nothing. Can run in parallel with Steps 1-4.

**Verification:** `npm run typecheck` — 0 errors. No caller should be passing `userId` (the explore agent found none), but typecheck confirms it.

---

#### Step 6 — Harden file upload validation

**What:** Add a file extension allowlist and fix path traversal in `competencySlug`.

**Why:** MIME type validation alone can be spoofed (change Content-Type header). The `competencySlug` sanitization only replaces spaces with underscores — a name like `../../etc/passwd` passes through, allowing writes to arbitrary storage paths.

**Files touched:**
- [useUploadCompetencyDocument.ts:35-53](src/hooks/mutations/useUploadCompetencyDocument.ts#L35-L53)

**Concrete changes:**

After the MIME type check (line 42) and size check (line 47), add an extension check:

```typescript
// Validate file extension (defense-in-depth alongside MIME check)
const fileExt = file.name.split('.').pop()?.toLowerCase();
const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
if (!fileExt || !allowedExtensions.includes(fileExt)) {
    throw new Error('File type not allowed. Supported: JPG, PNG, GIF, WebP, PDF.');
}
```

Then fix line 51 — the `competencySlug` sanitization:

```typescript
// Before:
const competencySlug = competencyName.replace(/\s+/g, '_').toLowerCase();

// After:
const competencySlug = competencyName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
```

This strips everything except alphanumeric, underscore, and hyphen — including `../`, `/`, and `.`.

Also remove the duplicate `fileExt` declaration on line 50 since we now declare it above:

```typescript
// Before (line 50):
const fileExt = file.name.split('.').pop();

// After: remove this line, use the fileExt from the validation above
```

**Depends on:** Nothing. Can run in parallel with Steps 1-5.

**Verification:** `npm run typecheck && npm run build`.

---

#### Step 7 — CSP + security headers

**What:** Fix the production CSP in `vite.config.js` (add `'unsafe-inline'` to `style-src`) and add security headers to `vercel.json`.

**Why:** The preview CSP (line 71) is missing `'unsafe-inline'` in `style-src`. Tailwind CSS 4 and React both generate inline styles — this CSP breaks the entire UI in production. The `vercel.json` currently only has SPA rewrite rules and no security headers. Since the app deploys to Vercel, the `vercel.json` headers are what actually run in production (not Vite's preview headers).

**Files touched:**
- [vite.config.js:67-83](vite.config.js#L67-L83) — fix preview CSP
- [vercel.json](vercel.json) — add headers block

**Concrete changes in vite.config.js:**

Line 71, change:
```javascript
// Before:
"style-src 'self' https://fonts.googleapis.com",
// After:
"style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
```

Line 77, change `object-src` to `'none'` (the app uses `<iframe>` for PDFs, not `<object>`):
```javascript
// Before:
"object-src 'self' https://*.supabase.co blob:",
// After:
"object-src 'none'",
```

**Concrete changes in vercel.json:**

Replace the entire file:

```json
{
  "rewrites": [
    {
      "source": "/((?!assets/).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; frame-src 'self' https://*.supabase.co blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
        }
      ]
    }
  ]
}
```

**Depends on:** Nothing. Can run in parallel with Steps 1-6.

**Verification:** `npm run build`. Then `npm run preview` and check DevTools console for CSP violations (should be none).

---

#### Step 8 — Lazy-load React Query Devtools

**What:** Change the ReactQueryDevtools import in App.jsx from an eager import to a lazy one, gated behind `import.meta.env.DEV`.

**Why:** The library auto-excludes from production builds, but the eager import still adds ~60KB to the dev bundle parse time. Lazy-loading is free and follows React best practices.

**Files touched:**
- [App.jsx:4](src/App.jsx#L4) — change import
- [App.jsx:163](src/App.jsx#L163) — change render

**Concrete changes:**

Line 4, replace:
```jsx
// Before:
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// After:
const ReactQueryDevtools = lazy(() =>
    import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools }))
);
```

(`lazy` is already imported on line 2.)

Line 163, replace:
```jsx
// Before:
<ReactQueryDevtools initialIsOpen={false} />

// After:
{import.meta.env.DEV && (
    <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
    </Suspense>
)}
```

(`Suspense` is already imported on line 2.)

**Depends on:** Nothing. Can run in parallel with Steps 1-7.

**Verification:** `npm run build` — no errors. `npm run dev` — devtools still appear.

---

#### Step 9 — SQL security delta migration

**What:** Create a new SQL migration file that fixes the remaining gaps in the 3 existing security migrations. This is a *delta* — it only fixes what's broken, not a full rewrite.

**Why:** The existing migrations have 5 specific bugs:
1. `approve_permission_request()` — org_admin from org A can approve org B's requests (no cross-org check)
2. `reject_permission_request()` — same cross-org bug
3. Both expose `SQLERRM` in error returns (leaks internal DB details to the client)
4. `cleanup_old_activity_logs()` — any user can call it (no admin guard)
5. `log_activity()` — the 5-param version in `security-fix-definer-functions` breaks the service (expects 10 params)
6. `get_expiring_competencies()` — no authorization (any user sees all orgs' data)

**Files touched:**
- **NEW:** `database/migrations/security-hardening-delta-2026-02.sql`

**Concrete content:**

```sql
-- Security Hardening Delta Migration
-- Date: 2026-02
-- Fixes gaps in existing security migrations:
--   1. Cross-org IDOR in approve/reject_permission_request
--   2. SQLERRM exposure in error handlers
--   3. Missing admin guard on cleanup_old_activity_logs
--   4. Wrong log_activity signature (5-param → restore 10-param)
--   5. Missing org-scoped visibility in get_expiring_competencies

-- ============================================================================
-- FIX 1: approve_permission_request — add cross-org check + suppress SQLERRM
-- Pattern: matches approve_asset_access_request from security-fix-medium-severity
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_permission_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
BEGIN
    -- Verify caller is admin or org_admin of the SAME org as the requester
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (
            role = 'admin'
            OR (role = 'org_admin' AND organization_id = (
                SELECT p.organization_id FROM permission_requests pr
                JOIN profiles p ON p.id = pr.user_id
                WHERE pr.id = request_id
            ))
        )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    UPDATE profiles
    SET role = request_record.requested_role, updated_at = NOW()
    WHERE id = request_record.user_id;

    UPDATE permission_requests
    SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request approved');
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'approve_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- ============================================================================
-- FIX 2: reject_permission_request — add cross-org check + suppress SQLERRM
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (
            role = 'admin'
            OR (role = 'org_admin' AND organization_id = (
                SELECT p.organization_id FROM permission_requests pr
                JOIN profiles p ON p.id = pr.user_id
                WHERE pr.id = request_id
            ))
        )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    UPDATE permission_requests
    SET status = 'rejected', rejected_by = auth.uid(), rejected_at = NOW(), rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'reject_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- ============================================================================
-- FIX 3: cleanup_old_activity_logs — add admin-only guard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    DELETE FROM activity_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================================================
-- FIX 4: log_activity — restore canonical 10-param signature
-- The 5-param version in security-fix-definer-functions breaks activity-log-service.ts
-- which calls rpc('log_activity') with 10 named parameters.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_category TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
    v_log_id UUID;
BEGIN
    -- Get user info for historical caching
    -- NOTE: Step 3.7 will update this to pass NULL instead (PII compliance)
    IF p_user_id IS NOT NULL THEN
        SELECT email, username INTO v_user_email, v_user_name
        FROM profiles WHERE id = p_user_id;
    END IF;

    INSERT INTO activity_log (
        user_id, user_email, user_name,
        action_type, action_category, description, details,
        entity_type, entity_id, entity_name,
        ip_address, user_agent
    ) VALUES (
        p_user_id, v_user_email, v_user_name,
        p_action_type, p_action_category, p_description, p_details,
        p_entity_type, p_entity_id, p_entity_name,
        p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity TO authenticated;

-- ============================================================================
-- FIX 5: get_expiring_competencies — add org-scoped visibility
-- Currently any authenticated user can see ALL organizations' expiring competencies
-- ============================================================================
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
DECLARE
    caller_role TEXT;
    caller_org UUID;
BEGIN
    SELECT role, organization_id INTO caller_role, caller_org
    FROM profiles WHERE id = auth.uid();

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
        AND ec.expiry_date > NOW()
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
        AND (
            caller_role = 'admin'
            OR p.organization_id = caller_org
        )
    ORDER BY ec.expiry_date ASC;
END;
$$;
```

**Depends on:** Nothing (SQL is independent of frontend code). But must be applied to Supabase *before* testing activity logging in the browser.

**Risk:** If the 5-param `log_activity` was already applied to prod, the service is currently broken in prod. This migration restores the 10-param version regardless.

**Verification:** Apply in Supabase SQL editor. Test: call `select log_activity(null, 'test', 'config', 'test', null, null, null, null, null, null)` — should return a UUID, not an error.

---

### PHASE 1 CHECKPOINT

Run all 4 checks before proceeding:
```bash
npm run lint        # 0 errors
npm run typecheck   # clean
npm run build       # succeeds
npm run test        # passes (security.test.js)
```

---

### PHASE 2: CI/CD + Scanning

*Can start in parallel with Phase 1 — no code dependencies between phases.*

---

#### Step 10 — Add husky + lint-staged

**What:** Install pre-commit hook tooling so lint and format checks run automatically on staged files before every commit.

**Why:** The codebase has 93 lint warnings and zero pre-commit enforcement. Without hooks, the new CI pipeline will reject commits that devs think are clean.

**Files touched:**
- `package.json` — add devDeps + `"prepare"` script
- **NEW:** `.husky/pre-commit`
- **NEW:** `.lintstagedrc.json`

**Concrete steps:**

1. Install:
```bash
npm install -D husky lint-staged
```

2. Add prepare script to package.json scripts:
```json
"prepare": "husky"
```

3. Initialize husky:
```bash
npx husky init
```

4. Write `.husky/pre-commit`:
```bash
npx lint-staged
```

5. Write `.lintstagedrc.json`:
```json
{
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write"
  ],
  "*.{json,css,md}": [
    "prettier --write"
  ]
}
```

**Note:** `--max-warnings=0` means lint-staged will fail if any warnings are introduced in *staged* files. Existing warnings in untouched files won't trigger.

**Windows note:** Husky works with Git Bash (which Git for Windows bundles). If hooks fail, the escape hatch is `SKIP=lint git commit -m "..."`.

**Depends on:** Nothing.

**Verification:** Stage a file with a lint error, try to commit — should be blocked. Fix and commit — should succeed.

---

#### Step 11 — Add gitleaks config

**What:** Create a `.gitleaks.toml` config file to tune secret scanning for this project.

**Why:** Without an allowlist, gitleaks flags false positives in `package-lock.json` (integrity hashes) and `.env.example` (placeholder values).

**Files touched:**
- **NEW:** `.gitleaks.toml`

**Content:**
```toml
title = "NDT Suite Gitleaks Config"

[allowlist]
  paths = [
    '''package-lock\.json''',
    '''\.env\.example''',
    '''\.env\.local\.example'''
  ]
```

**Depends on:** Nothing. Can run in parallel with Step 10.

**Verification:** If gitleaks is installed locally: `gitleaks detect --source . -v` — should have 0 findings.

---

#### Step 12 — Expand .gitlab-ci.yml to 5 stages

**What:** Rewrite the GitLab CI pipeline from 3 stages to 5: install → security → quality → test → build. Add gitleaks, semgrep, npm audit, format-check, and test coverage.

**Why:** The current pipeline has no secret scanning, no SAST, no format enforcement, and no test stage. The build stage doesn't require tests to pass.

**Files touched:**
- [.gitlab-ci.yml](.gitlab-ci.yml) — full rewrite
- [package.json:7](package.json#L7) — update engines to `"node": ">=20.0.0"`

**Content for `.gitlab-ci.yml`:**

```yaml
stages:
  - install
  - security
  - quality
  - test
  - build

default:
  image: node:20-alpine

# Cache node_modules across jobs, keyed on lockfile
cache:
  key:
    files:
      - package-lock.json
  paths:
    - node_modules/

# Branch rules: run on MRs and these branches
.branch-rules:
  rules:
    - if: $CI_MERGE_REQUEST_IID
    - if: $CI_COMMIT_BRANCH =~ /^(main|master|dev|dev-refactor|frontend-exp)$/

# ---- INSTALL ----
install:
  stage: install
  script:
    - npm ci
  extends: .branch-rules

# ---- SECURITY ----
gitleaks:
  stage: security
  image:
    name: zricethezav/gitleaks:v8.21.2
    entrypoint: [""]
  script:
    - gitleaks detect --source . --verbose --redact
  needs: []
  extends: .branch-rules

semgrep:
  stage: security
  image:
    name: semgrep/semgrep:1.56.0
    entrypoint: [""]
  script:
    - semgrep --config auto --error --severity ERROR src/
  needs: []
  allow_failure: true
  extends: .branch-rules

npm-audit:
  stage: security
  script:
    - npm audit --audit-level=high
  needs: [install]
  allow_failure: true
  extends: .branch-rules

# ---- QUALITY ----
lint:
  stage: quality
  script:
    - npm run lint
  needs: [install]
  extends: .branch-rules

format-check:
  stage: quality
  script:
    - npm run format:check
  needs: [install]
  extends: .branch-rules

typecheck:
  stage: quality
  script:
    - npm run typecheck
  needs: [install]
  extends: .branch-rules

# ---- TEST ----
test:
  stage: test
  script:
    - npx vitest run --coverage
  artifacts:
    paths:
      - coverage/
    expire_in: 1 week
  needs: [install]
  extends: .branch-rules

# ---- BUILD ----
build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
  needs: [lint, format-check, typecheck, test]
  extends: .branch-rules
```

**Key decisions:**
- `gitleaks` and `semgrep` run in parallel (no `needs: [install]` — they use their own images)
- `semgrep` is `allow_failure: true` initially — it may flag things that need tuning
- `build` requires all quality + test jobs to pass
- `frontend-exp` added to the branch rules regex

**Depends on:** Steps 10 + 11 (gitleaks config should exist before CI references it).

**Verification:** `git push` to GitLab and check the pipeline runs. Or validate locally: `npm run lint && npm run format:check && npm run typecheck && npx vitest run && npm run build`.

---

### PHASE 2 CHECKPOINT

All CI tooling is in place. Test the full local pipeline:
```bash
npm run lint && npm run format:check && npm run typecheck && npx vitest run && npm run build
```

---

### PHASE 3: Compliance Logging

---

#### Step 13 — Create logging config

**What:** Create a config file that defines log levels and a list of PII field names to watch for.

**Why:** Centralizes all logging configuration in one place. The PII_FIELDS set is used by the sanitizer (Step 14) to know which fields to redact.

**Files touched:**
- **NEW:** `src/config/logging.ts`

**Content:**

```typescript
/** Log severity levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Logging configuration */
export const LOG_CONFIG = {
    /** Maximum entries in the ring buffer */
    maxEntries: 100,
    /** Minimum level to output to console (dev only) */
    minLevel: 'debug' as LogLevel,
    /** Whether console output is enabled */
    consoleEnabled: import.meta.env.DEV,
} as const;

/** Field names that contain PII and must be redacted before logging */
export const PII_FIELDS = new Set([
    'email',
    'user_email',
    'username',
    'user_name',
    'firstName',
    'first_name',
    'lastName',
    'last_name',
    'phone',
    'address',
    'ssn',
    'password',
    'token',
    'secret',
]);
```

**Depends on:** Nothing.

---

#### Step 14 — Create PII sanitizer

**What:** Create utility functions that redact emails from strings and strip PII fields from objects.

**Why:** Activity logs and error reports should never contain personal data. GDPR requires it; the existing code logs emails and usernames directly into `description` fields that get stored in the database.

**Files touched:**
- **NEW:** `src/utils/pii-sanitizer.ts`

**Content:**

```typescript
import { PII_FIELDS } from '../config/logging';

/** Redact email addresses in a string: "user@example.com" → "[EMAIL]" */
export function redactEmails(text: string): string {
    return text.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[EMAIL]'
    );
}

/** Recursively strip PII fields from an object (shallow copy, 2 levels deep) */
export function stripPiiFromObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PII_FIELDS.has(key)) {
            result[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
            result[key] = redactEmails(value);
        } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = stripPiiFromObject(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/** Sanitize a log message string: redact emails + known PII patterns */
export function sanitizeLogMessage(message: string): string {
    return redactEmails(message);
}
```

**Depends on:** Step 13 (imports `PII_FIELDS`).

---

#### Step 15 — Create structured logger

**What:** Create a ring buffer logger that sanitizes PII on every entry and supports `logger.dump()` for debugging.

**Why:** The app currently has zero structured logging. When users report bugs, there's no way to see what happened. The ring buffer keeps the last 100 entries in memory (no network, no disk) so `logger.dump()` in the browser console shows sanitized recent history.

**Note (from steelman):** Drop correlation IDs — there's no distributed tracing to correlate with. Keep the ring buffer (genuine value). Use a union type for LogLevel, not an enum.

**Files touched:**
- **NEW:** `src/lib/logger.ts`

**Content:**

```typescript
import { LOG_CONFIG, type LogLevel } from '../config/logging';
import { sanitizeLogMessage, stripPiiFromObject } from '../utils/pii-sanitizer';

interface LogEntry {
    level: LogLevel;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private buffer: LogEntry[] = [];

    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
            level,
            message: sanitizeLogMessage(message),
            data: data ? stripPiiFromObject(data) : undefined,
            timestamp: new Date().toISOString(),
        };

        // Ring buffer: remove oldest if full
        if (this.buffer.length >= LOG_CONFIG.maxEntries) {
            this.buffer.shift();
        }
        this.buffer.push(entry);

        // Console output in dev only
        if (LOG_CONFIG.consoleEnabled && LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[LOG_CONFIG.minLevel]) {
            const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            consoleFn(`[${level.toUpperCase()}] ${entry.message}`, entry.data ?? '');
        }
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    warn(message: string, data?: Record<string, unknown>): void {
        this.log('warn', message, data);
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.log('error', message, data);
    }

    /** Dump all buffered entries (call from browser console for debugging) */
    dump(): LogEntry[] {
        return [...this.buffer];
    }

    /** Clear the buffer */
    clear(): void {
        this.buffer = [];
    }
}

export const logger = new Logger();

// Expose to browser console for debugging
if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__logger = logger;
}
```

**Depends on:** Steps 13 + 14.

---

#### Step 16 — Remove PII from auth-manager log descriptions

**What:** Replace all `logActivity()` calls in `auth-manager.js` that embed usernames or emails in template literals.

**Why:** These strings get stored in the `activity_log.description` column in Supabase. Under GDPR, personal data in logs must be either redacted or justified with a retention policy.

**Files touched:**
- [auth-manager.js:320-325](src/auth-manager.js#L320-L325)
- [auth-manager.js:338-343](src/auth-manager.js#L338-L343)
- [auth-manager.js:404-409](src/auth-manager.js#L404-L409)

**Concrete changes:**

Line 320-325 (login success):
```javascript
// Before:
description: `User ${this.currentUser.username || email} logged in successfully`,

// After:
description: 'Login successful',
```

Line 338-343 (login failed):
```javascript
// Before:
description: `Login failed for ${email}`,
details: { email },

// After:
description: 'Login failed',
details: { reason: 'invalid_credentials' },
```

Line 404-409 (logout):
```javascript
// Before:
description: `User ${username || 'Unknown'} logged out`,

// After:
description: 'Logout successful',
```

**Depends on:** Nothing (doesn't require the logger, just removing PII from existing calls).

---

#### Step 17 — Sanitize activity-log-service writes

**What:** Run PII sanitization on `description` and `details` fields before they're sent to the database via `supabase.rpc('log_activity', ...)`.

**Why:** Defense-in-depth. Even if individual callers forget to remove PII from their descriptions, the sanitizer catches email addresses and PII field names at the service boundary.

**Files touched:**
- [activity-log-service.ts:141-166](src/services/activity-log-service.ts#L141-L166)

**Concrete changes:**

Add import at the top of the file:
```typescript
import { sanitizeLogMessage, stripPiiFromObject } from '../utils/pii-sanitizer';
```

In `logActivity()`, before the RPC call (around line 150), sanitize:
```typescript
const sanitizedDescription = sanitizeLogMessage(params.description);
const sanitizedDetails = params.details ? stripPiiFromObject(params.details) : null;
```

Then in the RPC call, use the sanitized versions:
```typescript
p_description: sanitizedDescription,
p_details: sanitizedDetails,
```

**Depends on:** Step 5 (userId fix must land first — same file), Step 14 (imports sanitizer).

---

#### Step 18 — Wire logger into error handlers

**What:** Replace no-op stubs and `console.error` calls in the error handling files with the structured logger. Also modernize `process.env.NODE_ENV` to `import.meta.env.DEV`.

**Why:** The error handlers currently have placeholder functions that do nothing (`logError`, `notifyUser`, `reportError` are all no-ops). The `process.env.NODE_ENV` pattern works in Vite only because Vite string-replaces it, but `import.meta.env.DEV` is the idiomatic Vite way.

**Files touched:**
- [errorHandler.ts:96,129,178-180](src/utils/errorHandler.ts)
- [GlobalErrorBoundary.jsx:21,31](src/components/GlobalErrorBoundary.jsx)
- [ErrorBoundary.tsx:39,50](src/components/ErrorBoundary.tsx)
- [auth-manager.js:256](src/auth-manager.js#L256)

**Concrete changes in errorHandler.ts:**

Add import:
```typescript
import { logger } from '../lib/logger';
```

Line 96: replace `process.env.NODE_ENV === 'production'` with `!import.meta.env.DEV`.

Line 129: replace `process.env.NODE_ENV === 'development'` with `import.meta.env.DEV`.

Lines 178-180 — fill in `logError`:
```typescript
function logError(errorInfo: ClassifiedError): void {
    logger.error(errorInfo.message, {
        type: errorInfo.type,
        severity: errorInfo.severity,
        recoverable: String(errorInfo.recoverable),
    });
}
```

**Concrete changes in GlobalErrorBoundary.jsx:**

Line 21: replace `console.error('Global Error Boundary caught:', error, errorInfo)` with:
```javascript
import { logger } from '../lib/logger';
// ... in componentDidCatch:
logger.error('Global error boundary caught', { component: errorInfo?.componentStack?.slice(0, 200) });
```

Line 31: replace `process.env.NODE_ENV === 'production'` with `!import.meta.env.DEV`.

**Concrete changes in ErrorBoundary.tsx:**

Lines 39, 50: replace `process.env.NODE_ENV` checks with `import.meta.env.DEV` / `!import.meta.env.DEV`.

**Concrete changes in auth-manager.js:**

Line 256: replace `process.env.NODE_ENV === 'development'` with `import.meta.env.DEV`.

**Depends on:** Step 15 (logger must exist).

---

#### Step 19 — SQL migration: stop caching PII in activity logs

**What:** Update `log_activity()` to pass NULL for `user_email` and `user_name` columns. Update the service to JOIN with profiles at read time instead.

**Why:** The current `log_activity` function caches email/username at write time. This means: (a) PII is stored in logs permanently, (b) name changes aren't reflected in historical logs, (c) GDPR "right to erasure" requires scrubbing these columns. The JOIN approach gets current data at read time and returns NULL for deleted users.

**Files touched:**
- **NEW:** `database/migrations/compliance-stop-caching-pii-2026-02.sql`
- [activity-log-service.ts:221-223](src/services/activity-log-service.ts#L221-L223) — update query

**SQL content:**

```sql
-- Compliance: Stop caching PII in activity_log
-- Date: 2026-02
-- Changes log_activity to pass NULL for user_email/user_name columns.
-- Read path joins with profiles table instead.
-- NOTE: This supersedes the log_activity in security-hardening-delta (Step 9).

CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_category TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    -- PII compliance: do NOT cache email/username in log rows
    INSERT INTO activity_log (
        user_id, user_email, user_name,
        action_type, action_category, description, details,
        entity_type, entity_id, entity_name,
        ip_address, user_agent
    ) VALUES (
        p_user_id, NULL, NULL,
        p_action_type, p_action_category, p_description, p_details,
        p_entity_type, p_entity_id, p_entity_name,
        p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity TO authenticated;
```

**Service change in activity-log-service.ts:**

Line 221-223, update the `getActivityLogs` query to JOIN with profiles:

```typescript
// Before:
let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' });

// After:
let query = supabase
    .from('activity_log')
    .select('*, profiles:user_id(username, email)', { count: 'exact' });
```

Where this data is displayed, use `entry.profiles?.username ?? '[Deleted User]'` instead of `entry.user_name`.

**Depends on:** Step 9 (the 10-param signature must exist first, or this migration would have nothing to `CREATE OR REPLACE`).

---

#### Step 20 — Edge function logger/sanitizer copies

**What:** Create Deno-compatible copies of the PII sanitizer and logger for use in Supabase edge functions.

**Why:** Edge functions run in Deno, not Node. They can't import from `src/`. They need their own copies that follow the existing `_shared/` pattern (see `_shared/cors.ts`, `_shared/auth.ts`).

**Files touched:**
- **NEW:** `supabase/functions/_shared/pii-sanitizer.ts`
- **NEW:** `supabase/functions/_shared/logger.ts`

**pii-sanitizer.ts content:**

```typescript
const PII_FIELDS = new Set([
    'email', 'user_email', 'username', 'user_name',
    'firstName', 'first_name', 'lastName', 'last_name',
    'phone', 'address', 'ssn', 'password', 'token', 'secret',
]);

export function redactEmails(text: string): string {
    return text.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[EMAIL]'
    );
}

export function stripPiiFromObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PII_FIELDS.has(key)) {
            result[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
            result[key] = redactEmails(value);
        } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = stripPiiFromObject(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function sanitizeLogMessage(message: string): string {
    return redactEmails(message);
}
```

**logger.ts content:**

```typescript
import { sanitizeLogMessage, stripPiiFromObject } from './pii-sanitizer.ts';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
}

class Logger {
    private entries: LogEntry[] = [];

    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
            level,
            message: sanitizeLogMessage(message),
            data: data ? stripPiiFromObject(data) : undefined,
            timestamp: new Date().toISOString(),
        };
        this.entries.push(entry);
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
            `[${level.toUpperCase()}] ${entry.message}`, entry.data ?? ''
        );
    }

    debug(msg: string, data?: Record<string, unknown>) { this.log('debug', msg, data); }
    info(msg: string, data?: Record<string, unknown>) { this.log('info', msg, data); }
    warn(msg: string, data?: Record<string, unknown>) { this.log('warn', msg, data); }
    error(msg: string, data?: Record<string, unknown>) { this.log('error', msg, data); }
}

export const logger = new Logger();
```

**Note:** Deno imports use `.ts` extensions (e.g., `from './pii-sanitizer.ts'`).

**Depends on:** Steps 14 + 15 (for reference, not imports — these are standalone copies).

---

### PHASE 3 CHECKPOINT

Run all checks:
```bash
npm run lint        # 0 errors
npm run typecheck   # clean
npm run build       # succeeds
npm run test        # passes
```

Manual smoke test:
- Login → check activity log for "Login successful" (no email in description)
- Upload a competency document → verify path doesn't contain `../`
- Open DevTools console → type `__logger.dump()` (dev only) → see sanitized entries

---

## Verification (Full Session 1)

After all 20 steps:

1. **Automated checks pass:**
   ```bash
   npm run lint && npm run format:check && npm run typecheck && npx vitest run && npm run build
   ```

2. **Pre-commit hook works:**
   ```bash
   # Stage a file with a lint error → commit should fail
   # Fix → commit should succeed
   ```

3. **Security migrations applied:**
   - `log_activity` accepts 10 params (test via Supabase SQL editor)
   - `cleanup_old_activity_logs` rejects non-admin callers
   - `approve_permission_request` rejects cross-org org_admin

4. **CSP works:**
   - `npm run preview` → no CSP violations in DevTools console
   - Inline styles render correctly

5. **PII sanitization works:**
   - Login/logout → `activity_log.description` says "Login successful" not "User jonas@..."
   - `activity_log.user_email` and `user_name` are NULL in new rows

6. **Logger works (dev):**
   - Open DevTools → `__logger.dump()` → see sanitized entries
   - Error boundary triggers → logger captures it

---

## Dependency Graph (visual)

```
Steps 1-8, 10-11, 13, 16: Independent — can run in parallel

Step 3 → Step 1 (needs secure generateSecurePassword)
Step 12 → Steps 10, 11 (CI references gitleaks config + husky)
Step 14 → Step 13 (imports PII_FIELDS)
Step 15 → Steps 13, 14 (imports both)
Step 17 → Steps 5, 14 (same file as Step 5; imports sanitizer)
Step 18 → Step 15 (imports logger)
Step 19 → Step 9 (10-param log_activity must exist)
Step 20 → Steps 14, 15 (reference, not import)
```

---

## Risks and External Dependencies

| Risk | Mitigation |
|------|------------|
| SQL migrations break prod if applied out of order | Each uses `CREATE OR REPLACE` — idempotent. Apply Step 9 before Step 19. |
| Husky fails on Windows | Test with Git Bash. Document `SKIP=lint git commit` escape hatch. |
| gitleaks/semgrep not yet installed on GitLab runner | CI uses Docker images — no local install needed. |
| `object-src 'none'` breaks something | PDF viewer uses `<iframe>`, not `<object>`. If something breaks, change to `object-src 'self'`. |
| JOIN for deleted user profiles returns NULL | Display `?? '[Deleted User]'` fallback in UI components. |
| CI pipeline diverges from senior's version | Intentional — our pipeline is strictly superior. Merge conflict will be "pick ours". |
