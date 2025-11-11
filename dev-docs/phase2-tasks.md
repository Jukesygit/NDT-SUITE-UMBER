# Phase 2 Implementation Tasks

**Status:** Ready to Start
**Last Updated:** 2025-11-11

---

## Legend
- [ ] Not started
- [→] In progress
- [✓] Completed
- [⚠] Blocked/Issue

---

## Phase 2A: TypeScript Migration

### Task 1: Migrate personnel-service.js
- [ ] Rename `personnel-service.js` to `personnel-service.ts`
- [ ] Add imports for types from `@types`
- [ ] Add return type to `getAllPersonnelWithCompetencies()`: `Promise<PersonnelWithCompetencies[]>`
- [ ] Add type annotations to helper functions
- [ ] Test: Run `npx tsc --noEmit` - should have zero errors
- [ ] Test: Verify data still loads correctly in browser
- [ ] Commit: "refactor: migrate personnel-service to TypeScript"

### Task 2: Migrate competency-service.js
- [ ] Rename `competency-service.js` to `competency-service.ts`
- [ ] Add imports for types from `@types`
- [ ] Add return types to all functions
  - [ ] `getExpiringCompetencies()`: `Promise<EmployeeCompetency[]>`
  - [ ] `getCompetencyDefinitions()`: `Promise<CompetencyDefinition[]>`
  - [ ] `updateCompetency()`: `Promise<SupabaseResponse<EmployeeCompetency>>`
  - [ ] `deleteCompetency()`: `Promise<SupabaseResponse<void>>`
- [ ] Add parameter types to all functions
- [ ] Test: Run `npx tsc --noEmit` - should have zero errors
- [ ] Test: Verify competency CRUD operations work
- [ ] Commit: "refactor: migrate competency-service to TypeScript"

### Task 3: Update service imports in PersonnelManagementPage
- [ ] Update import paths to `.ts` extensions
- [ ] Verify no runtime errors
- [ ] Commit: "chore: update service imports to TypeScript"

### Task 4: Migrate PersonnelManagementPage.jsx to .tsx
- [ ] Rename `PersonnelManagementPage.jsx` to `PersonnelManagementPage.tsx`
- [ ] Add type imports from `@types`
- [ ] Add types to state variables:
  - [ ] `personnel: PersonnelWithCompetencies[]`
  - [ ] `loading: boolean`
  - [ ] `searchTerm: string`
  - [ ] `filterOrg: string`
  - [ ] `filterRole: string`
  - [ ] etc.
- [ ] Add types to function parameters
- [ ] Add return types to helper functions
- [ ] Fix any TypeScript errors
- [ ] Test: Run `npx tsc --noEmit` - zero errors
- [ ] Test: All features work in browser
- [ ] Commit: "refactor: migrate PersonnelManagementPage to TypeScript"

### TypeScript Migration Verification
- [ ] Run `npx tsc --noEmit` - **MUST BE ZERO ERRORS**
- [ ] Run `npm run build` - succeeds without errors
- [ ] Manual test: View personnel page
- [ ] Manual test: Search and filter
- [ ] Manual test: Add competency
- [ ] Manual test: Edit competency
- [ ] Manual test: Delete competency
- [ ] Manual test: Approve/reject competency
- [ ] No console errors in browser

---

## Phase 2B: Component Splitting

### Task 5: Create Custom Hooks

#### Create usePersonnelData hook
- [ ] Create file `src/hooks/usePersonnelData.ts`
- [ ] Extract data loading logic from PersonnelManagementPage
- [ ] Return: `{ personnel, loading, error, refetch }`
- [ ] Add proper TypeScript types
- [ ] Test: Hook loads data correctly
- [ ] Commit: "feat: add usePersonnelData custom hook"

#### Create usePersonnelFilters hook
- [ ] Create file `src/hooks/usePersonnelFilters.ts`
- [ ] Extract filter logic from PersonnelManagementPage
- [ ] Implement useMemo for filtered results
- [ ] Return: `{ filteredPersonnel, searchTerm, setSearchTerm, ... }`
- [ ] Add proper TypeScript types
- [ ] Test: Filtering works correctly
- [ ] Commit: "feat: add usePersonnelFilters custom hook"

#### Create usePersonnelSort hook
- [ ] Create file `src/hooks/usePersonnelSort.ts`
- [ ] Extract sorting logic from PersonnelManagementPage
- [ ] Implement useMemo for sorted results
- [ ] Return: `{ sortedPersonnel, sortColumn, sortDirection, onSort }`
- [ ] Add proper TypeScript types
- [ ] Test: Sorting works correctly
- [ ] Commit: "feat: add usePersonnelSort custom hook"

### Task 6: Create Component Directory
- [ ] Create directory `src/components/personnel/`
- [ ] Create directory `src/hooks/` (if not exists)

### Task 7: Extract DirectoryView Component
- [ ] Create file `src/components/personnel/DirectoryView.tsx`
- [ ] Define `DirectoryViewProps` interface
- [ ] Extract lines ~385-1200 from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Import toast and confirmDialog
- [ ] Test: Directory view renders correctly
- [ ] Test: All directory view features work
- [ ] Commit: "refactor: extract DirectoryView component"

### Task 8: Extract MatrixView Component
- [ ] Create file `src/components/personnel/MatrixView.tsx`
- [ ] Define `MatrixViewProps` interface
- [ ] Extract lines ~1200-1900 from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Test: Matrix view renders correctly
- [ ] Test: Matrix view features work
- [ ] Commit: "refactor: extract MatrixView component"

### Task 9: Extract ExpiringView Component
- [ ] Create file `src/components/personnel/ExpiringView.tsx`
- [ ] Define `ExpiringViewProps` interface
- [ ] Extract lines ~1900-2100 from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Test: Expiring view renders correctly
- [ ] Test: Expiring view features work
- [ ] Commit: "refactor: extract ExpiringView component"

### Task 10: Extract PendingApprovalsView Component
- [ ] Create file `src/components/personnel/PendingApprovalsView.tsx`
- [ ] Define `PendingApprovalsViewProps` interface
- [ ] Extract lines ~2100-2400 from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Include approval/rejection logic
- [ ] Test: Pending approvals view works
- [ ] Test: Approve/reject functionality works
- [ ] Commit: "refactor: extract PendingApprovalsView component"

### Task 11: Extract PersonnelFilters Component
- [ ] Create file `src/components/personnel/PersonnelFilters.tsx`
- [ ] Define `PersonnelFiltersProps` interface
- [ ] Extract filter UI from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Test: Filters render and work correctly
- [ ] Commit: "refactor: extract PersonnelFilters component"

### Task 12: Extract PersonnelStats Component
- [ ] Create file `src/components/personnel/PersonnelStats.tsx`
- [ ] Define `PersonnelStatsProps` interface
- [ ] Extract statistics cards from PersonnelManagementPage
- [ ] Add proper prop types
- [ ] Test: Stats display correctly
- [ ] Commit: "refactor: extract PersonnelStats component"

### Task 13: Refactor PersonnelManagementPage
- [ ] Import all extracted components
- [ ] Import all custom hooks
- [ ] Replace extracted code with component usage
- [ ] Wire up props correctly
- [ ] Ensure `onRefresh` callbacks work
- [ ] Verify file is now < 500 lines
- [ ] Test: All views still work
- [ ] Test: Navigation between views works
- [ ] Commit: "refactor: reorganize PersonnelManagementPage with extracted components"

### Component Splitting Verification
- [ ] PersonnelManagementPage is < 500 lines
- [ ] Each component is < 300 lines
- [ ] No functionality lost
- [ ] All features work identically
- [ ] No console errors
- [ ] TypeScript compilation successful
- [ ] Run `npm run build` - succeeds

---

## Phase 2C: Pagination

### Task 14: Create usePagination Hook
- [ ] Create file `src/hooks/usePagination.ts`
- [ ] Implement generic pagination logic
- [ ] Support 25 items per page
- [ ] Return: `{ currentPage, totalPages, paginatedItems, goToPage, nextPage, prevPage }`
- [ ] Add TypeScript generics for type safety
- [ ] Test: Hook paginates correctly
- [ ] Commit: "feat: add usePagination custom hook"

### Task 15: Create Pagination Component
- [ ] Create file `src/components/Pagination.tsx`
- [ ] Define `PaginationProps` interface
- [ ] Implement pagination controls UI
- [ ] Style with Tailwind CSS
- [ ] Test: Controls work correctly
- [ ] Commit: "feat: add Pagination component"

### Task 16: Add Pagination to DirectoryView
- [ ] Import usePagination hook
- [ ] Apply pagination to personnel list
- [ ] Add Pagination component to UI
- [ ] Reset to page 1 when filters change
- [ ] Test: Pagination works with filtering
- [ ] Test: Page state preserved correctly
- [ ] Commit: "feat: add pagination to DirectoryView"

### Task 17: Add Pagination to Other Views (if needed)
- [ ] Evaluate if MatrixView needs pagination
- [ ] Evaluate if ExpiringView needs pagination
- [ ] Evaluate if PendingApprovalsView needs pagination
- [ ] Implement pagination where beneficial
- [ ] Test each view with pagination
- [ ] Commit: "feat: add pagination to remaining views"

### Pagination Verification
- [ ] Only 25 items displayed per page in DirectoryView
- [ ] Pagination controls work smoothly
- [ ] Page resets to 1 when filters change
- [ ] Performance acceptable with 100+ personnel
- [ ] No console errors
- [ ] TypeScript compilation successful

---

## Final Testing & Quality Checks

### Task 18: Comprehensive Manual Testing
- [ ] Test as **viewer** role:
  - [ ] Can view personnel
  - [ ] Cannot edit/delete
  - [ ] Can export data
- [ ] Test as **editor** role:
  - [ ] Can view personnel
  - [ ] Can add/edit/delete competencies
  - [ ] Can export data
- [ ] Test as **org_admin** role:
  - [ ] Can view own org personnel
  - [ ] Can manage own org data
  - [ ] Cannot see other orgs
- [ ] Test as **admin** role:
  - [ ] Can view all organizations
  - [ ] Can manage all data
  - [ ] All admin features work

### Task 19: Performance Testing
- [ ] Test with 50 personnel records
- [ ] Test with 100 personnel records
- [ ] Test with 200 personnel records (if available)
- [ ] Verify page load < 1 second
- [ ] Check Network tab - still only 2 database queries
- [ ] Check memory usage - no leaks

### Task 20: Build & Deployment Checks
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run typecheck` - no errors
- [ ] Run `npm run build` - succeeds
- [ ] Test production build: `npm run preview`
- [ ] Check bundle size - main bundle < 500KB
- [ ] No console warnings in production

### Task 21: Code Review
- [ ] Run `/code-review` command
- [ ] Address any security issues found
- [ ] Address any code quality issues found
- [ ] Verify no hardcoded secrets
- [ ] Verify proper error handling

### Task 22: Documentation Updates
- [ ] Update this file with completion status
- [ ] Update PHASE_2_HANDOVER.md with findings
- [ ] Document any deviations from plan
- [ ] Document any lessons learned
- [ ] Update PROJECT_KNOWLEDGE.md if architecture changed

---

## Phase 2 Completion Checklist

### Code Quality ✓
- [ ] PersonnelManagementPage < 500 lines (currently 2,567)
- [ ] All files TypeScript (.ts/.tsx)
- [ ] Zero TypeScript errors
- [ ] All components < 300 lines
- [ ] No `any` types used (except where necessary)

### Performance ✓
- [ ] Page load < 1 second
- [ ] Still only 2 database queries (Phase 1 optimization preserved)
- [ ] Pagination reduces DOM nodes by 75%+
- [ ] No memory leaks

### Functionality ✓
- [ ] All features work identically to before
- [ ] Toast notifications work
- [ ] Confirmation dialogs work
- [ ] Search and filtering work
- [ ] Sorting works
- [ ] CRUD operations work
- [ ] Approval/rejection workflow works
- [ ] Export functionality works

### Testing ✓
- [ ] Manual testing complete
- [ ] All user roles tested
- [ ] Performance tested
- [ ] Build succeeds
- [ ] No console errors
- [ ] Code review passed

---

## Blocked/Issues

**None currently**

---

## Notes & Learnings

*To be filled in during implementation*

---

**Last Updated:** 2025-11-11
**Completed By:** [TBD]
**Total Time Spent:** [TBD]
