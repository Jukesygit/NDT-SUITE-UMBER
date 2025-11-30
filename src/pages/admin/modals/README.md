# Admin Dashboard Modals

This directory contains all modal components for the admin dashboard.

## Available Modals

### Organization Modals
- **CreateOrganizationModal** - Create new organization

### User Modals
- **CreateUserModal** - Create new user account
- **EditUserModal** - Edit user role and status

### Asset Transfer Modals
- **TransferAssetModal** - Transfer assets between organizations
  - Supports single asset transfer
  - Supports bulk transfer of multiple assets
  - Warning about data movement
  - Organization selection

### Share Modals
- **CreateShareModal** - Multi-step wizard for sharing assets
  - Asset selection (optional preselect)
  - Share level selection (entire asset / vessel / scan)
  - Drill down to specific vessel/scan
  - Organization selection
  - Permission level (view / edit)
  - Summary before confirmation

- **EditShareModal** - Edit share permissions
  - View share details
  - Update permission level
  - Simple, focused interface

## Usage Examples

### TransferAssetModal

```tsx
import { TransferAssetModal } from './modals';

// Single asset transfer
<TransferAssetModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  asset={selectedAsset}
  onSuccess={() => {
    // Refresh data
  }}
/>

// Bulk transfer
<TransferAssetModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  assetIds={selectedAssetIds}
  onSuccess={() => {
    // Refresh data
  }}
/>
```

### CreateShareModal

```tsx
import { CreateShareModal } from './modals';

// Without preselected asset (full wizard)
<CreateShareModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onSuccess={() => {
    // Refresh data
  }}
/>

// With preselected asset (skip asset selection step)
<CreateShareModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  preselectedAsset={selectedAsset}
  onSuccess={() => {
    // Refresh data
  }}
/>
```

### EditShareModal

```tsx
import { EditShareModal } from './modals';

<EditShareModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  share={selectedShare}
  onSuccess={() => {
    // Refresh data
  }}
/>
```

## Features

All modals include:
- Dark mode styling matching the admin dashboard
- Proper loading states
- Error handling with user-friendly messages
- Form validation
- Accessibility (keyboard navigation, focus management)
- React Query integration for data fetching and mutations
- Success callbacks for refreshing parent component data

## Dependencies

- React Query hooks from `src/hooks/queries/`
- Mutation hooks from `src/hooks/mutations/`
- UI components from `src/components/ui/`
- Type definitions from `src/types/admin.ts`
