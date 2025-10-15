# Organization-Based Asset Ownership

## Overview

This implementation ensures that assets, vessels, strakes, and scans are owned by organizations rather than being shared from a system-level pool. Each organization has its own set of assets that are isolated from other organizations, with the exception of the SYSTEM organization which has full visibility across all organizations.

## Key Features

### 1. Organization Ownership
- **Assets are assigned to organizations**: Each asset has an `organization_id` column that determines which organization owns it
- **Hierarchical ownership**: Vessels, strakes, and scans inherit access permissions from their parent asset's organization
- **Isolation by default**: Organizations can only see their own assets unless explicitly shared

### 2. SYSTEM Organization Special Access
- **Super admin organization**: The SYSTEM organization can view ALL assets from ALL organizations
- **Read-only across orgs**: SYSTEM org users can view and manage assets from any organization
- **Useful for support and administration**: Allows system administrators to help users across all organizations

### 3. Optional Sharing
- **Controlled sharing**: Organizations can still share specific assets with other organizations via the `shared_assets` table
- **Not required**: Sharing is optional and not the primary access control mechanism
- **Admin-only**: Only admins can create shares between organizations

## Database Schema

### Organizations Table
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The SYSTEM organization is created by default:
```sql
INSERT INTO organizations (name) VALUES ('SYSTEM');
```

### Assets Table
```sql
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

## Row Level Security (RLS) Policies

### Assets SELECT Policy
Users can view:
1. **All assets** if they belong to the SYSTEM organization
2. **Their own organization's assets**
3. **Assets shared with their organization** via the `shared_assets` table

```sql
CREATE POLICY "Users can view accessible assets" ON assets FOR SELECT
USING (
    -- SYSTEM organization can see ALL assets
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Own organization's assets
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    -- Assets shared with their organization
    id IN (
        SELECT asset_id
        FROM shared_assets
        WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);
```

### Vessels, Strakes, and Scans
These entities inherit access permissions from their parent asset. The RLS policies check:
1. If the user is in SYSTEM org → grant access
2. If the asset belongs to the user's org → grant access
3. If the asset is shared with the user's org → grant access

## Application Code Changes

### Sync Service ([sync-service.js](../src/sync-service.js))

**Download Logic**:
```javascript
// Check if user is in SYSTEM organization
const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

// Fetch assets based on organization
let query = supabase.from('assets').select('*');

// SYSTEM org sees all assets, others see only their own
if (!isSystemOrg) {
    query = query.eq('organization_id', orgId);
}

const { data: assets, error: assetsError } = await query;
```

**Data Organization**:
```javascript
// For SYSTEM org, organize assets by their actual organization
// For regular orgs, use current org
const targetOrgId = isSystemOrg ? remoteAsset.organization_id : orgId;

// Ensure org data structure exists
if (!localData[targetOrgId]) {
    localData[targetOrgId] = { assets: [] };
}
```

### Data Manager ([data-manager.js](../src/data-manager.js))

**Get Assets**:
```javascript
getAssets() {
    // Check if user is in SYSTEM org
    const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

    if (isSystemOrg) {
        // SYSTEM org sees ALL assets from ALL organizations
        const allAssets = [];
        for (const orgId in this.data) {
            if (this.data[orgId].assets) {
                allAssets.push(...this.data[orgId].assets);
            }
        }
        return allAssets;
    }

    // Regular orgs see only their own assets
    const orgData = this.getCurrentOrgData();
    return orgData.assets || [];
}
```

**Get Single Asset**:
```javascript
getAsset(assetId) {
    // Check if user is in SYSTEM org
    const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

    if (isSystemOrg) {
        // SYSTEM org can access any asset from any organization
        for (const orgId in this.data) {
            if (this.data[orgId].assets) {
                const asset = this.data[orgId].assets.find(a => a.id === assetId);
                if (asset) return asset;
            }
        }
        return null;
    }

    // Regular orgs can only access their own assets
    const orgData = this.getCurrentOrgData();
    return (orgData.assets || []).find(a => a.id === assetId);
}
```

**Update/Delete Assets**:
When updating or deleting assets, we use the asset's own `organizationId` rather than the current user's organization:

```javascript
async updateAsset(assetId, updates) {
    const asset = this.getAsset(assetId);
    if (!asset) return null;

    // Update the asset
    Object.assign(asset, updates);

    // Save to the asset's organization (not necessarily the current user's org)
    const assetOrgId = asset.organizationId;
    const orgData = this.getOrgData(assetOrgId);

    await this.saveToStorage();
    // ... sync to Supabase
}
```

## Migration Instructions

To apply these changes to an existing database:

1. **Run the migration SQL**:
   ```bash
   # Apply the RLS policy updates
   psql -f database/migrations/org-based-ownership.sql
   ```

2. **Verify SYSTEM organization exists**:
   ```sql
   SELECT * FROM organizations WHERE name = 'SYSTEM';
   ```

3. **Assign existing assets to organizations** (if needed):
   ```sql
   -- Example: Assign orphaned assets to SYSTEM org
   UPDATE assets
   SET organization_id = (SELECT id FROM organizations WHERE name = 'SYSTEM')
   WHERE organization_id IS NULL;
   ```

## Usage Examples

### Creating an Asset
Assets are automatically assigned to the current user's organization:

```javascript
const asset = await dataManager.createAsset('My Asset');
// asset.organizationId will be set to current user's org
```

### Viewing Assets
- **Regular users**: See only their organization's assets
- **SYSTEM org users**: See all assets from all organizations

```javascript
const assets = dataManager.getAssets();
// Returns filtered list based on user's organization
```

### Sharing Assets (Optional)
Admins can share assets with other organizations:

```javascript
// Only admins can create shares
await supabase.from('shared_assets').insert({
    owner_organization_id: myOrgId,
    shared_with_organization_id: theirOrgId,
    asset_id: assetId,
    share_type: 'asset',
    permission: 'view',
    shared_by: userId
});
```

## Benefits

1. **Clear ownership**: Every asset belongs to exactly one organization
2. **Data isolation**: Organizations can't see each other's data by default
3. **Admin oversight**: SYSTEM org provides administrative access across all orgs
4. **Optional collaboration**: Sharing mechanism allows controlled cross-org collaboration
5. **Scalability**: Each organization's data is isolated, improving performance

## Security Considerations

- **RLS policies** enforce organization boundaries at the database level
- **SYSTEM org access** should be restricted to trusted administrators only
- **Sharing permissions** can be controlled via `shared_assets` table
- **Audit trail**: `created_by` and timestamps track who created assets and when
