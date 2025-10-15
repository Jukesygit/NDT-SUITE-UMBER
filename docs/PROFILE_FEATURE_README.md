# Profile Management Feature

## Overview

The Profile Management feature allows users to:
- View their profile information
- Request permission upgrades from administrators
- Track the status of their permission requests

Administrators can:
- View and manage permission requests in the Admin Dashboard
- Approve or reject permission upgrade requests

## Setup Instructions

### 1. Run the SQL Schema

Execute the SQL schema in your Supabase SQL Editor:

```bash
# File: ../database/supabase-profile-schema.sql
```

This will create:
- `permission_requests` table for storing permission upgrade requests
- RLS policies for secure access control
- Database functions for approving/rejecting requests

### 2. File Structure

The following files have been created/modified:

**New Files:**
- `../database/supabase-profile-schema.sql` - Database schema for permission requests
- `src/tools/profile.js` - Profile management component

**Modified Files:**
- `src/main.js` - Added profile tool to navigation
- `index.html` - Added profile container
- `src/tools/admin-dashboard.js` - Added permission request management

## Features

### User Profile Tab

Users can access their profile by clicking the user icon in the sidebar. The profile page shows:

1. **Profile Information**
   - Username
   - Email
   - Organization
   - Current Role (with color coding)

2. **Request Permission Upgrade**
   - Select desired role from available options
   - Provide reason for the request
   - Submit request to administrators

3. **My Permission Requests**
   - View all submitted permission requests
   - See request status (pending/approved/rejected)
   - View approval/rejection reasons

### Admin Dashboard Integration

Administrators see permission requests in the Admin Dashboard:

1. **Requests Tab**
   - Shows both account requests and permission requests
   - Permission requests display: user info, current role → requested role
   - One-click approve/reject with optional reason

2. **Request Badge**
   - Badge shows total pending requests (account + permission)
   - Updates automatically when requests are processed

## How It Works

### Permission Request Flow

1. **User submits request:**
   - User navigates to Profile tab
   - Selects desired role (higher than current role)
   - Provides reason for upgrade
   - Submits request

2. **Admin reviews request:**
   - Admin sees request in Admin Dashboard → Requests tab
   - Reviews user information and reason
   - Approves or rejects with optional reason

3. **Request processed:**
   - If approved: User's role is immediately updated
   - If rejected: User sees rejection reason in their profile
   - User receives updated permissions on next login/page refresh

### Role Hierarchy

Users can only request roles higher than their current role:

- **Viewer** → Can request: Editor, Org Admin, Admin
- **Editor** → Can request: Org Admin, Admin
- **Org Admin** → Can request: Admin
- **Admin** → Cannot request upgrades (already highest role)

### Database Schema

**permission_requests table:**
```sql
- id (UUID)
- user_id (UUID, references auth.users)
- requested_role (TEXT)
- current_role (TEXT)
- message (TEXT)
- status (TEXT: pending/approved/rejected)
- approved_by (UUID)
- rejected_by (UUID)
- rejection_reason (TEXT)
- created_at (TIMESTAMPTZ)
- approved_at (TIMESTAMPTZ)
- rejected_at (TIMESTAMPTZ)
```

**RLS Policies:**
- Users can view their own requests
- Users can create permission requests for themselves
- Only admins/org_admins can update requests
- Proper authentication checks on all operations

## Security Considerations

1. **Row Level Security (RLS)**
   - All operations are protected by RLS policies
   - Users can only view/create their own requests
   - Only authenticated admins can approve/reject

2. **Role Validation**
   - Users can only request higher roles
   - Duplicate pending requests are prevented
   - Role changes are atomic (database functions)

3. **Audit Trail**
   - All requests tracked with timestamps
   - Approval/rejection reasons stored
   - Approver/rejector IDs recorded

## Testing

### Test the Feature

1. **Create a test user:**
   - Login as admin
   - Go to Admin Dashboard → Users
   - Create a new user with 'viewer' role

2. **Test permission request:**
   - Login as the test user
   - Go to Profile tab
   - Request upgrade to 'editor'
   - Add a reason

3. **Test admin approval:**
   - Login as admin
   - Go to Admin Dashboard → Requests
   - See the permission request
   - Approve or reject it

4. **Verify role change:**
   - If approved: User's role should update
   - User should see new role in profile
   - User should have new permissions

### Common Issues

**Supabase not configured:**
- Profile feature requires Supabase backend
- Local mode shows message about Supabase requirement

**Permission denied:**
- Check RLS policies are properly set up
- Verify user authentication
- Check admin role assignment

**Requests not showing:**
- Verify SQL schema was run successfully
- Check browser console for errors
- Ensure proper foreign key relationships

## API Reference

### Supabase Functions

```javascript
// Approve permission request
supabase.rpc('approve_permission_request', {
  request_id: 'uuid'
})

// Reject permission request
supabase.rpc('reject_permission_request', {
  request_id: 'uuid',
  reason: 'optional text'
})
```

### Component Methods

```javascript
// Profile component
profile.init(container)  // Initialize profile view
profile.destroy()        // Cleanup

// Admin dashboard integration
adminDashboard.refresh() // Refresh to show new requests
```

## Future Enhancements

Potential improvements:
- Email notifications for request status changes
- Bulk approve/reject requests
- Request expiration/auto-cleanup
- Custom role creation
- Permission request templates
- Request priority levels
- Delegation of approval authority
