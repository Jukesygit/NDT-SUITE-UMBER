# Cloud-First Architecture Migration

## Overview

The NDT Suite data layer has been refactored from **local-first** to **cloud-first** architecture. This ensures all data is saved directly to Supabase and accessible from any device when you log in.

---

## What Changed

### Before (Local-First)
```
User Action → IndexedDB → Background Sync → Supabase (maybe)
```

**Problems:**
- Data could get stuck in local browser storage
- If sync failed silently, data never reached the cloud
- Working from different computers showed different data
- No guarantee of data persistence across devices

### After (Cloud-First)
```
User Action → Supabase (immediate) → IndexedDB (cache only)
```

**Benefits:**
✅ All data immediately saved to cloud
✅ Accessible from any device when logged in
✅ IndexedDB is just a cache for faster loading
✅ Errors are shown immediately if cloud save fails
✅ Data is always in sync across devices

---

## Technical Changes

### 1. Data Manager Initialization

**Old Behavior:**
- Loaded from IndexedDB only
- Never checked Supabase on startup

**New Behavior:**
```javascript
// On app startup:
1. Check if logged in and Supabase configured
2. If yes → Download latest data from Supabase
3. If no → Fall back to local IndexedDB cache
4. Display data from cloud or cache
```

**File:** [src/data-manager.js:36-102](src/data-manager.js#L36-L102)

### 2. Create Operations (Assets, Vessels, Scans)

**Old Behavior:**
```javascript
async createAsset(name) {
    // 1. Save to IndexedDB
    // 2. Background sync to Supabase (maybe)
}
```

**New Behavior:**
```javascript
async createAsset(name) {
    // 1. Save to Supabase FIRST (throws error if fails)
    // 2. If success → Update local IndexedDB cache
    // 3. If fails → Rollback local changes + show error
}
```

**Changed Methods:**
- `createAsset()` - [line 160](src/data-manager.js#L160)
- `createVessel()` - [line 258](src/data-manager.js#L258)
- `createScan()` - [line 524](src/data-manager.js#L524)
- `addVesselImage()` - [line 349](src/data-manager.js#L349)

### 3. Update Operations

**Old Behavior:**
```javascript
async updateAsset(assetId, updates) {
    // 1. Update in IndexedDB
    // 2. Background sync to Supabase (maybe)
}
```

**New Behavior:**
```javascript
async updateAsset(assetId, updates) {
    // 1. Update in Supabase FIRST (throws error if fails)
    // 2. If success → Update local IndexedDB cache
    // 3. If fails → Throw error to UI
}
```

**Changed Methods:**
- `updateAsset()` - [line 211](src/data-manager.js#L211)
- `updateVessel()` - [line 304](src/data-manager.js#L304)
- `updateScan()` - [line 571](src/data-manager.js#L571)

### 4. Error Handling

**Old Behavior:**
```javascript
// Silent failures - just logged to console
syncService.syncAsset(assetId).catch(err => {
    console.error('Failed to sync asset:', err);
});
```

**New Behavior:**
```javascript
// Throws errors to UI - user sees what went wrong
const result = await syncService.uploadAsset(asset, orgId, userId);

if (!result.success) {
    throw new Error(`Failed to save asset to cloud: ${result.error}`);
}
```

### 5. Rollback on Failure

**New Feature:**
If cloud save fails, local changes are automatically rolled back:

```javascript
vessel.scans.push(scan);

// Try to save to cloud
const result = await syncService.uploadAsset(asset, orgId, userId);

if (!result.success) {
    // ROLLBACK: Remove the scan we just added
    vessel.scans.pop();
    throw new Error('Failed to save scan to cloud');
}
```

---

## Impact on Users

### ✅ Benefits

1. **Data Persistence**
   - Your data is ALWAYS in the cloud
   - Switch between work/home computers seamlessly
   - No more "where did my data go?" issues

2. **Immediate Feedback**
   - If something fails to save, you know RIGHT AWAY
   - No silent failures in the background

3. **True Multi-Device Support**
   - Create a scan at work
   - View it at home immediately (after login)

4. **Data Safety**
   - IndexedDB can be cleared by browser
   - Supabase cloud storage is persistent and backed up

### ⚠️ Requirements

1. **Must be logged in**
   - All data operations now require authentication
   - Cannot create/edit data without Supabase connection

2. **Must have internet connection**
   - Offline mode is NOT currently supported
   - Future: Add offline queue for when disconnected

3. **Supabase must be configured**
   - `.env` file must have valid Supabase credentials
   - If not configured, app will throw errors

---

## Migration Guide

### For Existing Users

If you have data in local IndexedDB that was never synced to Supabase:

1. **Login to the app** with your account
2. **Open browser console** (F12)
3. **Run diagnostic script:** Paste diagnostic script into console (if available)
4. **Check what data you have locally**
5. **Run `exportAllData()`** to download a backup JSON file
6. **Contact admin** to import your data to Supabase

### For New Users

Just login and start using the app! All data will automatically save to the cloud.

---

## Backup & Restore

### Backing Up Your Data

```javascript
// In browser console:
exportAllData()  // Downloads JSON file
```

### Checking Sync Status

```javascript
// In browser console:
await syncService.fullSync()  // Manually trigger a full sync
```

---

## Troubleshooting

### "Must be logged in to create assets" error

**Cause:** Not logged in or Supabase not configured

**Solution:**
1. Check you're logged in (see user icon in top right)
2. Check `.env` file has valid Supabase credentials
3. Check browser console for Supabase connection errors

### "Failed to save to cloud" errors

**Cause:** Supabase connection failed

**Solutions:**
1. Check internet connection
2. Check Supabase dashboard - is service running?
3. Check browser console for detailed error messages
4. Verify Supabase credentials in `.env` are correct

### Data not appearing on different computer

**Cause:** Data might still be in old local-only format

**Solution:**
1. Run diagnostic script on old computer
2. Export data using `exportAllData()`
3. Check if data is in Supabase (query database directly)
4. If not in Supabase, you'll need to migrate it

---

## Developer Notes

### Files Modified

1. [src/data-manager.js](src/data-manager.js) - Core data management refactor
   - Lines 36-102: Initialization with cloud-first loading
   - Lines 160-199: `createAsset()` - Cloud-first create
   - Lines 211-243: `updateAsset()` - Cloud-first update
   - Lines 258-296: `createVessel()` - Cloud-first create
   - Lines 304-333: `updateVessel()` - Cloud-first update
   - Lines 349-390: `addVesselImage()` - Cloud-first add
   - Lines 524-563: `createScan()` - Cloud-first create
   - Lines 571-600: `updateScan()` - Cloud-first update

2. [src/data-manager.js.backup](src/data-manager.js.backup) - Backup of old version

### Console Logging

All operations now log to console with `[DATA-MANAGER]` prefix:

```
[DATA-MANAGER] Initializing...
[DATA-MANAGER] Loading data from Supabase...
[DATA-MANAGER] Loaded 5 items from Supabase
[DATA-MANAGER] Creating asset in Supabase: My Asset
[DATA-MANAGER] Asset created in Supabase successfully
```

### Testing

To test cloud-first behavior:

1. **Clear IndexedDB** (browser DevTools → Application → IndexedDB → Delete)
2. **Refresh app** - data should load from Supabase
3. **Create new asset** - watch console for upload logs
4. **Check Supabase** - verify asset appears in database
5. **Open on different device** - asset should appear

---

## Future Enhancements

### Planned Features

1. **Offline Mode**
   - Queue operations when offline
   - Sync when connection restored
   - Show "offline" indicator in UI

2. **Real-time Sync**
   - Use Supabase Realtime subscriptions
   - See changes from other users instantly
   - Collaborative editing support

3. **Conflict Resolution**
   - Handle concurrent edits from multiple devices
   - Merge changes intelligently
   - Show conflict UI when needed

4. **Optimistic UI Updates**
   - Update UI immediately
   - Sync in background
   - Revert if sync fails

---

## Questions?

- Check diagnostic script for debugging tools (if available)
- Review [./DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for deployment guides
- See [./SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for Supabase configuration

---

**Last Updated:** 2025-10-14
**Migration Version:** 1.0.0
**Status:** ✅ Complete - Ready for Testing
