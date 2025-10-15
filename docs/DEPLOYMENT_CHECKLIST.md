# Deployment Checklist: Supabase Sync Integration

Use this checklist to ensure proper deployment of the cross-device sync feature.

---

## Pre-Deployment

### Database Setup

- [ ] **Supabase project created**
- [ ] **`../database/supabase-schema.sql` executed** (organizations, profiles, account_requests)
- [ ] **`../database/supabase-assets-schema.sql` executed** (assets, vessels, scans, etc.)
- [ ] **`../database/supabase-sharing-schema.sql` executed** (shared_assets)
- [ ] **`../database/supabase-asset-access-requests-schema.sql` executed**
- [ ] **`../database/supabase-profile-schema.sql` executed** (permission_requests)
- [ ] **`../database/supabase-storage-setup.sql` executed** (storage buckets)

**Verify:**
```sql
-- Run in Supabase SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```
Should return: `account_requests`, `asset_access_requests`, `assets`, `organizations`, `permission_requests`, `profiles`, `scans`, `shared_assets`, `sync_metadata`, `vessel_images`, `vessels`

### Storage Buckets

- [ ] **Bucket `3d-models` exists** (Private, 50MB limit)
- [ ] **Bucket `vessel-images` exists** (Private, 10MB limit)
- [ ] **Bucket `scan-images` exists** (Private, 5MB limit)
- [ ] **Bucket `scan-data` exists** (Private, 100MB limit)

**Verify:** Check Supabase Dashboard → Storage

### Row Level Security

- [ ] **RLS enabled on all tables**
- [ ] **Test policies with non-admin user**

**Test RLS:**
```sql
-- As regular user, should only see own org
SELECT * FROM assets;
-- Should return only assets from user's organization
```

### Initial Data

- [ ] **At least one organization created**
- [ ] **At least one admin user created**
- [ ] **Admin profile exists and is_active = true**

**Create organization:**
```sql
INSERT INTO organizations (name) VALUES ('Your Org') RETURNING id;
```

**Create admin profile:**
```sql
-- First create user in Authentication → Users
-- Then verify profile auto-created or manually insert
INSERT INTO profiles (id, username, email, role, organization_id)
VALUES ('user-uuid', 'admin', 'admin@example.com', 'admin', 'org-uuid');
```

---

## Application Configuration

### Environment Variables

- [ ] **Create `.env` file** (if using env vars)
- [ ] **Add `.env` to `.gitignore`**
- [ ] **Set `VITE_SUPABASE_URL`**
- [ ] **Set `VITE_SUPABASE_ANON_KEY`**

**.env file:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your-key-here
```

**OR** update `src/supabase-client.js` directly (not recommended for production)

### Dependencies

- [ ] **Run `npm install`** (ensure all dependencies installed)
- [ ] **No console errors during build**

```bash
npm install
npm run build
```

### Code Verification

- [ ] **`src/sync-service.js` exists**
- [ ] **`src/migration-tool.js` exists**
- [ ] **`src/components/sync-status.js` exists**
- [ ] **`src/data-manager.js` imports sync-service**
- [ ] **`src/main.js` imports sync-service, migrationTool, syncStatus**

---

## Testing

### Local Testing

- [ ] **Build succeeds** (`npm run build`)
- [ ] **Dev server starts** (`npm run dev`)
- [ ] **No console errors on load**
- [ ] **Login works**
- [ ] **Sync status indicator appears** (bottom-right)

### Sync Testing

#### Test 1: Create and Sync
- [ ] **Create new asset**
- [ ] **Sync indicator shows "Syncing..."**
- [ ] **Asset appears in Supabase Table Editor → assets**
- [ ] **No errors in browser console**

#### Test 2: Cross-Device Sync
- [ ] **Open app in different browser/incognito**
- [ ] **Login with same account**
- [ ] **Assets from Device A appear on Device B**
- [ ] **Create asset on Device B**
- [ ] **Refresh Device A, asset appears**

#### Test 3: File Upload
- [ ] **Create vessel**
- [ ] **Upload 3D model (.obj file)**
- [ ] **File appears in Supabase Storage → 3d-models**
- [ ] **Path structure correct:** `{org_id}/{asset_id}/{vessel_id}/model.obj`
- [ ] **Upload vessel image**
- [ ] **Image appears in vessel-images bucket**

#### Test 4: Manual Sync
- [ ] **Click sync status indicator**
- [ ] **Progress indicator appears**
- [ ] **Completes with success message**
- [ ] **Console shows sync stats** (downloaded/uploaded counts)

#### Test 5: Migration (If Applicable)
- [ ] **Existing local data detected**
- [ ] **Migration prompt appears automatically**
- [ ] **Click "Migrate Now"**
- [ ] **Progress bar shows completion**
- [ ] **All data appears in Supabase**
- [ ] **Data accessible from other device**

### Security Testing

#### Test 1: RLS Enforcement
- [ ] **Create 2nd organization in Supabase**
- [ ] **Create user in Org 2**
- [ ] **Login as Org 2 user**
- [ ] **Org 1 assets NOT visible**
- [ ] **Create asset as Org 2 user**
- [ ] **Asset only visible to Org 2, not Org 1**

#### Test 2: Storage Security
- [ ] **Copy storage file URL from Supabase**
- [ ] **Open URL in incognito window (not logged in)**
- [ ] **Access denied / 403 error**
- [ ] **Login, file accessible**

#### Test 3: Role Permissions
- [ ] **Create viewer role user**
- [ ] **Login as viewer**
- [ ] **Can view assets** ✅
- [ ] **Cannot create assets** (if edit permissions enforced)

### Performance Testing

- [ ] **Upload large 3D model** (close to 50MB)
- [ ] **Upload succeeds**
- [ ] **Upload multiple assets** (10+)
- [ ] **Sync completes without timeout**
- [ ] **Browser remains responsive during sync**

### Error Handling

- [ ] **Disconnect internet during sync**
- [ ] **Sync fails gracefully**
- [ ] **Error shown in sync indicator**
- [ ] **Reconnect internet, click sync**
- [ ] **Sync resumes and completes**

- [ ] **Try to upload 51MB file** (over limit)
- [ ] **Upload fails with clear error**
- [ ] **User notified of size limit**

---

## Production Deployment

### Security Hardening

- [ ] **Remove hardcoded credentials from `supabase-client.js`**
- [ ] **Use environment variables for all secrets**
- [ ] **Verify `.env` in `.gitignore`**
- [ ] **No API keys in git history** (check with `git log -S "SUPABASE_ANON_KEY"`)

### Supabase Project Settings

- [ ] **Enable email confirmations** (Auth → Settings → Email Confirmations)
- [ ] **Configure custom SMTP** (Auth → Settings → SMTP Settings)
- [ ] **Set up custom domain** (if applicable)
- [ ] **Enable MFA for admin accounts**
- [ ] **Review and adjust storage quotas**

### Monitoring

- [ ] **Set up Supabase usage alerts** (Settings → Usage)
- [ ] **Monitor database size** (should stay under 500MB on free tier)
- [ ] **Monitor storage size** (should stay under 1GB on free tier)
- [ ] **Monitor bandwidth** (should stay under 2GB/month on free tier)

### Backup Strategy

- [ ] **Enable daily database backups** (Settings → Database → Backups)
- [ ] **Test restore procedure**
- [ ] **Document backup recovery steps**

### Performance Optimization

- [ ] **Verify database indexes exist** (auto-created by schema)
- [ ] **Enable Supabase Edge caching** (for storage files)
- [ ] **Consider CDN for frequently accessed files**

---

## Post-Deployment

### User Communication

- [ ] **Notify users of new sync feature**
- [ ] **Provide migration instructions**
- [ ] **Share `./QUICK_START_SYNC.md` with users**

### Documentation

- [ ] **Update user manual** (if applicable)
- [ ] **Document troubleshooting steps**
- [ ] **Create FAQ for common issues**

### Monitoring First Week

- [ ] **Day 1:** Check sync logs for errors
- [ ] **Day 3:** Monitor storage usage growth
- [ ] **Day 7:** Review user feedback
- [ ] **Day 7:** Check for failed syncs in logs

### Support Preparation

- [ ] **Train support team on sync feature**
- [ ] **Document common error messages**
- [ ] **Create support ticket templates**

---

## Rollback Plan

If major issues occur:

### Quick Rollback
1. **Disable sync in code:**
   ```javascript
   // In src/main.js, comment out sync initialization
   // if (authManager.useSupabase) { ... }
   ```
2. **Rebuild and deploy**
3. **Application reverts to local-only mode**
4. **No data loss** (IndexedDB still works)

### Full Rollback
1. **Restore previous application version**
2. **Keep Supabase database intact** (data preserved)
3. **Fix issues offline**
4. **Redeploy when ready**

---

## Success Criteria

Deployment is successful when:

✅ **All database tables exist and are accessible**
✅ **All storage buckets created with correct policies**
✅ **Users can login and see sync indicator**
✅ **Creating assets syncs to Supabase**
✅ **Cross-device access works**
✅ **File uploads work** (3D models, images)
✅ **RLS prevents cross-org data access**
✅ **Migration tool works for existing users**
✅ **No errors in production logs**
✅ **User feedback is positive**

---

## Maintenance Schedule

### Daily
- Monitor Supabase dashboard for errors
- Check sync success rates

### Weekly
- Review storage usage trends
- Check for failed migrations
- Review user support tickets

### Monthly
- Database cleanup (remove orphaned data)
- Review and optimize RLS policies
- Update documentation based on user feedback

---

## Emergency Contacts

**Supabase Support:**
- Dashboard: https://app.supabase.com
- Docs: https://supabase.com/docs
- Community: https://github.com/supabase/supabase/discussions

**Application Support:**
- Check browser console logs
- Check Supabase logs (Logs section in dashboard)
- Review `./SUPABASE_SYNC_SETUP.md` troubleshooting section

---

## Final Checklist

Before marking deployment complete:

- [ ] **All pre-deployment tasks completed**
- [ ] **All testing passed**
- [ ] **Production deployment successful**
- [ ] **Post-deployment monitoring in place**
- [ ] **Documentation updated**
- [ ] **Users notified**
- [ ] **Support team trained**
- [ ] **Rollback plan documented and tested**

---

## Notes

Use this space to record deployment-specific information:

**Deployment Date:** _________________

**Supabase Project ID:** _________________

**Organization IDs Created:** _________________

**Initial Admin Users:** _________________

**Issues Encountered:**

_________________________________________________________________

_________________________________________________________________

**Resolutions:**

_________________________________________________________________

_________________________________________________________________

---

## Sign-Off

**Deployed By:** _________________
**Date:** _________________
**Verified By:** _________________
**Date:** _________________

---

**Deployment Status:** ⬜ NOT STARTED  |  ⬜ IN PROGRESS  |  ⬜ COMPLETE
