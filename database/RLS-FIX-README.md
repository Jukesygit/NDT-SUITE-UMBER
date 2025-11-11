# Supabase RLS Infinite Recursion Fix

## ⚠️ IMPORTANT: Use APPLY-RLS-FIX-V3.sql

**Use the V3 version** (`APPLY-RLS-FIX-V3.sql`) which fixes all syntax issues and is fully compatible with Supabase.

## Problem Solved
This fix resolves the "infinite recursion detected in policy for relation 'profiles'" error that was causing 500 Internal Server errors in your NDT Suite application.

## Root Cause
The RLS policies were querying the `profiles` table within the profiles table's own policies using subqueries like `SELECT 1 FROM profiles WHERE id = auth.uid()`. This created circular dependencies and infinite loops.

## Solution Overview
We've implemented **SECURITY DEFINER functions** that safely retrieve user roles and organization information without triggering RLS recursion. These helper functions bypass RLS when checking user permissions, breaking the circular dependency.

## Files Created

### Core Fix Files (Apply in Order)
1. **`auth-helper-functions.sql`** - Security definer functions for safe role checking
2. **`fix-profiles-rls.sql`** - Fixed policies for profiles table
3. **`fix-competency-rls.sql`** - Fixed policies for competency tables
4. **`fix-requests-rls.sql`** - Fixed policies for permission/account requests

### Convenience Files
- **`APPLY-RLS-FIX.sql`** - Single file containing ALL fixes (recommended)
- **`test-rls-fixes.sql`** - Test queries to verify the fix works

## How to Apply the Fix

### Option 1: Apply All At Once (Recommended)

1. Open your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **SQL Editor**
3. Open the file `database/APPLY-RLS-FIX-V3.sql` **(Use V3!)**
4. Copy the entire contents
5. Paste into Supabase SQL Editor
6. Click **Run** to execute
7. You should see success messages in the output

### Option 2: Apply Individual Files

If you prefer to apply fixes incrementally:

1. First apply `auth-helper-functions.sql`
2. Then apply `fix-profiles-rls.sql`
3. Then apply `fix-competency-rls.sql`
4. Finally apply `fix-requests-rls.sql`

**Important:** They must be applied in this exact order!

## Verification Steps

After applying the fix:

1. **Check Immediate Access:**
   - Your application should no longer show 500 errors
   - The Personnel Management page should load correctly

2. **Run Test Queries:**
   - Open `test-rls-fixes.sql`
   - Run the test queries in Supabase SQL Editor
   - All should complete without recursion errors

3. **Monitor Logs:**
   - Check Supabase logs for any remaining errors
   - Look for absence of "infinite recursion" messages

4. **Test Application Features:**
   - Login as different user roles
   - Verify personnel directory loads
   - Check that pending approvals are visible
   - Test competency management features

## What Changed

### Before (Problematic)
```sql
-- This caused recursion
EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
)
```

### After (Fixed)
```sql
-- This uses helper function - no recursion
public.auth_is_admin()
```

## Helper Functions Created

- `public.auth_user_role()` - Returns current user's role
- `public.auth_user_org_id()` - Returns current user's organization ID
- `public.auth_is_admin()` - Checks if user is admin
- `public.auth_is_org_admin()` - Checks if user is org_admin
- `public.auth_user_info()` - Returns complete user information

These functions are created in the `public` schema (not `auth`) for Supabase compatibility. They use `SECURITY DEFINER` to bypass RLS when checking permissions, preventing circular dependencies.

## Troubleshooting

If you still see errors after applying:

1. **Clear Browser Cache:**
   ```
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Clear application data in DevTools
   ```

2. **Check Applied Policies:**
   ```sql
   SELECT tablename, policyname
   FROM pg_policies
   WHERE tablename = 'profiles'
   ORDER BY policyname;
   ```

3. **Verify Helper Functions Exist:**
   ```sql
   SELECT proname FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
   AND proname LIKE 'auth_%';
   ```

4. **Test Direct Query:**
   ```sql
   -- This should work without recursion
   SELECT COUNT(*) FROM profiles;
   ```

## Rollback (If Needed)

If you need to rollback, the original policies are preserved in:
- `database/supabase-schema.sql`
- `database/competency-schema.sql`
- `database/supabase-profile-schema.sql`

However, note that reverting will bring back the recursion error.

## Support

If you continue experiencing issues:

1. Check the Supabase logs for detailed error messages
2. Verify all migration steps were completed
3. Ensure your Supabase project is on a recent version
4. Contact Supabase support with the error details

## Prevention for Future

When creating new RLS policies:

1. **Never query the same table in its own RLS policy**
2. **Always use the auth helper functions for role checks**
3. **Test new policies thoroughly before deploying**
4. **Use EXPLAIN ANALYZE to check for recursion**

Example of safe policy creation:
```sql
-- Good: Uses helper function from public schema
CREATE POLICY "safe_policy"
    ON some_table FOR SELECT
    USING (public.auth_is_admin() OR user_id = auth.uid());

-- Bad: Queries same table
CREATE POLICY "unsafe_policy"
    ON profiles FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE ...));
```

## Success Indicators

You'll know the fix worked when:
- No more 500 errors in the application
- Personnel Management page loads correctly
- All user roles can access appropriate data
- Supabase logs show no recursion errors
- Query performance is fast (< 100ms for most queries)