# Phase 2 Context & Code Reference

**Purpose:** Quick reference for relevant code, patterns, and architecture needed during Phase 2 implementation

---

## Current File Sizes

| File | Lines | Status |
|------|-------|--------|
| `src/pages/PersonnelManagementPage.jsx` | 2,567 | **Too large - needs splitting** |
| `src/services/personnel-service.js` | ~200 | Needs TypeScript conversion |
| `src/services/competency-service.js` | ~150 | Needs TypeScript conversion |

---

## Type Definitions (Already Created in Phase 1)

### Location: `src/types/personnel.ts`

```typescript
export interface PersonnelWithCompetencies extends Profile {
  competencies: EmployeeCompetency[];
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  organizations?: Organization;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCompetency {
  id: string;
  user_id: string;
  competency_id: string;
  value: string | null;
  status: CompetencyStatus;
  expiry_date?: string;
  document_url?: string;
  document_name?: string;
  notes?: string;
  witness_checked?: boolean;
  witnessed_by?: string;
  witnessed_at?: string;
  witness_notes?: string;
  created_at: string;
  updated_at: string;
  competency_definitions?: CompetencyDefinition;
}

export type CompetencyStatus = 'active' | 'expired' | 'pending_approval' | 'rejected';
export type UserRole = 'admin' | 'org_admin' | 'editor' | 'viewer';

export interface CompetencyDefinition {
  id: string;
  name: string;
  description?: string;
  field_type: CompetencyFieldType;
  category_id?: string;
  requires_document: boolean;
  requires_approval: boolean;
  is_active: boolean;
  competency_categories?: CompetencyCategory;
}

export interface CompetencyCategory {
  id: string;
  name: string;
  description?: string;
}

export type CompetencyFieldType =
  | 'text'
  | 'date'
  | 'expiry_date'
  | 'boolean'
  | 'file'
  | 'number'
  | 'certification';
```

### Location: `src/types/common.ts`

```typescript
export interface SupabaseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FilterState {
  searchTerm: string;
  organization: string;
  role: string;
  status: string;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
}
```

---

## Current Data Fetching Pattern (Optimized in Phase 1)

### File: `src/services/personnel-service.js`

**Critical:** This is the optimized 2-query pattern that must be preserved!

```javascript
async function getAllPersonnelWithCompetencies() {
  try {
    // Query 1: Get all profiles with organizations
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*, organizations(id, name)')
      .order('username', { ascending: true });

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return [];
    }

    const userIds = profiles.map(p => p.id);

    // Query 2: Get all competencies for these users in ONE query
    const { data: allCompetencies, error: competenciesError } = await supabase
      .from('employee_competencies')
      .select(`
        id, value, expiry_date, status, document_url, document_name,
        notes, competency_id, user_id, created_at, issuing_body,
        certification_id, witness_checked, witnessed_by, witnessed_at,
        witness_notes,
        competency_definitions!inner(
          id, name, description, field_type, category_id,
          competency_categories(id, name, description)
        )
      `)
      .in('user_id', userIds);

    if (competenciesError) throw competenciesError;

    // Group competencies by user_id in JavaScript
    const competenciesByUser = {};
    (allCompetencies || []).forEach(comp => {
      if (!competenciesByUser[comp.user_id]) {
        competenciesByUser[comp.user_id] = [];
      }
      competenciesByUser[comp.user_id].push(comp);
    });

    // Attach competencies to profiles
    const personnelWithCompetencies = profiles.map(profile => ({
      ...profile,
      competencies: competenciesByUser[profile.id] || []
    }));

    return personnelWithCompetencies;
  } catch (error) {
    console.error('Error in getAllPersonnelWithCompetencies:', error);
    return [];
  }
}
```

**When migrating to TypeScript:**
```typescript
async function getAllPersonnelWithCompetencies(): Promise<PersonnelWithCompetencies[]> {
  try {
    // ... same logic
    return personnelWithCompetencies;
  } catch (error) {
    console.error('Error in getAllPersonnelWithCompetencies:', error);
    return [];
  }
}
```

---

## Component Structure Reference

### Current PersonnelManagementPage.jsx Structure

**Lines 1-100:** Imports and constants
**Lines 100-385:** State management and data loading
**Lines 385-1200:** Directory View rendering
**Lines 1200-1900:** Matrix View rendering
**Lines 1900-2100:** Expiring View rendering
**Lines 2100-2400:** Pending Approvals View rendering
**Lines 2400-2567:** Helper functions and exports

### Target Component Split

```
src/components/personnel/
├── DirectoryView.tsx          (lines 385-1200 extracted)
├── MatrixView.tsx             (lines 1200-1900 extracted)
├── ExpiringView.tsx           (lines 1900-2100 extracted)
├── PendingApprovalsView.tsx   (lines 2100-2400 extracted)
├── PersonnelFilters.tsx       (new - filter UI)
└── PersonnelStats.tsx         (new - statistics cards)

src/hooks/
├── usePersonnelData.ts        (data fetching logic)
├── usePersonnelFilters.ts     (filter logic)
└── usePersonnelSort.ts        (sorting logic)
```

---

## Toast & Confirmation Dialog Patterns (Phase 1)

### Toast Usage
```typescript
import toast from '@components/Toast';

// Success
toast.success('Competency updated successfully!');

// Error
toast.error('Failed to update competency');

// Promise handling
await toast.promise(
  saveCompetency(),
  {
    loading: 'Saving competency...',
    success: 'Competency saved!',
    error: 'Failed to save'
  }
);
```

### Confirmation Dialog Usage
```typescript
import confirmDialog from '@components/ConfirmDialog';

// Destructive action
const confirmed = await confirmDialog({
  title: 'Delete Competency?',
  message: 'This action cannot be undone.',
  confirmText: 'Delete',
  destructive: true
});

if (confirmed) {
  await deleteCompetency();
}
```

---

## Path Aliases (Configured in Vite)

```typescript
import toast from '@components/Toast';
import { PersonnelWithCompetencies } from '@types';
import personnelService from '@services/personnel-service';
import { usePersonnelData } from '@hooks/usePersonnelData';
```

**Available aliases:**
- `@` → `./src`
- `@components` → `./src/components`
- `@services` → `./src/services`
- `@hooks` → `./src/hooks`
- `@types` → `./src/types`
- `@utils` → `./src/utils`
- `@config` → `./src/config`
- `@store` → `./src/store`

---

## Custom Hook Pattern

### Example: usePersonnelData

```typescript
// src/hooks/usePersonnelData.ts
import { useState, useEffect, useCallback } from 'react';
import type { PersonnelWithCompetencies } from '@types';
import personnelService from '@services/personnel-service';

export function usePersonnelData() {
  const [personnel, setPersonnel] = useState<PersonnelWithCompetencies[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await personnelService.getAllPersonnelWithCompetencies();
      setPersonnel(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personnel');
      console.error('Error loading personnel:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    personnel,
    loading,
    error,
    refetch: loadData
  };
}
```

---

## Component Props Pattern

### Example: DirectoryView Props

```typescript
// src/components/personnel/DirectoryView.tsx
import type { PersonnelWithCompetencies } from '@types';

interface DirectoryViewProps {
  personnel: PersonnelWithCompetencies[];
  onRefresh: () => Promise<void>;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}

export function DirectoryView({
  personnel,
  onRefresh,
  searchTerm = '',
  onSearchChange
}: DirectoryViewProps) {
  // Component logic
}
```

---

## Pagination Implementation Reference

```typescript
// Pagination hook
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 25
) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, currentPage, itemsPerPage]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // Reset to page 1 when items change
  useEffect(() => {
    setCurrentPage(1);
  }, [items.length]);

  return {
    currentPage,
    totalPages,
    paginatedItems,
    goToPage,
    nextPage,
    prevPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1
  };
}
```

---

## Supabase Query Patterns with TypeScript

```typescript
// Read with types
const { data, error } = await supabase
  .from('employee_competencies')
  .select<'*', EmployeeCompetency>('*')
  .eq('user_id', userId);

// Insert with types
const { data, error } = await supabase
  .from('employee_competencies')
  .insert<EmployeeCompetency>([competencyData])
  .select()
  .single();

// Update with types
const { data, error } = await supabase
  .from('employee_competencies')
  .update<Partial<EmployeeCompetency>>(updates)
  .eq('id', id)
  .select()
  .single();
```

---

## Error Handling Pattern

```typescript
async function updateCompetency(
  id: string,
  updates: Partial<EmployeeCompetency>
): Promise<SupabaseResponse<EmployeeCompetency>> {
  try {
    const { data, error } = await supabase
      .from('employee_competencies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    console.error('Error updating competency:', error);
    return { success: false, error: message };
  }
}
```

---

## Key Files to Reference During Implementation

1. **[src/types/personnel.ts](src/types/personnel.ts)** - All type definitions
2. **[src/types/common.ts](src/types/common.ts)** - Shared types
3. **[src/services/personnel-service.js](src/services/personnel-service.js)** - Data fetching patterns
4. **[src/components/Toast.jsx](src/components/Toast.jsx)** - Notification API
5. **[src/components/ConfirmDialog.jsx](src/components/ConfirmDialog.jsx)** - Confirmation API
6. **[vite.config.js](vite.config.js)** - Path aliases configuration
7. **[tsconfig.json](tsconfig.json)** - TypeScript configuration

---

## Important Conventions to Maintain

1. **Always use `onRefresh` callback pattern** for data updates
2. **Preserve 2-query optimization** from Phase 1
3. **Use path aliases** for imports
4. **Use toast** for notifications (never alert)
5. **Use confirmDialog** for destructive actions
6. **Include proper TypeScript types** for all functions
7. **Handle loading and error states** consistently
8. **Use ContentLoader** for loading states
9. **Use EmptyData** for empty states

---

**Last Updated:** 2025-11-11
**For:** Phase 2 Implementation
