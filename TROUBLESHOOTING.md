# NDT Suite - Troubleshooting Guide

> **Quick Reference**: Common issues and their solutions
> **Last Updated**: 2025-11-11

---

## Table of Contents
1. [Authentication Issues](#authentication-issues)
2. [Database & Supabase](#database--supabase)
3. [Build & Development](#build--development)
4. [Permissions & RLS](#permissions--rls)
5. [UI & Rendering](#ui--rendering)
6. [File Uploads & Storage](#file-uploads--storage)
7. [Performance Issues](#performance-issues)
8. [Deployment](#deployment)

---

## Authentication Issues

### Problem: User stuck on login page after clicking magic link

**Symptoms**:
- Magic link clicked
- Redirected back to app
- Still shows login page

**Causes**:
1. Session not properly stored
2. Auth state change listener not firing
3. PKCE flow interrupted

**Solutions**:

```javascript
// Check 1: Verify localStorage has session
localStorage.getItem('ndt-suite-auth')

// Check 2: Manually check session
import supabase from './supabase-client.js';
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);

// Check 3: Clear stale session and retry
localStorage.removeItem('ndt-suite-auth');
// Try login again
```

**Prevention**:
- Ensure `autoRefreshToken: true` in supabase-client.js
- Check browser console for auth errors
- Verify magic link hasn't expired (1 hour limit)

---

### Problem: "User not found" after successful login

**Symptoms**:
- Login succeeds
- Error: "User profile not found"
- App shows error or redirects to login

**Cause**:
Profile not created in `profiles` table after user signup

**Solution**:

```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- If missing, recreate trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Manually create profile for existing user
INSERT INTO profiles (id, username, email, role, organization_id)
VALUES (
    'USER_UUID_HERE',
    'username',
    'user@email.com',
    'viewer',
    (SELECT id FROM organizations WHERE name = 'Demo Organization')
);
```

**Prevention**:
- Always run full schema setup (including triggers)
- Test user signup flow end-to-end

---

### Problem: Magic link not being sent

**Symptoms**:
- User enters email
- No email received (check spam folder first!)

**Causes**:
1. Supabase email configuration not set up
2. Email rate limiting
3. Invalid email address

**Solutions**:

1. **Check Supabase Email Settings**:
   - Go to Supabase Dashboard → Authentication → Email Templates
   - Ensure "Confirm signup" template is enabled
   - Check SMTP settings (if custom)

2. **Check Rate Limits**:
   - Supabase free tier: 4 emails/hour per email address
   - Wait or upgrade plan

3. **Test with different email**:
   ```javascript
   await supabase.auth.signInWithOtp({
       email: 'test@example.com',
       options: {
           emailRedirectTo: window.location.origin
       }
   });
   ```

4. **Check browser console** for errors

**Prevention**:
- Use custom SMTP for production
- Implement email verification feedback
- Add rate limit warnings in UI

---

## Database & Supabase

### Problem: "permission denied for table X"

**Symptoms**:
- Query fails with permission error
- RLS policy blocking access

**Causes**:
1. RLS policy too restrictive
2. User not authenticated
3. Wrong organization_id
4. Missing auth.uid() check

**Solutions**:

1. **Check RLS policies**:
   ```sql
   -- Temporarily disable RLS to test (DON'T DO IN PRODUCTION)
   ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
   -- Test query
   -- Re-enable
   ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
   ```

2. **Check authentication**:
   ```javascript
   const { data: { user } } = await supabase.auth.getUser();
   console.log('Authenticated user:', user);
   ```

3. **Check user's role and org**:
   ```javascript
   const { data } = await supabase
       .from('profiles')
       .select('*')
       .eq('id', user.id)
       .single();
   console.log('Profile:', data);
   ```

4. **Test RLS policy**:
   ```sql
   -- Impersonate user for testing
   SET request.jwt.claim.sub = 'user-uuid-here';
   SELECT * FROM your_table;
   -- Reset
   RESET request.jwt.claim.sub;
   ```

**Prevention**:
- Always test RLS policies with different user roles
- Document policy logic in schema files
- Use consistent auth.uid() checks

---

### Problem: "duplicate key value violates unique constraint"

**Symptoms**:
- Insert/update fails
- Error mentions unique constraint

**Causes**:
1. Trying to insert duplicate data
2. Unique constraint on (user_id, competency_id)
3. Username already taken

**Solutions**:

```javascript
// Use upsert instead of insert
const { data, error } = await supabase
    .from('employee_competencies')
    .upsert({
        user_id: userId,
        competency_id: competencyId,
        value: newValue
    }, {
        onConflict: 'user_id,competency_id' // Specify conflict columns
    })
    .select();

// Or check existence first
const { data: existing } = await supabase
    .from('employee_competencies')
    .select('id')
    .eq('user_id', userId)
    .eq('competency_id', competencyId)
    .single();

if (existing) {
    // Update
    await supabase
        .from('employee_competencies')
        .update({ value: newValue })
        .eq('id', existing.id);
} else {
    // Insert
    await supabase
        .from('employee_competencies')
        .insert({ user_id: userId, competency_id: competencyId, value: newValue });
}
```

**Prevention**:
- Use upsert when appropriate
- Check for duplicates before insert
- Handle unique constraint errors gracefully

---

### Problem: Data not syncing/appearing

**Symptoms**:
- Data updated in database
- UI not reflecting changes
- Stale data shown

**Causes**:
1. No re-fetch after mutation
2. Realtime subscription not working
3. Caching issue

**Solutions**:

```javascript
// Solution 1: Refetch after mutation
const updateData = async (id, updates) => {
    const { error } = await supabase
        .from('table')
        .update(updates)
        .eq('id', id);

    if (!error) {
        // Refetch data
        await loadData();
    }
};

// Solution 2: Use Supabase Realtime
useEffect(() => {
    const subscription = supabase
        .channel('public:table')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'table'
        }, (payload) => {
            console.log('Change received:', payload);
            loadData(); // Refresh data
        })
        .subscribe();

    return () => {
        subscription.unsubscribe();
    };
}, []);

// Solution 3: Force browser refresh
window.location.reload();
```

**Prevention**:
- Always refetch after mutations
- Use optimistic updates for better UX
- Implement realtime subscriptions for live data

---

## Build & Development

### Problem: "Cannot find module" errors

**Symptoms**:
- Import statement fails
- Module not found error

**Causes**:
1. Dependency not installed
2. Wrong import path
3. Missing file extension

**Solutions**:

```bash
# Solution 1: Install dependencies
npm install

# Solution 2: Check import path
# WRONG: import X from './utils'
# CORRECT: import X from './utils.js'

# Solution 3: Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Prevention**:
- Always include file extensions in imports (.js, .jsx)
- Run `npm install` after pulling changes
- Check package.json for dependencies

---

### Problem: TypeScript errors on build

**Symptoms**:
- `npm run build` fails
- TypeScript compilation errors

**Causes**:
1. Type mismatches
2. Missing type definitions
3. Strict mode violations

**Solutions**:

```bash
# Check types without building
npm run typecheck

# Common fixes:

# Fix 1: Add type annotations
const myFunc = (param: string): number => {
    return parseInt(param);
};

# Fix 2: Install type definitions
npm install --save-dev @types/package-name

# Fix 3: Use type assertions (use sparingly)
const value = someValue as string;

# Fix 4: Disable strict mode temporarily (NOT RECOMMENDED)
// In tsconfig.json
{
    "compilerOptions": {
        "strict": false
    }
}
```

**Prevention**:
- Run `npm run typecheck` before committing
- Use TypeScript from the start
- Add types incrementally

---

### Problem: Vite dev server not starting

**Symptoms**:
- `npm run dev` fails
- Port already in use
- Build errors

**Causes**:
1. Port 5173 already in use
2. Corrupted node_modules
3. Environment variables missing

**Solutions**:

```bash
# Solution 1: Kill process on port 5173
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5173
kill -9 <PID>

# Solution 2: Use different port
# In package.json
"dev": "vite --port 3000"

# Solution 3: Clean install
rm -rf node_modules package-lock.json dist
npm install

# Solution 4: Check .env.local exists
# Create if missing with:
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-key
```

**Prevention**:
- Always stop dev server before closing terminal
- Use process managers (PM2)
- Document required environment variables

---

### Problem: Hot Module Replacement (HMR) not working

**Symptoms**:
- Changes not reflecting without full reload
- HMR connection lost

**Causes**:
1. Syntax errors in code
2. HMR WebSocket disconnected
3. Browser extension interference

**Solutions**:

1. **Check console** for syntax errors
2. **Restart dev server**:
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```
3. **Disable browser extensions** temporarily
4. **Clear browser cache**
5. **Check vite.config.js** HMR settings

**Prevention**:
- Fix syntax errors immediately
- Use linter to catch errors
- Stable browser extensions only

---

## Permissions & RLS

### Problem: Admin can't see other organizations' data

**Symptoms**:
- Admin should see all orgs
- Only sees own org

**Cause**:
RLS policy not checking for admin role correctly

**Solution**:

```sql
-- Correct policy for admins
CREATE POLICY "Admins see all data"
    ON table_name FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Regular users see own org
        organization_id IN (
            SELECT organization_id FROM profiles
            WHERE id = auth.uid()
        )
    );
```

**Prevention**:
- Always include admin bypass in RLS policies
- Test with different user roles
- Document role hierarchy

---

### Problem: Org admin can modify other orgs' data

**Symptoms**:
- Org admin should only modify own org
- Can modify all orgs

**Cause**:
RLS policy not checking organization_id match

**Solution**:

```sql
CREATE POLICY "Org admin can update own org only"
    ON table_name FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'  -- Admins can update all
                OR (
                    p.role = 'org_admin'
                    AND p.organization_id = table_name.organization_id
                )
            )
        )
    );
```

**Prevention**:
- Always check organization_id for org_admin
- Test cross-org access attempts
- Audit RLS policies regularly

---

## UI & Rendering

### Problem: "Cannot read property of undefined"

**Symptoms**:
- React component crashes
- Error: Cannot read property 'x' of undefined

**Causes**:
1. Data not loaded yet
2. Missing null checks
3. API returned null

**Solutions**:

```javascript
// Solution 1: Optional chaining
const value = data?.user?.profile?.name;

// Solution 2: Default values
const value = data?.user?.name || 'Unknown';

// Solution 3: Conditional rendering
if (!data) return <div>Loading...</div>;
if (error) return <div>Error: {error}</div>;
return <div>{data.name}</div>;

// Solution 4: Guard clauses
const MyComponent = ({ user }) => {
    if (!user) return null;
    if (!user.profile) return <div>No profile</div>;

    return <div>{user.profile.name}</div>;
};
```

**Prevention**:
- Always handle loading states
- Use optional chaining (?.)
- Validate props with PropTypes or TypeScript

---

### Problem: Infinite re-render loop

**Symptoms**:
- Browser freezes
- Console: "Maximum update depth exceeded"

**Causes**:
1. Setting state in render
2. useEffect missing dependencies
3. Object/array recreation in dependency array

**Solutions**:

```javascript
// WRONG: State update in render
const MyComponent = () => {
    const [count, setCount] = useState(0);
    setCount(count + 1); // Infinite loop!
    return <div>{count}</div>;
};

// CORRECT: State update in event handler or effect
const MyComponent = () => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        setCount(1); // Runs once on mount
    }, []);

    return <div>{count}</div>;
};

// WRONG: Object in dependency array
useEffect(() => {
    doSomething(config);
}, [config]); // config recreated every render

// CORRECT: Use useMemo for objects
const config = useMemo(() => ({
    key: value
}), [value]);

useEffect(() => {
    doSomething(config);
}, [config]);
```

**Prevention**:
- Never call setState during render
- Add all dependencies to useEffect
- Use useMemo/useCallback for objects/functions in dependencies

---

### Problem: Styles not applying

**Symptoms**:
- Tailwind classes not working
- Custom CSS ignored

**Causes**:
1. Tailwind not configured
2. Class name typo
3. CSS specificity conflict
4. Purge/safelist issue

**Solutions**:

```bash
# Solution 1: Rebuild Tailwind
npm run dev  # Restart dev server

# Solution 2: Check class name spelling
# WRONG: className="bg-blu-500"
# CORRECT: className="bg-blue-500"

# Solution 3: Check tailwind.config.js
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,jsx,ts,tsx}"
    ],
    // ...
};

# Solution 4: Use !important (last resort)
className="!bg-blue-500"
```

**Prevention**:
- Use Tailwind IntelliSense extension
- Check tailwind.config.js content paths
- Avoid inline styles (prefer Tailwind)

---

## File Uploads & Storage

### Problem: "Failed to upload file" to Supabase Storage

**Symptoms**:
- File upload returns error
- Storage bucket policy blocking upload

**Causes**:
1. Bucket doesn't exist
2. Storage policy too restrictive
3. File size too large
4. Invalid file type

**Solutions**:

```sql
-- Solution 1: Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false);

-- Solution 2: Add storage policy
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'certificates'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Solution 3: Check file size limit
-- Default: 50MB, can increase in Supabase dashboard
```

```javascript
// Solution 4: Validate file before upload
const validateFile = (file) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];

    if (file.size > maxSize) {
        throw new Error('File too large (max 10MB)');
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type');
    }

    return true;
};
```

**Prevention**:
- Set up storage buckets in schema
- Document allowed file types and sizes
- Validate files client-side before upload

---

### Problem: Uploaded files not accessible (404)

**Symptoms**:
- File uploaded successfully
- URL returns 404
- Can't view/download file

**Causes**:
1. Bucket is private
2. Missing storage policy
3. Wrong file path

**Solutions**:

```sql
-- Solution 1: Make bucket public (if appropriate)
UPDATE storage.buckets
SET public = true
WHERE id = 'certificates';

-- Solution 2: Add SELECT policy
CREATE POLICY "Users can download files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'certificates'
    AND (
        -- Public bucket OR
        -- User's own files OR
        -- Admin
        true
    )
);
```

```javascript
// Solution 3: Use signed URLs for private files
const { data, error } = await supabase.storage
    .from('certificates')
    .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

if (data) {
    const signedUrl = data.signedUrl;
    // Use this URL
}
```

**Prevention**:
- Document bucket public/private status
- Set up storage policies during setup
- Use signed URLs for sensitive files

---

## Performance Issues

### Problem: App slow to load

**Symptoms**:
- Initial page load takes >5 seconds
- White screen for extended period

**Causes**:
1. Large bundle size
2. Not using code splitting
3. Loading all data on mount
4. No caching

**Solutions**:

```javascript
// Solution 1: Lazy load pages (already implemented)
const PageName = lazy(() => import('./pages/PageName'));

// Solution 2: Lazy load data
const [data, setData] = useState([]);
const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
    if (isVisible) { // Only load when needed
        loadData();
    }
}, [isVisible]);

// Solution 3: Use pagination
const { data, error } = await supabase
    .from('table')
    .select('*')
    .range(0, 9) // First 10 items
    .order('created_at', { ascending: false });

// Solution 4: Implement caching
const cache = new Map();

const fetchData = async (key) => {
    if (cache.has(key)) {
        return cache.get(key);
    }

    const data = await loadData(key);
    cache.set(key, data);
    return data;
};
```

**Check bundle size**:
```bash
npm run build
# Check dist/ folder size
# Should be <500KB for main bundle
```

**Prevention**:
- Use code splitting
- Implement pagination
- Cache API responses
- Optimize images

---

### Problem: Memory leak warning

**Symptoms**:
- Console: "Can't perform a React state update on an unmounted component"
- Memory usage increasing

**Causes**:
1. useEffect cleanup not implemented
2. Subscription not unsubscribed
3. Timer not cleared

**Solutions**:

```javascript
// Solution 1: Clean up subscriptions
useEffect(() => {
    const subscription = supabase
        .channel('changes')
        .on('postgres_changes', { ... }, handleChange)
        .subscribe();

    return () => {
        subscription.unsubscribe(); // Cleanup!
    };
}, []);

// Solution 2: Clean up timers
useEffect(() => {
    const timer = setTimeout(() => {
        doSomething();
    }, 1000);

    return () => {
        clearTimeout(timer); // Cleanup!
    };
}, []);

// Solution 3: Cancel async operations
useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
        const data = await fetchData();
        if (!cancelled) {
            setData(data);
        }
    };

    loadData();

    return () => {
        cancelled = true; // Prevent setState on unmount
    };
}, []);
```

**Prevention**:
- Always return cleanup function from useEffect
- Unsubscribe from all subscriptions
- Clear all timers

---

## Deployment

### Problem: Build succeeds locally but fails in production

**Symptoms**:
- `npm run build` works locally
- CI/CD build fails

**Causes**:
1. Environment variables missing
2. Different Node version
3. Dev dependencies in production

**Solutions**:

```bash
# Solution 1: Check environment variables
# Ensure all VITE_* vars set in hosting platform

# Solution 2: Specify Node version
# In package.json
{
    "engines": {
        "node": ">=18.0.0"
    }
}

# Solution 3: Check dependencies
# Ensure build deps in devDependencies
# Ensure runtime deps in dependencies

# Solution 4: Test production build locally
npm run build
npm run preview
```

**Prevention**:
- Document all required environment variables
- Use same Node version locally and in CI/CD
- Test production build before deploying

---

### Problem: App works locally but not in production

**Symptoms**:
- Production app shows errors
- Features broken in production

**Causes**:
1. Environment variables not set
2. CORS issues
3. CSP blocking resources
4. HTTP vs HTTPS

**Solutions**:

1. **Check browser console** in production
2. **Verify environment variables** are set
3. **Check CSP headers**:
   ```javascript
   // vite.config.js - ensure Supabase allowed
   "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
   ```
4. **Check CORS** on Supabase (should allow your domain)
5. **Use HTTPS** not HTTP (Supabase requires HTTPS)

**Prevention**:
- Test on staging environment before production
- Use same environment as production for testing
- Monitor production errors with error tracking (Sentry, etc.)

---

## Quick Diagnostic Commands

### Check Supabase Connection
```javascript
import supabase from './supabase-client.js';

// Test connection
const { data, error } = await supabase.from('profiles').select('count');
console.log('Connection:', error ? 'Failed' : 'OK', data);
```

### Check Authentication
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);

const { data: { user } } = await supabase.auth.getUser();
console.log('User:', user);
```

### Check User Profile
```javascript
const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
console.log('Profile:', data);
```

### Check RLS Policies
```sql
-- List all policies on a table
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Check if RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'your_table';
```

### Check Build
```bash
# TypeScript check
npm run typecheck

# Lint check
npm run lint

# Format check
npm run format:check

# Full build
npm run build
```

---

## When All Else Fails

### Nuclear Option: Fresh Start

```bash
# 1. Clear all caches
rm -rf node_modules package-lock.json dist

# 2. Clear browser data
# Chrome: Settings → Privacy → Clear browsing data
# Select: Cookies, Cached images/files, Site data

# 3. Reinstall
npm install

# 4. Rebuild
npm run build

# 5. Test
npm run dev
```

### Get Help

1. **Check browser console** for errors
2. **Check Claude Code docs**: https://docs.claude.com/en/docs/claude-code
3. **Check Supabase docs**: https://supabase.com/docs
4. **Search GitHub issues**: Common problems often documented
5. **Contact support**: support@matrixinspectionservices.com

---

## Common Error Messages Decoded

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| "permission denied for table X" | RLS policy blocking | Check RLS policies |
| "relation X does not exist" | Table not created | Run schema SQL |
| "invalid token" | Session expired | Re-login |
| "duplicate key value" | Unique constraint violation | Use upsert or check duplicates |
| "Cannot find module" | Missing dependency | `npm install` |
| "Maximum update depth exceeded" | Infinite render loop | Check useEffect dependencies |
| "Failed to fetch" | Network/CORS issue | Check Supabase URL, CORS settings |
| "Cannot read property of undefined" | Missing null check | Add optional chaining |
| "EADDRINUSE" | Port already in use | Kill process on port |

---

**Remember**: When in doubt, check the logs! Browser console + server logs = 90% of debugging.

**Last Updated**: 2025-11-11
