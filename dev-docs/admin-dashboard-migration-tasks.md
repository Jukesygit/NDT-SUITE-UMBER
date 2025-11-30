# Admin Dashboard Migration Tasks

## Phase 1: Foundation

### 1.1 Types
- [ ] Create `src/types/admin.ts` with all TypeScript interfaces
  - [ ] Organization types
  - [ ] AdminUser types
  - [ ] Request types (Account, Permission)
  - [ ] Asset types
  - [ ] Share types
  - [ ] Config types
  - [ ] Stats types

### 1.2 Service Layer
- [ ] Create `src/services/admin-service.ts`
  - [ ] Stats methods
  - [ ] Organization CRUD methods
  - [ ] User CRUD methods
  - [ ] Account request methods
  - [ ] Permission request methods
  - [ ] Asset transfer methods
  - [ ] Sharing methods
  - [ ] Configuration methods

### 1.3 Page Shell
- [ ] Create `src/pages/admin/index.tsx` (lazy loading wrapper)
- [ ] Create `src/pages/admin/AdminPage.tsx` (tab container)

---

## Phase 2: Query Hooks

### 2.1 Query Hooks
- [ ] `src/hooks/queries/useAdminStats.ts`
- [ ] `src/hooks/queries/useOrganizations.ts`
- [ ] `src/hooks/queries/useAdminUsers.ts`
- [ ] `src/hooks/queries/useAccountRequests.ts`
- [ ] `src/hooks/queries/useAdminAssets.ts`
- [ ] `src/hooks/queries/useAssetShares.ts`
- [ ] `src/hooks/queries/useAdminConfig.ts`

### 2.2 Mutation Hooks
- [ ] `src/hooks/mutations/useOrganizationMutations.ts`
- [ ] `src/hooks/mutations/useUserMutations.ts`
- [ ] `src/hooks/mutations/useRequestMutations.ts`
- [ ] `src/hooks/mutations/useAssetTransferMutations.ts`
- [ ] `src/hooks/mutations/useShareMutations.ts`
- [ ] `src/hooks/mutations/useConfigMutations.ts`

---

## Phase 3: Shared Components

- [ ] `src/pages/admin/components/StatusBadge.tsx`
- [ ] `src/pages/admin/components/StatCard.tsx`
- [ ] `src/pages/admin/components/RequestCard.tsx`
- [ ] `src/pages/admin/components/ShareCard.tsx`
- [ ] `src/pages/admin/components/OrganizationCard.tsx`
- [ ] `src/pages/admin/components/ConfigListEditor.tsx`

---

## Phase 4: Tab Components

- [ ] `src/pages/admin/tabs/OverviewTab.tsx`
  - [ ] Stats grid
  - [ ] Organizations summary
  - [ ] Recent users list

- [ ] `src/pages/admin/tabs/OrganizationsTab.tsx`
  - [ ] Organization cards grid
  - [ ] Create organization
  - [ ] Edit/delete organization
  - [ ] Context menu

- [ ] `src/pages/admin/tabs/UsersTab.tsx`
  - [ ] DataTable with sorting
  - [ ] Search/filter
  - [ ] Pagination
  - [ ] Edit/delete actions

- [ ] `src/pages/admin/tabs/AssetsTab.tsx`
  - [ ] Asset table with selection
  - [ ] Single transfer
  - [ ] Bulk transfer
  - [ ] Organization summary cards

- [ ] `src/pages/admin/tabs/RequestsTab.tsx`
  - [ ] Permission requests section
  - [ ] Account requests section
  - [ ] Approve/reject with loading states

- [ ] `src/pages/admin/tabs/SharingTab.tsx`
  - [ ] Access requests section
  - [ ] Current assets grid
  - [ ] Active shares list
  - [ ] Create share

- [ ] `src/pages/admin/tabs/ConfigurationTab.tsx`
  - [ ] Config list editors (11 lists)
  - [ ] Add/edit/delete items
  - [ ] Reset list
  - [ ] Export/import

---

## Phase 5: Modals

- [ ] `src/pages/admin/modals/CreateUserModal.tsx`
  - [ ] Form validation
  - [ ] Organization selector
  - [ ] Role selector
  - [ ] Error handling

- [ ] `src/pages/admin/modals/EditUserModal.tsx`
  - [ ] Pre-populated form
  - [ ] Role change

- [ ] `src/pages/admin/modals/CreateOrganizationModal.tsx`
  - [ ] Name input
  - [ ] Validation

- [ ] `src/pages/admin/modals/TransferAssetModal.tsx`
  - [ ] Organization selector
  - [ ] Warning message
  - [ ] Single/bulk mode

- [ ] `src/pages/admin/modals/CreateShareModal.tsx`
  - [ ] Asset selector
  - [ ] Vessel/scan drill-down
  - [ ] Organization selector
  - [ ] Permission selector

- [ ] `src/pages/admin/modals/EditShareModal.tsx`
  - [ ] Permission toggle

- [ ] `src/pages/admin/modals/RejectReasonModal.tsx`
  - [ ] Optional reason textarea

---

## Phase 6: Integration

- [ ] Update App routing for `/admin`
- [ ] Update sidebar navigation
- [ ] Wire up header component

---

## Phase 7: Cleanup & Testing

### 7.1 Removal
- [ ] Remove `src/tools/admin-dashboard.js`
- [ ] Remove admin-dashboard from ToolContainer
- [ ] Clean up any dead imports

### 7.2 Testing
- [ ] Overview tab - stats load correctly
- [ ] Organizations - CRUD operations work
- [ ] Users - CRUD with modals work
- [ ] Users - search and pagination work
- [ ] Account requests - approve/reject work
- [ ] Permission requests - approve/reject work
- [ ] Assets - single transfer works
- [ ] Assets - bulk transfer works
- [ ] Sharing - create share wizard works
- [ ] Sharing - access request approval works
- [ ] Configuration - add/edit/delete items work
- [ ] Configuration - reset list works
- [ ] Configuration - export/import work
- [ ] Loading states appear correctly
- [ ] Error states appear correctly
- [ ] Tab switching preserves data (React Query cache)

---

## Progress Log

| Date | Phase | Tasks Completed | Notes |
|------|-------|-----------------|-------|
| | | | |

---

*Created: 2024-11-27*
