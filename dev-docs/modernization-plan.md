# NDT Suite Modernization Plan

## Executive Summary

This plan outlines the systematic modernization of NDT Suite from a hybrid legacy/React architecture to a modern, maintainable corporate portal. The primary goals are:

1. **Adopt React Query** for all data fetching (eliminate manual loading states)
2. **Extract reusable components** from monolithic pages
3. **Migrate legacy tool modules** to React components
4. **Remove dead code** and unused dependencies
5. **Establish consistent patterns** across the codebase

---

## Current State Analysis

### Architecture Problems

| Issue | Files Affected | Severity |
|-------|---------------|----------|
| No React Query | All pages | HIGH |
| Monolithic pages (2,000+ LOC) | ProfilePageNew, PersonnelManagementPage | HIGH |
| Legacy JS tools | 9 files in src/tools/ (13,070 LOC) | HIGH |
| Unused Redux | store/*.ts | MEDIUM |
| Dead Layout component | Layout.jsx (37KB) | LOW |
| Inconsistent data patterns | Services, managers, direct calls | MEDIUM |

### Technical Debt Inventory

```
src/
├── components/
│   └── Layout.jsx           # DEAD CODE - 520 lines, unused
├── pages/
│   ├── ProfilePageNew.jsx   # MONOLITH - 1,586 lines
│   └── PersonnelManagementPage.jsx  # MONOLITH - 2,354 lines
├── tools/                   # LEGACY - 13,070 lines of jQuery-style code
│   ├── data-hub.js          # 3,983 lines
│   ├── admin-dashboard.js   # 1,918 lines
│   ├── cscan-visualizer.js  # 2,427 lines
│   ├── 3d-viewer.js         # 1,656 lines
│   └── [others]
└── store/                   # UNUSED - Redux configured but never used
```

---

## Target Architecture

### New File Structure

```
src/
├── components/
│   ├── ui/                  # NEW: Shared UI components
│   │   ├── DataTable/
│   │   │   ├── DataTable.jsx
│   │   │   ├── TableHeader.jsx
│   │   │   ├── TablePagination.jsx
│   │   │   └── index.js
│   │   ├── Modal/
│   │   │   ├── Modal.jsx
│   │   │   ├── ModalHeader.jsx
│   │   │   └── index.js
│   │   ├── Form/
│   │   │   ├── FormField.jsx
│   │   │   ├── FormSelect.jsx
│   │   │   └── index.js
│   │   ├── LoadingSpinner.jsx
│   │   ├── ErrorDisplay.jsx
│   │   └── EmptyState.jsx
│   ├── layout/              # NEW: Layout components
│   │   ├── LayoutNew.jsx    # Renamed from root
│   │   ├── Sidebar.jsx
│   │   └── Header.jsx
│   └── features/            # NEW: Feature-specific components
│       ├── competencies/
│       ├── personnel/
│       └── profile/
├── pages/
│   ├── profile/             # NEW: Split page structure
│   │   ├── index.jsx        # Page container (~100 LOC)
│   │   ├── ProfileInfo.jsx
│   │   ├── CompetenciesSection.jsx
│   │   └── ProfileModals/
│   ├── personnel/           # NEW: Split page structure
│   │   ├── index.jsx
│   │   ├── PersonnelTable.jsx
│   │   ├── PersonnelFilters.jsx
│   │   └── PersonnelModals/
│   ├── data-hub/            # NEW: Migrated from tools
│   │   ├── index.jsx
│   │   ├── AssetList.jsx
│   │   ├── VesselDetail.jsx
│   │   └── ScanDetail.jsx
│   └── admin/               # NEW: Migrated from tools
│       ├── index.jsx
│       ├── OverviewTab.jsx
│       ├── UsersTab.jsx
│       └── OrganizationsTab.jsx
├── hooks/                   # NEW: React Query hooks
│   ├── queries/
│   │   ├── useProfile.js
│   │   ├── useCompetencies.js
│   │   ├── usePersonnel.js
│   │   └── useAssets.js
│   └── mutations/
│       ├── useUpdateProfile.js
│       ├── useCreateCompetency.js
│       └── useDeleteCompetency.js
├── services/                # KEEP: API layer (wrapped by hooks)
│   ├── competency-service.js
│   ├── personnel-service.js
│   └── profile-service.js
├── lib/                     # NEW: Shared utilities
│   ├── query-client.js      # React Query configuration
│   └── supabase.js          # Supabase client (move from utils)
└── types/                   # NEW: TypeScript types
    ├── competency.ts
    ├── profile.ts
    └── personnel.ts
```

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Pages     │  │  Features   │  │     UI      │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                   │
│         ▼                ▼                                   │
│  ┌─────────────────────────────────────────────────┐       │
│  │              React Query Hooks                   │       │
│  │  useProfile, useCompetencies, usePersonnel      │       │
│  └──────────────────────┬──────────────────────────┘       │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Services Layer                      │       │
│  │  competency-service, personnel-service          │       │
│  └──────────────────────┬──────────────────────────┘       │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Supabase Client                     │       │
│  │  (with RLS policies enforced)                   │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Set up React Query infrastructure and remove dead code.

#### 1.1 Install Dependencies
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

#### 1.2 Configure Query Client
Create `src/lib/query-client.js`:
```javascript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,      // 5 minutes
            gcTime: 30 * 60 * 1000,        // 30 minutes (formerly cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,   // Corporate app, disable aggressive refetch
        },
        mutations: {
            retry: 0,
        },
    },
});
```

#### 1.3 Wrap App with QueryClientProvider
Update `src/App.jsx`:
```javascript
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            {/* existing app */}
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}
```

#### 1.4 Remove Dead Code
- Delete `src/components/Layout.jsx` (unused, 37KB)
- Evaluate Redux removal (currently unused)

#### 1.5 Create First Query Hook
Create `src/hooks/queries/useProfile.js`:
```javascript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useProfile(userId) {
    return useQuery({
        queryKey: ['profile', userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!userId,
    });
}
```

---

### Phase 2: Component Extraction (Week 2)

**Goal:** Extract reusable components from monolithic pages.

#### 2.1 Create UI Component Library

**DataTable Component** - Extract from PersonnelManagementPage:
```javascript
// src/components/ui/DataTable/DataTable.jsx
export function DataTable({
    columns,
    data,
    loading,
    emptyMessage,
    onRowClick,
    sortable = true,
}) {
    // Generic table implementation
}
```

**Modal Component** - Standardize modal pattern:
```javascript
// src/components/ui/Modal/Modal.jsx
export function Modal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'medium',
}) {
    // Consistent modal implementation
}
```

**FormField Component** - Standardize form inputs:
```javascript
// src/components/ui/Form/FormField.jsx
export function FormField({
    label,
    name,
    type = 'text',
    value,
    onChange,
    error,
    required,
}) {
    // Consistent form field
}
```

#### 2.2 Component Inventory to Extract

| Component | Source | Estimated Size |
|-----------|--------|----------------|
| DataTable | PersonnelManagementPage | ~200 LOC |
| Modal | ProfilePageNew, PersonnelManagement | ~100 LOC |
| FormField | Multiple pages | ~50 LOC |
| LoadingSpinner | Various | ~20 LOC |
| EmptyState | Various | ~30 LOC |
| ConfirmDialog | Various | ~80 LOC |
| CompetencyCard | ProfilePageNew | ~100 LOC |
| UserAvatar | Multiple | ~40 LOC |

---

### Phase 3: Page Migration (Weeks 3-4)

**Goal:** Migrate ProfilePageNew and PersonnelManagementPage to use React Query and extracted components.

#### 3.1 ProfilePageNew Migration

**Before:** 1,586 lines, all-in-one
**After:** Split into focused components

```
src/pages/profile/
├── index.jsx                    # ~100 LOC - Container with React Query
├── ProfileHeader.jsx            # ~80 LOC - Avatar, name, role display
├── ProfileInfo.jsx              # ~150 LOC - Editable profile form
├── CompetenciesSection.jsx      # ~200 LOC - Competency list/management
├── CompetencyCard.jsx           # ~100 LOC - Single competency display
└── modals/
    ├── EditProfileModal.jsx     # ~120 LOC
    └── AddCompetencyModal.jsx   # ~150 LOC
```

**New Page Container:**
```javascript
// src/pages/profile/index.jsx
import { useProfile } from '../../hooks/queries/useProfile';
import { useCompetencies } from '../../hooks/queries/useCompetencies';
import { ProfileHeader } from './ProfileHeader';
import { ProfileInfo } from './ProfileInfo';
import { CompetenciesSection } from './CompetenciesSection';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';

export default function ProfilePage() {
    const { data: profile, isLoading, error } = useProfile();
    const { data: competencies } = useCompetencies(profile?.id);

    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay error={error} />;

    return (
        <div className="profile-page">
            <ProfileHeader profile={profile} />
            <ProfileInfo profile={profile} />
            <CompetenciesSection
                competencies={competencies}
                userId={profile.id}
            />
        </div>
    );
}
```

#### 3.2 PersonnelManagementPage Migration

**Before:** 2,354 lines, all-in-one
**After:** Split into focused components

```
src/pages/personnel/
├── index.jsx                    # ~100 LOC - Container
├── PersonnelFilters.jsx         # ~120 LOC - Search, filter controls
├── PersonnelTable.jsx           # ~200 LOC - Uses DataTable component
├── PersonnelRow.jsx             # ~80 LOC - Single row rendering
└── modals/
    ├── AddPersonModal.jsx       # ~150 LOC
    ├── EditPersonModal.jsx      # ~150 LOC
    └── AssignCompetencyModal.jsx # ~180 LOC
```

---

### Phase 4: Legacy Tool Migration (Weeks 5-8)

**Goal:** Migrate high-value legacy tools to React.

#### Priority Order

1. **data-hub.js** (3,983 LOC) - Most used, biggest impact
2. **admin-dashboard.js** (1,918 LOC) - Admin-only, good test case
3. **Others** - Evaluate case-by-case

#### 4.1 Data Hub Migration Strategy

**Current Architecture (Legacy):**
```javascript
// data-hub.js
let container, dom = {};
const HTML = `<div class="data-hub">...</div>`;

function render() {
    container.innerHTML = HTML;
    cacheDom();
    bindEvents();
}

export default { init, destroy };
```

**Target Architecture (React):**
```
src/pages/data-hub/
├── index.jsx                # Page container with tabs
├── hooks/
│   ├── useAssets.js        # React Query hook
│   ├── useVessels.js
│   └── useScans.js
├── AssetList.jsx           # Asset grid/list view
├── AssetDetail.jsx         # Single asset view
├── VesselList.jsx
├── VesselDetail.jsx
├── ScanList.jsx
├── ScanDetail.jsx
└── components/
    ├── AssetCard.jsx
    ├── VesselCard.jsx
    └── ScanCard.jsx
```

#### 4.2 Migration Approach

1. **Create React version alongside legacy** - Don't break existing functionality
2. **Feature flag for switching** - Allow gradual rollout
3. **Migrate view by view** - Assets first, then Vessels, then Scans
4. **Remove legacy after validation** - Only when React version is stable

---

### Phase 5: Cleanup & Optimization (Week 9)

**Goal:** Remove remaining tech debt and optimize performance.

#### 5.1 Remove Unused Code
- [ ] Delete `src/store/` if Redux remains unused
- [ ] Remove ToolContainer.jsx after all tools migrated
- [ ] Clean up unused services/managers
- [ ] Remove legacy CSS/styles

#### 5.2 Performance Optimization
- [ ] Add React.memo to expensive components
- [ ] Implement virtual scrolling for long lists
- [ ] Add pagination to data tables
- [ ] Optimize bundle size with code splitting

#### 5.3 TypeScript Migration
- [ ] Convert hooks to TypeScript first
- [ ] Add types for Supabase responses
- [ ] Convert UI components
- [ ] Convert pages last

---

## React Query Patterns

### Standard Query Hook Pattern
```javascript
// src/hooks/queries/useCompetencies.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { competencyService } from '../../services/competency-service';

// Query hook
export function useCompetencies(userId) {
    return useQuery({
        queryKey: ['competencies', userId],
        queryFn: () => competencyService.getUserCompetencies(userId),
        enabled: !!userId,
    });
}

// Mutation hook
export function useCreateCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => competencyService.createCompetency(data),
        onSuccess: (_, variables) => {
            // Invalidate related queries
            queryClient.invalidateQueries({
                queryKey: ['competencies', variables.userId]
            });
        },
    });
}

// Delete mutation
export function useDeleteCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => competencyService.deleteCompetency(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
        },
    });
}
```

### Query Keys Convention
```javascript
// Consistent query key structure
const queryKeys = {
    // User-related
    profile: (userId) => ['profile', userId],
    competencies: (userId) => ['competencies', userId],

    // Personnel
    personnel: {
        all: ['personnel'],
        list: (filters) => ['personnel', 'list', filters],
        detail: (id) => ['personnel', 'detail', id],
    },

    // Assets
    assets: {
        all: ['assets'],
        list: (filters) => ['assets', 'list', filters],
        detail: (id) => ['assets', 'detail', id],
        vessels: (assetId) => ['assets', assetId, 'vessels'],
    },
};
```

---

## Component Patterns

### Page Container Pattern
```javascript
// Standard page structure
export default function SomePage() {
    // 1. React Query hooks for data
    const { data, isLoading, error } = useData();

    // 2. Local UI state only
    const [modalOpen, setModalOpen] = useState(false);

    // 3. Early returns for loading/error
    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay error={error} />;

    // 4. Render with extracted components
    return (
        <div className="page-container">
            <PageHeader />
            <PageContent data={data} />
            <PageModals open={modalOpen} onClose={() => setModalOpen(false)} />
        </div>
    );
}
```

### Component Size Guidelines
| Component Type | Max Lines | Notes |
|---------------|-----------|-------|
| Page container | 100-150 | Just orchestration |
| Feature component | 150-250 | Single responsibility |
| UI component | 50-100 | Highly reusable |
| Modal | 100-150 | Form + actions |
| Hook | 50-100 | Single data concern |

---

## Success Metrics

### Code Quality
- [ ] No page component exceeds 300 lines
- [ ] All data fetching uses React Query
- [ ] No manual loading state management
- [ ] All forms use consistent patterns
- [ ] TypeScript coverage > 50%

### Performance
- [ ] Initial load time < 3s
- [ ] Time to interactive < 5s
- [ ] No unnecessary re-renders (React DevTools)
- [ ] Bundle size < 500KB (gzipped)

### Maintainability
- [ ] New developer can understand structure in < 1 hour
- [ ] Adding new feature follows clear pattern
- [ ] Changes localized (don't ripple across codebase)
- [ ] Tests can be written for isolated components

---

## Risk Mitigation

### Risk: Breaking Existing Functionality
**Mitigation:**
- Migrate incrementally, not all at once
- Keep legacy code working until replacement validated
- Feature flags for A/B testing new vs old

### Risk: Scope Creep
**Mitigation:**
- Strict phase boundaries
- Complete Phase N before starting Phase N+1
- Track progress in modernization-tasks.md

### Risk: Performance Regression
**Mitigation:**
- Profile before and after each migration
- Add performance monitoring
- Set performance budgets

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Foundation | Week 1 | React Query setup, dead code removal |
| 2. Components | Week 2 | UI component library |
| 3. Pages | Weeks 3-4 | Profile & Personnel migrated |
| 4. Tools | Weeks 5-8 | Data Hub & Admin migrated |
| 5. Cleanup | Week 9 | Tech debt eliminated |

**Total Estimated Effort:** 9 weeks

---

## Next Steps

1. Review and approve this plan
2. Begin Phase 1: Install React Query, remove dead code
3. Track progress in `dev-docs/modernization-tasks.md`
4. Weekly check-ins to assess progress and adjust

---

*Last Updated: 2025-11-27*
*Status: PENDING APPROVAL*
