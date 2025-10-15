# Strake Auto-Sync Setup Guide

## What Was Added

Strakes and their associated areas will now automatically sync to the cloud just like all other features in your NDT Suite.

## Changes Made

### 1. Database Schema (`../database/supabase-strakes-schema.sql`)
- Added `strakes` table with columns:
  - `id`, `vessel_id`, `name`
  - `total_area` (in m²)
  - `required_coverage` (percentage)
  - `created_at`, `updated_at`, `metadata`
- Added `strake_id` column to `scans` table to link scans to strakes
- Added Row Level Security (RLS) policies for proper access control
- Added indexes for faster queries

### 2. Sync Service Updates (`src/sync-service.js`)
- Added `downloadStrakes()` function to download strakes from cloud
- Added `uploadStrake()` function to upload strakes to cloud
- Integrated strake sync into `downloadVessels()` and `uploadVessel()` functions
- Updated scan upload/download to include `strake_id` for scan assignments

## Setup Instructions

### Step 1: Apply Database Schema

You need to run the SQL schema in your Supabase dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `../database/supabase-strakes-schema.sql`
5. Click **Run** to execute the SQL

This will create:
- The `strakes` table
- The `strake_id` column in the `scans` table
- All necessary indexes and security policies

### Step 2: Test the Sync

1. **On your home computer:**
   - Open the NDT Suite application
   - Navigate to a vessel
   - Create a new strake with:
     - Name: "Test Strake"
     - Total Area: 10 m²
     - Required Coverage: 95%
   - Wait a few seconds for auto-sync to complete
   - Check the browser console for sync messages like:
     ```
     [UPLOAD_VESSEL] Uploading 1 strakes...
     [UPLOAD_VESSEL] Strake uploaded successfully
     ```

2. **On your work computer:**
   - Open the NDT Suite application
   - Log in with the same account
   - The app will automatically download data from the cloud on startup
   - Navigate to the same vessel
   - You should see "Test Strake" with the area and coverage you created

### Step 3: Verify Scan Assignments

If you assign scans to strakes:
1. Assign a scan to a strake at home
2. Wait for auto-sync (or trigger manual sync)
3. Open the same vessel at work
4. The scan should be assigned to the correct strake

## How Auto-Sync Works

The sync service automatically:

1. **On Data Change:**
   - Detects when you create/update/delete a strake
   - Waits 3 seconds to batch rapid changes
   - Uploads the changes to Supabase

2. **On Login:**
   - Downloads all data from Supabase
   - Merges with local cache
   - Updates UI with latest data

3. **Periodic Sync:**
   - Every 5 minutes, checks for pending changes
   - Syncs automatically if changes detected

## Troubleshooting

### Strakes Not Showing Up

1. **Check console for errors:**
   - Open browser DevTools (F12)
   - Look for error messages with `[UPLOAD_VESSEL]` or `[DOWNLOAD]`

2. **Verify database schema:**
   - In Supabase SQL Editor, run:
     ```sql
     SELECT * FROM strakes;
     ```
   - You should see your strakes listed

3. **Check sync status:**
   - Look for sync indicator in the app UI
   - Check for "Sync completed" messages in console

4. **Manual sync:**
   - If auto-sync seems stuck, reload the app
   - On login, it will download all latest data

### Data Conflicts

If you edit the same strake on both computers simultaneously:
- The last update wins (most recent timestamp)
- Auto-sync will merge changes automatically

## What's Synced

For each strake:
- ✅ Name
- ✅ Total area (m²)
- ✅ Required coverage (%)
- ✅ Scan assignments (which scans belong to this strake)

## Notes

- Strakes are stored per vessel (each vessel has its own strakes)
- Deleting a strake removes it from all devices
- Deleting a strake sets assigned scans' `strake_id` to `null` (unassigns them)
- All strake operations respect organization permissions (RLS policies)
