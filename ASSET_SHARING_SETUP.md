# Asset Sharing Feature - Setup Guide

## Overview
This feature allows admins to share assets (and their corresponding subfolders/scans) with other organizations. Users from shared organizations can view or edit shared assets based on the permission level granted.

## What Was Implemented

### 1. Database Schema (`supabase-sharing-schema.sql`)
- **shared_assets table**: Tracks sharing relationships between organizations
- **Columns**:
  - `owner_organization_id`: Organization that owns the asset
  - `shared_with_organization_id`: Organization receiving access
  - `asset_id`, `vessel_id`, `scan_id`: References to the shared items
  - `share_type`: 'asset', 'vessel', or 'scan'
  - `permission`: 'view' or 'edit'
- **RLS Policies**: Ensures only admins can manage shares
- **Helper Functions**:
  - `get_shared_assets_for_organization()`: Get all assets shared with an org
  - `get_organizations_for_shared_asset()`: Get all orgs an asset is shared with

### 2. Sharing Manager (`src/sharing-manager.js`)
JavaScript module that provides API for managing asset sharing:

#### Main Functions:
- `shareAsset(options)`: Share an asset/vessel/scan with another organization
- `removeShare(shareId)`: Remove a sharing relationship
- `updateSharePermission(shareId, permission)`: Update permissions
- `getSharedWithCurrentOrganization()`: Get assets shared with current org
- `getOrganizationsForAsset(assetId)`: Get orgs an asset is shared with
- `checkAccess(assetId, ownerOrgId)`: Check if current user has access

### 3. Admin Dashboard UI (`src/tools/admin-dashboard.js`)
Added new "Asset Sharing" tab with:
- **Your Assets section**: Shows all assets in current organization with quick "Share" button
- **Active Shares section**: Lists all current sharing relationships
- **Actions**:
  - Share entire assets, specific vessels, or individual scans
  - Edit permission levels (view/edit)
  - Remove shares
  - View sharing details (from/to organizations, dates, etc.)

## Setup Instructions

### Step 1: Run Database Migration
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Run the contents of `supabase-sharing-schema.sql`
4. Verify the `shared_assets` table was created

### Step 2: Verify File Structure
Make sure these files exist:
```
src/
  ├── sharing-manager.js          (NEW - created)
  ├── data-manager.js             (existing)
  ├── auth-manager.js             (existing)
  └── tools/
      └── admin-dashboard.js      (MODIFIED - updated)
```

### Step 3: Test the Feature
1. **Login as admin**
2. **Navigate to Admin Dashboard**
3. **Click "Asset Sharing" tab**
4. **Test sharing workflow**:
   - Click "+ Share Asset" button
   - Select an asset from your organization
   - Choose share level (entire asset, vessel, or scan)
   - Select target organization
   - Set permission (view or edit)
   - Confirm the share

### Step 4: Verify Permissions
Test that:
- ✅ Only admins can access the Asset Sharing tab
- ✅ Only admins can create/modify/delete shares
- ✅ Users from shared organizations can see shared assets
- ✅ View-only permissions prevent editing
- ✅ Edit permissions allow modifications

## Usage Examples

### Example 1: Share Entire Asset
```javascript
// Admin shares entire asset with another organization
await sharingManager.shareAsset({
    assetId: 'asset_123',
    sharedWithOrganizationId: 'org_456',
    permission: 'view'
});
```

### Example 2: Share Specific Vessel
```javascript
// Admin shares just one vessel from an asset
await sharingManager.shareAsset({
    assetId: 'asset_123',
    vesselId: 'vessel_789',
    sharedWithOrganizationId: 'org_456',
    permission: 'edit'
});
```

### Example 3: Check Access
```javascript
// Check if current user can access a shared asset
const access = await sharingManager.checkAccess('asset_123', 'owner_org_id');
if (access.hasAccess) {
    console.log('Permission level:', access.permission); // 'view' or 'edit'
}
```

## Database Schema Details

### shared_assets Table Structure
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| owner_organization_id | UUID | Organization that owns the asset |
| shared_with_organization_id | UUID | Organization receiving access |
| asset_id | TEXT | Asset ID from IndexedDB |
| vessel_id | TEXT | Optional: specific vessel ID |
| scan_id | TEXT | Optional: specific scan ID |
| share_type | TEXT | 'asset', 'vessel', or 'scan' |
| permission | TEXT | 'view' or 'edit' |
| shared_by | UUID | Admin user who created the share |
| created_at | TIMESTAMPTZ | When share was created |
| updated_at | TIMESTAMPTZ | When share was last modified |

### Indexes
- `idx_shared_assets_owner`: Fast lookup by owner organization
- `idx_shared_assets_shared_with`: Fast lookup by recipient organization
- `idx_shared_assets_asset_id`: Fast lookup by asset
- `idx_shared_assets_vessel_id`: Fast lookup by vessel
- `idx_shared_assets_scan_id`: Fast lookup by scan

## Security Notes

1. **Row Level Security (RLS)**: Enabled on shared_assets table
2. **Admin-only operations**: Only admins can create, update, or delete shares
3. **Organization isolation**: Users can only see shares involving their organization (or all if admin)
4. **Unique constraints**: Prevents duplicate shares for the same asset/org combination

## Future Enhancements (Optional)

Consider adding:
- **Email notifications** when assets are shared
- **Sharing history/audit log**
- **Bulk sharing** (share multiple assets at once)
- **Expiring shares** (time-limited access)
- **Share templates** (predefined sharing configurations)
- **Access analytics** (track who views what)

## Troubleshooting

### Issue: "shared_assets table not found"
**Solution**: Run `supabase-sharing-schema.sql` in Supabase SQL Editor

### Issue: "Permission denied on shared_assets"
**Solution**: Verify RLS policies are created and user is logged in as admin

### Issue: "Shared assets not appearing"
**Solution**: Check that:
1. Share was created successfully
2. User is in the correct organization
3. Browser data/cache is cleared

### Issue: "Cannot import sharingManager"
**Solution**: Verify `src/sharing-manager.js` file exists and path is correct

## Architecture Notes

### Data Flow
1. **Admin selects asset** → UI prompts for sharing details
2. **sharingManager.shareAsset()** → Creates record in Supabase
3. **Supabase RLS** → Enforces permissions
4. **Target organization users** → Can now access shared asset
5. **checkAccess()** → Validates permissions before operations

### Design Decisions
- **Asset IDs from IndexedDB**: Shared assets reference local IndexedDB IDs
- **Granular sharing**: Can share at asset, vessel, or scan level
- **Permission levels**: Simple view/edit model (can be extended)
- **Admin-only**: Only admins manage sharing (can delegate to org_admins later)

## Support
For issues or questions, check:
- Supabase dashboard logs
- Browser console for JavaScript errors
- Network tab for API request failures
