# Supabase Full Sync Integration Setup

This guide explains how to set up complete data synchronization for the NDT Suite, enabling cross-device access to assets, vessels, and scans.

## Overview

This integration adds cloud storage and synchronization for all your inspection data:
- **Assets, Vessels, and Scans** stored in Supabase database
- **3D Models and Images** stored in Supabase Storage buckets
- **Automatic Sync** on create/update operations
- **Cross-Device Access** - login from any device to see your data
- **One-Time Migration** of existing local data to cloud

## Prerequisites

- Complete the basic Supabase setup (see `SUPABASE_SETUP.md`)
- Supabase project with authentication working
- At least one user created and able to login

---

## Step 1: Run the Assets Schema

This creates the database tables for storing your inspection data.

### 1.1 Execute Assets Schema

1. Go to Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase-assets-schema.sql`
4. Paste and click **Run**
5. Wait for "Success" message

### 1.2 Verify Tables Created

Run this query to confirm all tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('assets', 'vessels', 'vessel_images', 'scans', 'sync_metadata')
ORDER BY table_name;
```

You should see:
- `assets`
- `scans`
- `sync_metadata`
- `vessel_images`
- `vessels`

---

## Step 2: Set Up Storage Buckets

This creates secure storage for large files like 3D models and images.

### 2.1 Execute Storage Setup

1. Go to **SQL Editor** → **New Query**
2. Copy the entire contents of `supabase-storage-setup.sql`
3. Paste and click **Run**
4. Wait for "Success" message

### 2.2 Verify Buckets Created

1. Go to **Storage** in left sidebar
2. You should see 4 buckets:
   - `3d-models` (50MB file limit)
   - `vessel-images` (10MB file limit)
   - `scan-images` (5MB file limit)
   - `scan-data` (100MB file limit)
3. All should show as **Private** (not public)

---

## Step 3: Test the Integration

### 3.1 Rebuild the Application

```bash
npm install
npm run dev
```

### 3.2 Login and Check Sync Status

1. Open the application
2. Login with your credentials
3. Look for the **sync status indicator** in the bottom-right corner
4. It should show "Synced" or "Syncing..."

### 3.3 Create Test Data

1. Go to **Data Hub** (home icon in toolbar)
2. Click **"+ New Asset"**
3. Name it "Test Asset" and click **Create**
4. Watch the sync status indicator - it should briefly show "Syncing..."

### 3.4 Verify Data in Supabase

1. Go to Supabase Dashboard → **Table Editor** → **assets**
2. You should see your "Test Asset" row
3. Note the `organization_id` and `created_by` fields are populated

### 3.5 Test Cross-Device Sync

**Important Test:**
1. Open the application in a **different browser** (or incognito mode)
2. Login with the **same credentials**
3. Go to Data Hub
4. Your "Test Asset" should appear automatically!

---

## Step 4: Test File Upload

### 4.1 Create a Vessel with 3D Model

1. Click on your test asset in Data Hub
2. Click **"+ Add Vessel"**
3. Name it "Test Vessel"
4. Click **"Upload 3D Model"**
5. Select a `.obj` file (or any file for testing)
6. Wait for upload to complete

### 4.2 Verify File in Storage

1. Go to Supabase Dashboard → **Storage** → **3d-models**
2. Navigate through folders: `{org_id}/{asset_id}/{vessel_id}/`
3. You should see `model.obj`
4. The file should be accessible only to authenticated users

### 4.3 Test Image Upload

1. In the vessel view, click **"Add Photo"**
2. Select an image file
3. Wait for upload
4. Check **Storage** → **vessel-images** in Supabase
5. Your image should be there

---

## Step 5: Migrate Existing Data (If Applicable)

If you have existing assets/vessels/scans from before this integration:

### 5.1 Automatic Migration Prompt

1. Login to the application
2. If you have local data, you'll see a migration prompt
3. It will show:
   - Number of assets
   - Number of vessels
   - Number of scans
   - Number of images
4. Click **"Migrate Now"** to upload everything to Supabase

### 5.2 Monitor Migration Progress

- A progress bar will show upload status
- This may take several minutes depending on data size
- Large 3D models and images take longer
- Don't close the browser during migration

### 5.3 Verify Migration Success

After migration completes:
1. Go to Supabase **Table Editor** → **assets**
2. Count rows - should match your local asset count
3. Check **Storage** buckets for your files
4. Test on another device - data should sync

### 5.4 Manual Migration (If Needed)

If automatic migration fails, open browser console:

```javascript
// Check migration status
import migrationTool from './src/migration-tool.js';
const check = await migrationTool.needsMigration();
console.log(check);

// Manually trigger migration
await migrationTool.migrate((progress) => {
    console.log(`${progress.completed}/${progress.total} - ${progress.currentItem}`);
});
```

---

## Step 6: Understanding Sync Behavior

### Automatic Sync Triggers

Data syncs automatically when you:
- ✅ Create a new asset
- ✅ Create a new vessel
- ✅ Add a vessel image
- ✅ Create a new scan
- ✅ Update any of the above
- ✅ Login (downloads remote data)

### Sync Indicator States

| Icon Color | Meaning |
|------------|---------|
| Green | Synced successfully |
| Orange | Needs sync (click to sync) |
| Blue (spinning) | Syncing in progress |
| Red | Sync failed (check console) |
| Gray | Offline mode (not logged in) |

### Manual Sync

Click the sync status indicator anytime to force a full sync:
1. Downloads new data from Supabase
2. Uploads any local changes
3. Shows progress

---

## Step 7: Troubleshooting

### Sync Status Shows "Sync Failed"

1. **Open Browser Console** (F12 → Console tab)
2. Look for error messages
3. Common issues:

**"Failed to upload file":**
- File may be too large (check limits in Step 2.2)
- Network connection issue
- Try again with smaller file

**"Permission denied":**
- RLS policy issue
- Verify you're logged in
- Check your organization_id matches

**"Not authenticated":**
- Session expired - logout and login again

### Data Not Appearing on Other Device

1. **Force Sync** on both devices (click sync indicator)
2. **Check Organization** - both users must be in same org
3. **Clear Browser Cache** and reload
4. **Verify Data Exists** in Supabase Table Editor

### Files Not Uploading

1. **Check File Size:**
   - 3D models: Max 50MB
   - Images: Max 10MB
   - Compress large files if needed

2. **Check Browser Storage Quota:**
   ```javascript
   navigator.storage.estimate().then(estimate => {
       console.log(`Used: ${estimate.usage / 1024 / 1024} MB`);
       console.log(`Quota: ${estimate.quota / 1024 / 1024} MB`);
   });
   ```

3. **Check Network Tab** (F12 → Network):
   - Look for failed uploads
   - Check for 413 (file too large) errors

### Migration Stuck or Failed

1. **Check Console** for specific error
2. **Reset Migration Status:**
   ```javascript
   import migrationTool from './src/migration-tool.js';
   migrationTool.resetMigrationStatus();
   // Then refresh page and try again
   ```

3. **Migrate One Asset at a Time:**
   ```javascript
   import syncService from './src/sync-service.js';
   await syncService.syncAsset('asset-id-here');
   ```

---

## Step 8: Performance Tips

### Optimize Upload Speed

1. **Compress Images** before uploading:
   - Use JPEG instead of PNG for photos
   - Reduce image resolution if high-res not needed

2. **Simplify 3D Models:**
   - Reduce polygon count if very high
   - Remove unused materials

3. **Batch Operations:**
   - Create multiple items quickly
   - Sync happens in background automatically

### Monitor Storage Usage

1. Go to Supabase Dashboard → **Settings** → **Usage**
2. Check:
   - Database size
   - Storage size
   - API requests
3. Free tier limits:
   - 500MB database
   - 1GB storage
   - Upgrade if needed

### Clean Up Old Data

Delete unused assets/vessels to free up space:
1. In Data Hub, click delete icon
2. Confirm deletion
3. Data removed from both local and Supabase
4. Files automatically deleted from Storage buckets

---

## Step 9: Security Best Practices

### Row Level Security (RLS)

All tables have RLS enabled:
- Users can only see/edit data from their organization
- Sharing feature respects RLS
- Admins have broader access

**Verify RLS is working:**
```sql
-- Try to access another org's data (should return empty)
SELECT * FROM assets WHERE organization_id != (SELECT organization_id FROM profiles WHERE id = auth.uid());
```

### Storage Policies

All buckets are private:
- Files organized by: `{org_id}/{asset_id}/{vessel_id}/`
- Users can only access files from their organization
- Direct URL access blocked without auth

**Test Storage Security:**
1. Copy a file URL from Storage
2. Open in incognito window (not logged in)
3. Should get "Access Denied"

### Credentials Security

**Never commit credentials:**
```bash
# Add to .gitignore
.env
.env.local
src/supabase-client.js  # If it contains real keys
```

**Use Environment Variables (Production):**
```env
# .env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│           Browser A (Device 1)          │
│  ┌────────────┐         ┌────────────┐  │
│  │ Data Hub   │◄────────┤ IndexedDB  │  │
│  │ (UI)       │         │ (Local)    │  │
│  └─────┬──────┘         └────────────┘  │
│        │                                 │
│        │ Create/Update                   │
│        ▼                                 │
│  ┌────────────┐                          │
│  │Sync Service│──────────────┐           │
│  └────────────┘              │           │
└──────────────────────────────┼───────────┘
                               │
                               │ HTTPS
                               ▼
              ┌────────────────────────────┐
              │   Supabase Cloud           │
              │  ┌──────────────────────┐  │
              │  │  PostgreSQL Database │  │
              │  │  - assets            │  │
              │  │  - vessels           │  │
              │  │  - scans             │  │
              │  │  - vessel_images     │  │
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  Storage Buckets     │  │
              │  │  - 3d-models         │  │
              │  │  - vessel-images     │  │
              │  │  - scan-images       │  │
              │  │  - scan-data         │  │
              │  └──────────────────────┘  │
              └────────┬───────────────────┘
                       │
                       │ Download on Login
                       ▼
┌─────────────────────────────────────────┐
│           Browser B (Device 2)          │
│  ┌────────────┐         ┌────────────┐  │
│  │ Data Hub   │────────►│ IndexedDB  │  │
│  │ (UI)       │         │ (Synced!)  │  │
│  └────────────┘         └────────────┘  │
└─────────────────────────────────────────┘
```

---

## What Gets Synced

| Data Type | Local Storage | Supabase Database | Supabase Storage |
|-----------|---------------|-------------------|------------------|
| **Assets** | ✅ IndexedDB | ✅ `assets` table | - |
| **Vessels** | ✅ IndexedDB | ✅ `vessels` table | - |
| **Vessel Name** | ✅ IndexedDB | ✅ `vessels.name` | - |
| **3D Models (.obj)** | ✅ Base64 in IndexedDB | URL reference | ✅ File in `3d-models` |
| **Vessel Images** | ✅ Base64 in IndexedDB | ✅ `vessel_images` table | ✅ File in `vessel-images` |
| **Scans** | ✅ IndexedDB | ✅ `scans` table | - |
| **Scan Data (small)** | ✅ IndexedDB | ✅ `scans.data` (JSONB) | - |
| **Scan Data (large)** | ✅ IndexedDB | URL reference | ✅ File in `scan-data` |
| **Scan Thumbnails** | ✅ IndexedDB (Base64) | URL reference | ✅ File in `scan-images` |

---

## Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase Storage Guide**: https://supabase.com/docs/guides/storage
- **Row Level Security**: https://supabase.com/docs/guides/auth/row-level-security

## Congratulations!

Your NDT Suite now has full cloud synchronization. All your inspection data is safely backed up and accessible from any device. Users can collaborate by sharing assets between organizations, and everything stays in sync automatically.

For any issues, check the browser console logs and Supabase dashboard for detailed error messages.
