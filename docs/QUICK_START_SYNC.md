# Quick Start: Enable Cross-Device Sync

Get your vessels and assets syncing across devices in 5 minutes.

## What You'll Get

✅ Access your data from any computer
✅ Automatic backup to cloud
✅ Sync existing data with one click

---

## Step 1: Run Database Scripts (2 minutes)

1. Open [your Supabase dashboard](https://app.supabase.com)
2. Go to **SQL Editor** → **New Query**
3. **Copy and paste this entire file:** `../database/supabase-assets-schema.sql`
4. Click **Run** ▶️
5. Wait for "Success. No rows returned"

6. Click **New Query** again
7. **Copy and paste:** `../database/supabase-storage-setup.sql`
8. Click **Run** ▶️
9. Done! Tables and storage buckets are created.

---

## Step 2: Verify Setup (30 seconds)

**Check Tables:**
1. Go to **Table Editor** in left sidebar
2. You should see: `assets`, `vessels`, `scans`, `vessel_images`

**Check Storage:**
1. Go to **Storage** in left sidebar
2. You should see 4 buckets: `3d-models`, `vessel-images`, `scan-images`, `scan-data`

---

## Step 3: Test It (2 minutes)

1. **Open your NDT Suite application**
2. **Login** with your account
3. **Look for sync indicator** (bottom-right corner)
   - Should show spinning icon then "Synced"

4. **Create a test asset:**
   - Go to Data Hub (home icon)
   - Click **"+ New Asset"**
   - Name it "Sync Test"
   - Click **Create**
   - Watch sync indicator briefly show "Syncing..."

5. **Verify in Supabase:**
   - Go to Supabase → **Table Editor** → **assets**
   - Your "Sync Test" asset should appear

6. **Test cross-device:**
   - Open app in **different browser** or **incognito mode**
   - Login with **same account**
   - Your asset should appear!

---

## Step 4: Migrate Existing Data (Optional)

If you have existing vessels/assets:

1. Login to the app
2. **Migration prompt will appear automatically**
3. Shows count of items to migrate
4. Click **"Migrate Now"**
5. Wait for progress bar to complete
6. Done! All data is now in the cloud.

---

## That's It!

Your data now syncs automatically:
- ✅ Create/edit data → Syncs in background
- ✅ Login on new device → Data downloads automatically
- ✅ Click sync icon anytime → Forces immediate sync

---

## Troubleshooting

### Sync Status Shows Red (Error)

1. Press **F12** to open console
2. Look for error messages
3. Most common: Check internet connection

### Data Not Appearing on Other Device

1. Click the **sync icon** on both devices to force sync
2. Make sure both devices logged in to **same account**
3. Check Supabase Table Editor to verify data exists

### Need Help?

See detailed guide: `./SUPABASE_SYNC_SETUP.md`

---

## What's Synced

| Item | Synced? |
|------|---------|
| Assets | ✅ Yes |
| Vessels | ✅ Yes |
| 3D Models | ✅ Yes |
| Vessel Photos | ✅ Yes |
| Scans | ✅ Yes |
| Scan Data | ✅ Yes |

Everything you create is automatically backed up and accessible from any device!
