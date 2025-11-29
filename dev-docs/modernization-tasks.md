# NDT Suite Modernization Tasks

**Status:** In Progress
**Started:** 2025-11-27
**Last Updated:** 2025-11-27 (Phase 3.2 PersonnelPage - COMPLETE)

---

## Phase 1: Foundation

### 1.1 React Query Setup
- [x] Install @tanstack/react-query and devtools
- [x] Create `src/lib/query-client.js` with default configuration
- [x] Wrap App.jsx with QueryClientProvider
- [x] Add ReactQueryDevtools (dev only)
- [x] Verify React Query working with simple test hook

### 1.2 Dead Code Removal
- [x] Delete `src/components/Layout.jsx` (unused, 37KB)
- [ ] Audit Redux store usage
- [ ] Decision: Remove Redux or commit to using it
- [ ] Remove any orphaned imports/exports

### 1.3 Project Structure Setup
- [x] Create `src/hooks/queries/` directory
- [x] Create `src/hooks/mutations/` directory
- [x] Create `src/components/ui/` directory
- [x] Create `src/lib/` directory
- [ ] Move Supabase client to `src/lib/supabase.js`

### 1.4 First Query Hooks
- [x] Create `useProfile.js` query hook
- [x] Create `useCompetencies.js` query hook (includes useCompetencyDefinitions, useCompetencyCategories, useExpiringCompetencies, useCompetencyComments)
- [ ] Create `useUpdateProfile.js` mutation hook
- [ ] Test hooks in isolation

---

## Phase 2: Component Extraction

### 2.1 Core UI Components
- [x] Create `src/components/ui/LoadingSpinner.tsx` (PageSpinner, SectionSpinner, ButtonSpinner)
- [x] Create `src/components/ui/ErrorDisplay.tsx` (ErrorDisplay, InlineError)
- [x] Create `src/components/ui/EmptyState.tsx` (EmptyState, NoSearchResults)
- [x] Create `src/components/ui/index.ts` barrel export
- [x] Create `src/components/ui/ConfirmDialog.tsx` (created in Modal/ directory)

### 2.2 DataTable Component
- [x] Analyze table patterns in PersonnelManagementPage
- [x] Create `src/components/ui/DataTable/DataTable.tsx` (TypeScript)
- [x] Add sorting support (with useTableSort hook)
- [x] Add column configuration (generic Column<T> interface)
- [x] Add empty state handling (integrates with EmptyState component)
- [x] Add loading state handling (skeleton rows)
- [x] Export from `src/components/ui/DataTable/index.ts`
- [x] Add row expansion support
- [x] Export from main `src/components/ui/index.ts`

### 2.3 Modal Component
- [x] Analyze modal patterns across pages
- [x] Create `src/components/ui/Modal/Modal.tsx` (TypeScript)
- [x] Add size variants (small, medium, large, xl, full)
- [x] Add close on backdrop click
- [x] Add close on escape key
- [x] Add focus trap for accessibility
- [x] Export from `src/components/ui/Modal/index.ts`
- [x] Create useModal hook for state management
- [x] Create ConfirmDialog component for confirmations
- [x] Export from main `src/components/ui/index.ts`

### 2.4 Form Components
- [x] Create `src/components/ui/Form/FormField.tsx` (TypeScript)
- [x] Create `src/components/ui/Form/FormSelect.tsx` (TypeScript)
- [x] Create `src/components/ui/Form/FormTextarea.tsx` (TypeScript)
- [x] Create `src/components/ui/Form/FormCheckbox.tsx` (TypeScript)
- [x] Add validation display support (error messages, aria-invalid)
- [x] Add required field indicator (red asterisk)
- [x] Add useFormField hook for field state management
- [x] Export from `src/components/ui/Form/index.ts`
- [x] Export from main `src/components/ui/index.ts`

---

## Phase 3: Page Migration

### 3.1 ProfilePageNew Migration (IN PROGRESS)

#### Query Hooks
- [x] Create `useProfile(userId)` hook - exists in `src/hooks/queries/useProfile.ts`
- [x] Create `useUserCompetencies(userId)` hook - exists in `src/hooks/queries/useCompetencies.ts`
- [x] Create `useUpdateProfile()` mutation - `src/hooks/mutations/useUpdateProfile.ts`
- [x] Create `useUploadAvatar()` mutation - `src/hooks/mutations/useUploadAvatar.ts`
- [x] Create `useCreateCompetency()` mutation - `src/hooks/mutations/useCompetencyMutations.ts`
- [x] Create `useUpdateCompetency()` mutation - `src/hooks/mutations/useCompetencyMutations.ts`
- [x] Create `useDeleteCompetency()` mutation - `src/hooks/mutations/useCompetencyMutations.ts`
- [x] Create barrel export `src/hooks/mutations/index.ts`

#### Component Extraction
- [x] Create `src/pages/profile/` directory
- [x] Extract ProfileAvatar component - `src/pages/profile/ProfileAvatar.tsx`
- [x] Extract ProfilePersonalDetails component - `src/pages/profile/ProfilePersonalDetails.tsx`
- [x] Extract CompetencyCard component - `src/pages/profile/CompetencyCard.tsx`
- [x] Extract CompetenciesSection component - `src/pages/profile/CompetenciesSection.tsx`
- [x] Create barrel export `src/pages/profile/index.ts`
- [x] Extract EditCompetencyModal component - `src/pages/profile/EditCompetencyModal.tsx`

#### Page Rewrite
- [x] Create new ProfilePage container using React Query - `src/pages/profile/ProfilePage.tsx`
- [x] Replace useState loading patterns with React Query hooks
- [x] Wire up extracted components
- [ ] Test all functionality works
- [ ] Wire ProfilePage into App.jsx routing (optional - can use alongside legacy)
- [ ] Remove old ProfilePageNew.jsx (after validation)

### 3.2 PersonnelManagementPage Migration

#### Query Hooks
- [x] Create `usePersonnel()` hook - `src/hooks/queries/usePersonnel.ts`
- [x] Create `usePersonDetail(id)` hook - `src/hooks/queries/usePersonnel.ts`
- [x] Create `useOrganizations()` hook - `src/hooks/queries/usePersonnel.ts`
- [x] Create `useCompetencyMatrix()` hook - `src/hooks/queries/usePersonnel.ts`
- [x] Create `useUpdatePerson()` mutation - `src/hooks/mutations/usePersonnelMutations.ts`
- [x] Create `useUpdatePersonCompetency()` mutation - `src/hooks/mutations/usePersonnelMutations.ts`
- [x] Create `useDeletePersonCompetency()` mutation - `src/hooks/mutations/usePersonnelMutations.ts`
- [x] Create `useAddPersonCompetency()` mutation - `src/hooks/mutations/usePersonnelMutations.ts`

#### Component Extraction
- [x] Create `src/pages/personnel/` directory
- [x] Extract PersonnelFilters component - `src/pages/personnel/PersonnelFilters.tsx`
- [x] Extract PersonnelTable component - `src/pages/personnel/PersonnelTable.tsx`
- [x] Extract PersonnelExpandedRow component - `src/pages/personnel/PersonnelExpandedRow.tsx`
- [x] Extract ExpiringView component - `src/pages/personnel/ExpiringView.tsx`
- [x] Create barrel export - `src/pages/personnel/index.ts`

#### Page Rewrite
- [x] Create new PersonnelPage container - `src/pages/personnel/PersonnelPage.tsx`
- [x] Replace useState loading patterns with React Query
- [x] Wire up extracted components
- [ ] Test all functionality works
- [ ] Wire PersonnelPage into App.jsx routing (optional)
- [ ] Remove old PersonnelManagementPage.jsx (after validation)

---

## Phase 4: Legacy Tool Migration

### 4.1 Data Hub Migration (data-hub.js → React)

#### Analysis
- [ ] Document all views in data-hub.js (assets, vessels, scans)
- [ ] Map out data flow and state management
- [ ] Identify Supabase queries used
- [ ] List all user interactions/events

#### Query Hooks
- [ ] Create `useAssets()` hook
- [ ] Create `useAssetDetail(id)` hook
- [ ] Create `useVessels(assetId)` hook
- [ ] Create `useVesselDetail(id)` hook
- [ ] Create `useScans(vesselId)` hook
- [ ] Create `useScanDetail(id)` hook
- [ ] Create mutation hooks for CRUD operations

#### Components
- [ ] Create `src/pages/data-hub/` directory
- [ ] Create AssetList component
- [ ] Create AssetCard component
- [ ] Create AssetDetail component
- [ ] Create VesselList component
- [ ] Create VesselCard component
- [ ] Create VesselDetail component
- [ ] Create ScanList component
- [ ] Create ScanCard component
- [ ] Create ScanDetail component

#### Page Integration
- [ ] Create `src/pages/data-hub/index.jsx` container
- [ ] Implement tab/view switching
- [ ] Wire up all components
- [ ] Test all CRUD operations
- [ ] A/B test against legacy version

#### Cleanup
- [ ] Remove data-hub.js after validation
- [ ] Update DataHubPage.jsx to use new components
- [ ] Remove ToolContainer dependency for data hub

### 4.2 Admin Dashboard Migration (admin-dashboard.js → React)

#### Analysis
- [ ] Document all tabs in admin-dashboard.js
- [ ] Map out admin-specific queries
- [ ] Identify permission checks

#### Query Hooks
- [ ] Create `useAdminOverview()` hook
- [ ] Create `useAllUsers()` hook
- [ ] Create `useOrganizations()` hook
- [ ] Create `useAccountRequests()` hook
- [ ] Create admin mutation hooks

#### Components
- [ ] Create `src/pages/admin/` directory
- [ ] Create OverviewTab component
- [ ] Create UsersTab component
- [ ] Create OrganizationsTab component
- [ ] Create RequestsTab component
- [ ] Create AdminUserRow component
- [ ] Create AdminOrgRow component

#### Page Integration
- [ ] Create `src/pages/admin/index.jsx` container
- [ ] Implement tab navigation
- [ ] Wire up all components
- [ ] Test all admin operations
- [ ] Verify permission checks work

#### Cleanup
- [ ] Remove admin-dashboard.js after validation
- [ ] Update AdminDashboard.jsx to use new components

### 4.3 Other Tools (Evaluate)
- [ ] Evaluate cscan-visualizer.js - migrate or keep?
- [ ] Evaluate 3d-viewer.js - migrate or keep?
- [ ] Evaluate pec-visualizer.js - migrate or keep?
- [ ] Evaluate tofd-calculator.js - migrate or keep?
- [ ] Evaluate nii-coverage-calculator.js - migrate or keep?
- [ ] Document decision for each tool

---

## Phase 5: Cleanup & Optimization

### 5.1 Dead Code Removal
- [ ] Remove `src/store/` if Redux unused
- [ ] Remove ToolContainer.jsx if all tools migrated
- [ ] Remove legacy tool files after migration
- [ ] Audit and remove unused utilities
- [ ] Remove unused CSS/styles
- [ ] Remove unused npm packages
- [ ] Remove syncService and syncQueue (no offline support needed)

### 5.2 Sync Status Refactor
- [ ] Rewire sync-status.js to React Query mutation state (keep animated logo)
- [ ] Create useMutationStatus hook to aggregate pending mutations
- [ ] Update sync indicator to show "Saving..." when mutations pending
- [ ] Remove offline queue logic from sync-status
- [ ] Convert sync-status to React component (SyncStatus.tsx)

### 5.3 Performance Optimization
- [ ] Add React.memo to expensive components
- [ ] Audit and fix unnecessary re-renders
- [ ] Implement virtual scrolling for long lists (if needed)
- [ ] Add pagination to all data tables
- [ ] Analyze bundle size, implement code splitting
- [ ] Lazy load non-critical routes

### 5.4 TypeScript Migration (MANDATORY for all new code)
- [x] Convert query hooks to TypeScript (useProfile.ts, useCompetencies.ts)
- [x] Handle JS module imports in TypeScript (using require + type assertion)
- [x] Convert UI components to TypeScript (LoadingSpinner, ErrorDisplay, EmptyState)
- [ ] Add Supabase response types (generate from schema)
- [ ] Convert feature components to TypeScript
- [ ] Convert page containers to TypeScript (ProfilePageNew, PersonnelManagementPage, etc.)
- [ ] Convert services to TypeScript (competency-service, personnel-service)
- [ ] Convert supabase-client.js to TypeScript
- [ ] Convert auth-manager.js to TypeScript
- [ ] Convert utility functions to TypeScript
- [ ] Enable stricter TypeScript options progressively

### 5.5 Testing
- [ ] Add unit tests for query hooks
- [ ] Add component tests for UI components
- [ ] Add integration tests for key flows
- [ ] Document testing patterns

### 5.6 Documentation
- [ ] Update PROJECT_KNOWLEDGE.md with new patterns
- [ ] Document component library usage
- [ ] Create hook usage examples
- [ ] Update onboarding documentation

---

## Completion Checklist

### Phase 1: Foundation
- [x] React Query installed and configured
- [x] Dead code removed (Layout.jsx)
- [x] Project structure created
- [x] First hooks working (useProfile, useCompetencies)

### Phase 2: Components ✅ COMPLETE
- [x] Core UI components created (LoadingSpinner, ErrorDisplay, EmptyState)
- [x] DataTable component working (with useTableSort hook)
- [x] Modal component working (with useModal hook + ConfirmDialog)
- [x] Form components working (FormField, FormSelect, FormTextarea, FormCheckbox, useFormField)

### Phase 3: Pages
- [x] ProfilePage migrated (testing pending)
- [x] PersonnelPage migrated (testing pending)
- [ ] Old monolithic files removed (after validation)

### Phase 4: Tools
- [ ] Data Hub migrated to React
- [ ] Admin Dashboard migrated to React
- [ ] Other tools evaluated/migrated

### Phase 5: Cleanup
- [ ] All dead code removed
- [ ] Performance optimized
- [ ] TypeScript adoption started
- [ ] Documentation updated

---

## Notes & Decisions

### Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-11-27 | Adopt React Query | Eliminates manual loading states, provides caching |
| 2025-11-27 | Remove unused Redux | Adds complexity with no benefit |
| 2025-11-27 | Migrate data-hub first | Most used feature, biggest impact |
| 2025-11-27 | Mandatory TypeScript for new code | Type safety, better DX, easier refactoring |
| 2025-11-27 | Re-export existing LoadingStates | Don't reinvent, wrap existing components |
| 2025-11-27 | No offline support needed | Users always online, simplifies architecture |
| 2025-11-27 | Keep sync indicator, rewire to React Query | Nice UX feedback, reuse animated logo |

### Blockers
*None currently*

### Learnings
*Document learnings as migration progresses*

---

*Track progress by checking boxes as tasks complete*
*Update "Last Updated" date when making changes*
