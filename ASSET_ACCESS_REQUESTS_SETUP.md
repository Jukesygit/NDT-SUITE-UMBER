# Asset Access Requests - Setup Guide

## Overview
This feature allows users to request access to specific assets from other organizations. Admins can then approve or reject these requests, automatically creating shares when approved. This integrates with the existing permission request system to provide a complete workflow for permission-based asset sharing.

## What Was Implemented

### 1. Database Schema (`supabase-asset-access-requests-schema.sql`)
New table and functions for managing asset access requests:

#### asset_access_requests Table
- **Columns**:
  - `user_id`: User making the request
  - `user_organization_id`: User's organization
  - `owner_organization_id`: Organization that owns the asset
  - `asset_id`, `vessel_id`, `scan_id`: What's being requested
  - `requested_permission`: 'view' or 'edit'
  - `message`: Optional message to admin
  - `status`: 'pending', 'approved', or 'rejected'
  - Timestamps for creation, approval, rejection

#### Database Functions
- `approve_asset_access_request()`: Approves request and auto-creates share
- `reject_asset_access_request()`: Rejects request with optional reason
- `get_pending_asset_access_requests_for_org()`: Get requests for organization
- `get_user_asset_access_requests()`: Get user's own requests

### 2. Sharing Manager Updates (`src/sharing-manager.js`)
Added new functions for access request workflow:

#### New Functions
- `requestAssetAccess(options)`: Create an access request
- `getPendingAccessRequests()`: Get pending requests (admin/org_admin)
- `getUserAccessRequests()`: Get user's own requests
- `approveAccessRequest(requestId)`: Approve and auto-share
- `rejectAccessRequest(requestId, reason)`: Reject with reason
- `cancelAccessRequest(requestId)`: Cancel own pending request

### 3. Admin Dashboard Updates (`src/tools/admin-dashboard.js`)
Enhanced the Asset Sharing tab with:
- **Pending Access Requests Section**: Shows requests awaiting approval
- **Request Details**: User info, organization, asset details, messages
- **Actions**: Approve (auto-creates share) or Reject (with reason)
- **Badge**: Shows count of pending requests in header

### 4. User-Facing Tool (`src/tools/asset-access-request.js`)
New standalone tool for regular users:
- **My Requests View**: See all access requests (pending, approved, rejected)
- **Create Request**: Request access to assets from other organizations
- **Request Details**: Track status, view rejection reasons
- **Cancel Requests**: Cancel pending requests

## Setup Instructions

### Step 1: Run Database Migration
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Run the contents of `supabase-asset-access-requests-schema.sql`
4. Verify the `asset_access_requests` table was created

### Step 2: Register the New Tool
Add the asset access request tool to your main application:

```javascript
// In your main.js or tool registration file
import assetAccessRequest from './tools/asset-access-request.js';

// Register the tool
tools['asset-access-request'] = assetAccessRequest;

// Or add to your tools menu
{
    id: 'asset-access-request',
    name: 'Asset Access Requests',
    icon: '🔑',
    module: assetAccessRequest
}
```

### Step 3: Test the Complete Workflow

#### As a Regular User:
1. Open "Asset Access Requests" tool
2. Click "+ New Request"
3. Select organization that owns the asset
4. Enter asset ID (and optionally vessel/scan IDs)
5. Choose permission level (view/edit)
6. Add optional message
7. Submit request

#### As an Admin:
1. Go to Admin Dashboard → Asset Sharing tab
2. See "Pending Access Requests" section
3. Review request details
4. Click "Approve" or "Reject"
5. If approving: Share is automatically created
6. If rejecting: Provide optional reason

#### As the Requesting User Again:
1. Return to "Asset Access Requests" tool
2. See updated status (approved/rejected)
3. If rejected: View rejection reason
4. If approved: Asset now accessible via normal sharing

## Usage Examples

### Example 1: User Requests View Access
```javascript
await sharingManager.requestAssetAccess({
    ownerOrganizationId: 'org_abc',
    assetId: 'asset_123',
    permission: 'view',
    message: 'Need access for inspection report'
});
```

### Example 2: Admin Approves Request
```javascript
// Admin approves - automatically creates share
const result = await sharingManager.approveAccessRequest('request_id');
// result.success === true
// Share is now created in shared_assets table
```

### Example 3: User Checks Request Status
```javascript
const myRequests = await sharingManager.getUserAccessRequests();
// Returns array of all user's requests with status
```

## Integration with Permission Requests

This system complements the existing permission request system:

### Permission Requests (existing)
- **Purpose**: Request role upgrades (viewer → editor, etc.)
- **Scope**: Organization-wide permissions
- **Target**: Your own role within your organization

### Asset Access Requests (new)
- **Purpose**: Request access to specific assets
- **Scope**: Individual assets/vessels/scans
- **Target**: Assets owned by other organizations

### Unified Admin Experience
Both request types appear in the admin dashboard:
- **Account Requests tab**: Permission upgrade requests
- **Asset Sharing tab**: Asset access requests

## Workflow Diagram

```
User (Org A)                    Admin (Org B)                Database
     |                               |                            |
     |-- Request Asset Access ------>|                            |
     |                               |                            |
     |                               |<--- Store Request ---------|
     |                               |                            |
     |                               |-- Review Request           |
     |                               |                            |
     |                               |-- Approve                  |
     |                               |                            |
     |                               |--- Create Share ---------->|
     |                               |                            |
     |<--- Access Granted -----------|<--- Update Status ---------|
     |                                                            |
     |-- Access Shared Asset ---------------------------------------->
```

## Database Schema Details

### asset_access_requests Table
| Column | Type | Constraint | Description |
|--------|------|------------|-------------|
| id | UUID | PK | Unique request ID |
| user_id | UUID | FK → auth.users | Requesting user |
| user_organization_id | UUID | FK → organizations | User's org |
| owner_organization_id | UUID | FK → organizations | Asset owner org |
| asset_id | TEXT | - | Asset being requested |
| vessel_id | TEXT | NULL | Optional vessel |
| scan_id | TEXT | NULL | Optional scan |
| requested_permission | TEXT | CHECK | 'view' or 'edit' |
| message | TEXT | NULL | User's message |
| status | TEXT | CHECK | 'pending', 'approved', 'rejected' |
| approved_by | UUID | FK → auth.users | Admin who approved |
| rejected_by | UUID | FK → auth.users | Admin who rejected |
| rejection_reason | TEXT | NULL | Reason for rejection |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | When requested |
| approved_at | TIMESTAMPTZ | NULL | When approved |
| rejected_at | TIMESTAMPTZ | NULL | When rejected |

### Unique Constraint
Prevents duplicate pending requests for the same asset/organization combination:
```sql
CONSTRAINT unique_asset_access_request
UNIQUE (user_organization_id, owner_organization_id, asset_id, vessel_id, scan_id, status)
```

## Security & Permissions

### Row Level Security (RLS)
- **View**: Users see their own requests; admins see requests for their org
- **Insert**: Any authenticated user can create requests
- **Update**: Only admins/org_admins can approve/reject
- **Delete**: Users can cancel their own pending requests

### Permission Checks
1. **Request Creation**: Must be authenticated, can't request own org assets
2. **Approval**: Must be admin or org_admin of owner organization
3. **Rejection**: Must be admin or org_admin of owner organization
4. **Cancel**: Must be request creator and status must be 'pending'

## Advanced Features

### Auto-Share on Approval
When an access request is approved:
1. Function checks if share already exists
2. If exists: Upgrades permission if needed
3. If not exists: Creates new share
4. Updates request status to 'approved'

### Duplicate Prevention
The unique constraint ensures:
- Users can't create multiple pending requests for same asset
- Users can create new request after previous one is approved/rejected
- Same asset can be requested at different levels (asset/vessel/scan)

### Request History
All requests are preserved:
- Track when requested, approved, or rejected
- View who approved/rejected
- See rejection reasons
- Audit trail for compliance

## Troubleshooting

### Issue: "Request not found or already processed"
**Solution**: Request may have been approved/rejected already, or doesn't exist

### Issue: "You already have a pending request for this asset"
**Solution**: Cancel or wait for existing request to be processed

### Issue: "Only admins can approve access requests"
**Solution**: Verify user has admin or org_admin role

### Issue: "Cannot request access to your own organization assets"
**Solution**: Don't need to request - you already have access to your own assets

## Best Practices

### For Users
1. **Provide context**: Use the message field to explain why you need access
2. **Be specific**: Request only the specific vessel/scan you need, not entire asset
3. **Choose appropriate permission**: Only request 'edit' if you actually need to modify

### For Admins
1. **Review carefully**: Check requester's organization and reason
2. **Grant minimum access**: Approve view-only unless edit is justified
3. **Provide clear rejections**: Explain why if rejecting (helps user resubmit correctly)
4. **Monitor requests**: Check the admin dashboard regularly

### For System Architects
1. **Set up notifications**: Consider email/push notifications for new requests
2. **Implement quotas**: Limit number of pending requests per user
3. **Track metrics**: Monitor approval/rejection rates
4. **Regular audits**: Review sharing patterns for security

## Future Enhancements

Consider implementing:
- **Email notifications** when request is approved/rejected
- **Request templates** for common access patterns
- **Bulk approvals** for multiple requests
- **Request expiration** after X days pending
- **Usage analytics** on shared assets
- **Automatic approval rules** based on organization relationships
- **Request comments** for back-and-forth discussion

## Support & Maintenance

### Monitoring Queries
```sql
-- Pending requests count
SELECT owner_organization_id, COUNT(*)
FROM asset_access_requests
WHERE status = 'pending'
GROUP BY owner_organization_id;

-- Approval rate by organization
SELECT owner_organization_id,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0 / COUNT(*) as approval_rate
FROM asset_access_requests
GROUP BY owner_organization_id;

-- Old pending requests (> 7 days)
SELECT * FROM asset_access_requests
WHERE status = 'pending'
AND created_at < NOW() - INTERVAL '7 days';
```

### Cleanup Scripts
```sql
-- Archive old rejected requests (> 90 days)
DELETE FROM asset_access_requests
WHERE status = 'rejected'
AND rejected_at < NOW() - INTERVAL '90 days';
```

## Integration Points

### With Existing Systems
- **Permission Requests**: Complementary system for role-based access
- **Shared Assets**: Auto-creates shares on approval
- **Organizations**: Validates organization relationships
- **Auth System**: Uses existing user authentication

### External Systems
- **Email Service**: Send notifications on status changes
- **Slack/Teams**: Post notifications to channels
- **Audit System**: Log all request activities
- **Analytics**: Track usage patterns
