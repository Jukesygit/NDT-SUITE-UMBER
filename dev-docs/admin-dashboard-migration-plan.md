# Admin Dashboard Migration Plan

## Overview

**Current State:** 1,919-line legacy JavaScript module at `src/tools/admin-dashboard.js`
**Target State:** Modern React page with React Query, TypeScript, and shared UI components

**Estimated Effort:** 3-4 days
**Priority:** High (admin functionality is critical)

---

## Goals

1. **Replace legacy `init/destroy` pattern** with React components
2. **Implement React Query** for all data fetching with proper caching
3. **Eliminate `prompt()`/`alert()`** - use proper modal components
4. **Use existing UI components** (DataTable, Modal, Form, etc.)
5. **Add pagination, search, and sorting** to all tables
6. **Split into focused components** (max 300 LOC each)
7. **Add TypeScript** for type safety

---

## Target Architecture

### File Structure

```
src/
├── pages/
│   └── admin/
│       ├── index.tsx                    # Main page container (~120 LOC)
│       ├── AdminPage.tsx                # Page with tabs (~100 LOC)
│       │
│       ├── tabs/
│       │   ├── OverviewTab.tsx          # Dashboard stats (~150 LOC)
│       │   ├── OrganizationsTab.tsx     # Org management (~200 LOC)
│       │   ├── UsersTab.tsx             # User management (~200 LOC)
│       │   ├── AssetsTab.tsx            # Asset transfers (~200 LOC)
│       │   ├── RequestsTab.tsx          # Account/permission requests (~200 LOC)
│       │   ├── SharingTab.tsx           # Asset sharing (~200 LOC)
│       │   └── ConfigurationTab.tsx     # Report field config (~200 LOC)
│       │
│       ├── components/
│       │   ├── StatCard.tsx             # Stat display card (~40 LOC)
│       │   ├── OrganizationCard.tsx     # Org card with menu (~80 LOC)
│       │   ├── RequestCard.tsx          # Request approval card (~100 LOC)
│       │   ├── ShareCard.tsx            # Active share display (~80 LOC)
│       │   ├── ConfigListEditor.tsx     # Editable config list (~150 LOC)
│       │   └── StatusBadge.tsx          # Role/status badges (~50 LOC)
│       │
│       └── modals/
│           ├── CreateUserModal.tsx      # New user form (~150 LOC)
│           ├── EditUserModal.tsx        # Edit user form (~120 LOC)
│           ├── CreateOrganizationModal.tsx  # New org form (~100 LOC)
│           ├── TransferAssetModal.tsx   # Single/bulk transfer (~120 LOC)
│           ├── CreateShareModal.tsx     # Share asset wizard (~180 LOC)
│           └── EditShareModal.tsx       # Update share permissions (~100 LOC)
│
├── hooks/
│   ├── queries/
│   │   ├── useAdminStats.ts             # Overview statistics
│   │   ├── useOrganizations.ts          # Organization list
│   │   ├── useAdminUsers.ts             # All users (admin view)
│   │   ├── useAccountRequests.ts        # Pending account requests
│   │   ├── usePermissionRequests.ts     # Pending permission requests
│   │   ├── useAdminAssets.ts            # All assets (admin view)
│   │   ├── useAssetShares.ts            # Active shares
│   │   ├── useAccessRequests.ts         # Pending access requests
│   │   └── useAdminConfig.ts            # Report field configuration
│   │
│   └── mutations/
│       ├── useOrganizationMutations.ts  # Create/update/delete org
│       ├── useUserMutations.ts          # Create/update/delete user
│       ├── useRequestMutations.ts       # Approve/reject requests
│       ├── useAssetTransferMutations.ts # Transfer assets
│       ├── useShareMutations.ts         # Create/update/delete shares
│       └── useConfigMutations.ts        # Update config lists
│
├── services/
│   └── admin-service.ts                 # Admin API layer (~300 LOC)
│
└── types/
    └── admin.ts                         # Admin-specific types
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        AdminPage.tsx                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Tab Navigation                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────┬──────────┬────┴────┬──────────┬──────────┐       │
│  │ Overview │   Orgs   │  Users  │ Requests │  Config  │       │
│  └────┬─────┴────┬─────┴────┬────┴────┬─────┴────┬─────┘       │
│       │          │          │         │          │              │
│       ▼          ▼          ▼         ▼          ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              React Query Hooks Layer                     │   │
│  │  useAdminStats, useOrganizations, useAdminUsers, etc.   │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────┴──────────────────────────────┐   │
│  │                   admin-service.ts                        │   │
│  │  Centralized API calls with proper error handling        │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────┴──────────────────────────────┐   │
│  │                   Supabase Client                         │   │
│  │              (with RLS policies enforced)                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1 Morning)

**Goal:** Set up the page structure, types, and service layer.

#### 1.1 Create TypeScript Types

**File:** `src/types/admin.ts`

```typescript
// Organization types
export interface Organization {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface OrganizationStats extends Organization {
    userCount: number;
    assetCount: number;
    scanCount: number;
}

// User types
export interface AdminUser {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'org_admin' | 'editor' | 'viewer';
    organization_id: string;
    organizations?: { name: string };
    is_active: boolean;
    created_at: string;
}

export interface CreateUserData {
    username: string;
    email: string;
    password: string;
    organization_id: string;
    role: 'org_admin' | 'editor' | 'viewer';
}

// Request types
export interface AccountRequest {
    id: string;
    username: string;
    email: string;
    organization_id: string;
    requested_role: string;
    message?: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    organizations?: { name: string };
}

export interface PermissionRequest {
    id: string;
    user_id: string;
    user_current_role: string;
    requested_role: string;
    message?: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    profiles?: {
        username: string;
        email: string;
        organizations?: { name: string };
    };
}

// Asset types
export interface AdminAsset {
    id: string;
    name: string;
    organization_id: string;
    vessels?: { id: string; name: string }[];
    created_at: string;
}

// Share types
export interface AssetShare {
    id: string;
    asset_id: string;
    vessel_id?: string;
    scan_id?: string;
    share_type: 'asset' | 'vessel' | 'scan';
    owner_organization_id: string;
    shared_with_organization_id: string;
    permission: 'view' | 'edit';
    created_at: string;
    owner_org?: { name: string };
    shared_with_org?: { name: string };
}

export interface AccessRequest {
    request_id: string;
    user_id: string;
    username: string;
    user_email: string;
    user_org_name: string;
    asset_id: string;
    vessel_id?: string;
    scan_id?: string;
    requested_permission: 'view' | 'edit';
    message?: string;
    created_at: string;
}

// Config types
export interface AdminConfig {
    procedureNumbers: string[];
    equipmentModels: string[];
    probes: string[];
    calibrationBlocks: string[];
    couplants: string[];
    scannerFrames: string[];
    coatingTypes: string[];
    materials: string[];
    acceptanceCriteria: string[];
    clients: string[];
    locations: string[];
}

export type ConfigListName = keyof AdminConfig;

export interface ConfigListMetadata {
    label: string;
    icon: string;
}

// Stats types
export interface AdminDashboardStats {
    organizationCount: number;
    userCount: number;
    assetCount: number;
    pendingRequestCount: number;
    organizations: OrganizationStats[];
    recentUsers: AdminUser[];
}
```

#### 1.2 Create Admin Service

**File:** `src/services/admin-service.ts`

```typescript
import supabase from '../supabase-client';
import authManager from '../auth-manager';
import dataManager from '../data-manager';
import sharingManager from '../sharing-manager';
import adminConfig from '../admin-config';
import type {
    Organization,
    OrganizationStats,
    AdminUser,
    CreateUserData,
    AccountRequest,
    PermissionRequest,
    AdminAsset,
    AssetShare,
    AccessRequest,
    AdminConfig,
    AdminDashboardStats,
    ConfigListName,
} from '../types/admin';

class AdminService {
    // ============ STATS ============
    async getDashboardStats(): Promise<AdminDashboardStats> {
        const [orgStats, users, pendingRequests] = await Promise.all([
            dataManager.getAllOrganizationStats(),
            authManager.getUsers(),
            authManager.getPendingAccountRequests(),
        ]);

        return {
            organizationCount: orgStats.length,
            userCount: users.length,
            assetCount: orgStats.reduce((sum, org) => sum + org.totalAssets, 0),
            pendingRequestCount: pendingRequests.length,
            organizations: orgStats,
            recentUsers: users.slice(-5).reverse(),
        };
    }

    // ============ ORGANIZATIONS ============
    async getOrganizations(): Promise<Organization[]> {
        const orgs = await authManager.getOrganizations();
        return orgs.filter(org => org.name !== 'SYSTEM');
    }

    async createOrganization(name: string): Promise<{ success: boolean; error?: string }> {
        return authManager.createOrganization(name.trim());
    }

    async updateOrganization(id: string, data: Partial<Organization>): Promise<{ success: boolean; error?: string }> {
        return authManager.updateOrganization(id, data);
    }

    async deleteOrganization(id: string): Promise<{ success: boolean; error?: string }> {
        return authManager.deleteOrganization(id);
    }

    // ============ USERS ============
    async getUsers(): Promise<AdminUser[]> {
        return authManager.getUsers();
    }

    async getUser(id: string): Promise<AdminUser | null> {
        return authManager.getUser(id);
    }

    async createUser(data: CreateUserData): Promise<{ success: boolean; error?: string }> {
        return authManager.createUser({
            username: data.username.trim(),
            email: data.email.trim(),
            password: data.password,
            organizationId: data.organization_id,
            role: data.role,
        });
    }

    async updateUser(id: string, data: Partial<AdminUser>): Promise<{ success: boolean; error?: string }> {
        return authManager.updateUser(id, data);
    }

    async deleteUser(id: string): Promise<{ success: boolean; error?: string }> {
        return authManager.deleteUser(id);
    }

    // ============ ACCOUNT REQUESTS ============
    async getAccountRequests(): Promise<AccountRequest[]> {
        return authManager.getPendingAccountRequests();
    }

    async approveAccountRequest(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
        return authManager.approveAccountRequest(id);
    }

    async rejectAccountRequest(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
        return authManager.rejectAccountRequest(id, reason || '');
    }

    // ============ PERMISSION REQUESTS ============
    async getPermissionRequests(): Promise<PermissionRequest[]> {
        if (!authManager.isUsingSupabase()) return [];

        const { data, error } = await supabase
            .from('permission_requests')
            .select('*, profiles!user_id(username, email, organizations(name))')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async approvePermissionRequest(id: string): Promise<{ success: boolean; error?: string }> {
        const { error } = await supabase.rpc('approve_permission_request', { request_id: id });
        if (error) return { success: false, error: error.message };
        return { success: true };
    }

    async rejectPermissionRequest(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
        const { error } = await supabase.rpc('reject_permission_request', {
            request_id: id,
            reason: reason || null,
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
    }

    // ============ ASSETS ============
    async getAssets(): Promise<AdminAsset[]> {
        return dataManager.getAssets();
    }

    async transferAsset(assetId: string, targetOrgId: string): Promise<void> {
        await dataManager.transferAsset(assetId, targetOrgId);
    }

    async bulkTransferAssets(
        assetIds: string[],
        targetOrgId: string
    ): Promise<{ success: string[]; failed: { assetId: string; error: string }[] }> {
        return dataManager.bulkTransferAssets(assetIds, targetOrgId);
    }

    // ============ SHARING ============
    async getShares(): Promise<AssetShare[]> {
        return sharingManager.getAllShares();
    }

    async getAccessRequests(): Promise<AccessRequest[]> {
        return sharingManager.getPendingAccessRequests();
    }

    async createShare(data: {
        assetId: string;
        vesselId?: string;
        scanId?: string;
        sharedWithOrganizationId: string;
        permission: 'view' | 'edit';
    }): Promise<{ success: boolean; error?: string }> {
        return sharingManager.shareAsset(data);
    }

    async updateShare(id: string, permission: 'view' | 'edit'): Promise<{ success: boolean; error?: string }> {
        return sharingManager.updateSharePermission(id, permission);
    }

    async deleteShare(id: string): Promise<{ success: boolean; error?: string }> {
        return sharingManager.removeShare(id);
    }

    async approveAccessRequest(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
        return sharingManager.approveAccessRequest(id);
    }

    async rejectAccessRequest(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
        return sharingManager.rejectAccessRequest(id, reason || '');
    }

    // ============ CONFIGURATION ============
    async getConfig(): Promise<AdminConfig> {
        await adminConfig.ensureInitialized();
        return adminConfig.getAllConfig();
    }

    getConfigMetadata(): Record<ConfigListName, { label: string; icon: string }> {
        return adminConfig.getListMetadata();
    }

    async addConfigItem(listName: ConfigListName, item: string): Promise<{ success: boolean; error?: string }> {
        return adminConfig.addItem(listName, item);
    }

    async updateConfigItem(
        listName: ConfigListName,
        oldItem: string,
        newItem: string
    ): Promise<{ success: boolean; error?: string }> {
        return adminConfig.updateItem(listName, oldItem, newItem);
    }

    async removeConfigItem(listName: ConfigListName, item: string): Promise<{ success: boolean; error?: string }> {
        return adminConfig.removeItem(listName, item);
    }

    async resetConfigList(listName: ConfigListName): Promise<{ success: boolean; error?: string }> {
        return adminConfig.resetList(listName);
    }

    async resetAllConfig(): Promise<{ success: boolean; error?: string }> {
        return adminConfig.resetAllToDefaults();
    }

    exportConfig(): string {
        return adminConfig.exportConfig();
    }

    async importConfig(jsonString: string): Promise<{ success: boolean; error?: string }> {
        return adminConfig.importConfig(jsonString);
    }
}

export const adminService = new AdminService();
export default adminService;
```

#### 1.3 Create Page Shell

**File:** `src/pages/admin/index.tsx`

```typescript
import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '../../components/ui';
import ErrorBoundary from '../../components/ErrorBoundary';

const AdminPage = lazy(() => import('./AdminPage'));

export default function AdminPageWrapper() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner fullScreen message="Loading admin dashboard..." />}>
                <AdminPage />
            </Suspense>
        </ErrorBoundary>
    );
}
```

---

### Phase 2: Query Hooks (Day 1 Afternoon)

**Goal:** Create all React Query hooks for data fetching and mutations.

#### 2.1 Query Hooks

**File:** `src/hooks/queries/useAdminStats.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAdminStats() {
    return useQuery({
        queryKey: ['admin', 'stats'],
        queryFn: () => adminService.getDashboardStats(),
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}
```

**File:** `src/hooks/queries/useOrganizations.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useOrganizations() {
    return useQuery({
        queryKey: ['admin', 'organizations'],
        queryFn: () => adminService.getOrganizations(),
        staleTime: 5 * 60 * 1000,
    });
}
```

**File:** `src/hooks/queries/useAdminUsers.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAdminUsers() {
    return useQuery({
        queryKey: ['admin', 'users'],
        queryFn: () => adminService.getUsers(),
        staleTime: 2 * 60 * 1000,
    });
}
```

**File:** `src/hooks/queries/useAccountRequests.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAccountRequests() {
    return useQuery({
        queryKey: ['admin', 'accountRequests'],
        queryFn: () => adminService.getAccountRequests(),
        staleTime: 30 * 1000, // 30 seconds - requests are time-sensitive
    });
}

export function usePermissionRequests() {
    return useQuery({
        queryKey: ['admin', 'permissionRequests'],
        queryFn: () => adminService.getPermissionRequests(),
        staleTime: 30 * 1000,
    });
}
```

**File:** `src/hooks/queries/useAdminAssets.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAdminAssets() {
    return useQuery({
        queryKey: ['admin', 'assets'],
        queryFn: () => adminService.getAssets(),
        staleTime: 5 * 60 * 1000,
    });
}
```

**File:** `src/hooks/queries/useAssetShares.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAssetShares() {
    return useQuery({
        queryKey: ['admin', 'shares'],
        queryFn: () => adminService.getShares(),
        staleTime: 2 * 60 * 1000,
    });
}

export function useAccessRequests() {
    return useQuery({
        queryKey: ['admin', 'accessRequests'],
        queryFn: () => adminService.getAccessRequests(),
        staleTime: 30 * 1000,
    });
}
```

**File:** `src/hooks/queries/useAdminConfig.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useAdminConfig() {
    return useQuery({
        queryKey: ['admin', 'config'],
        queryFn: () => adminService.getConfig(),
        staleTime: 10 * 60 * 1000, // Config changes infrequently
    });
}

export function useConfigMetadata() {
    // This is synchronous, but we wrap it for consistency
    return adminService.getConfigMetadata();
}
```

#### 2.2 Mutation Hooks

**File:** `src/hooks/mutations/useOrganizationMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useCreateOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (name: string) => adminService.createOrganization(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useUpdateOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
            adminService.updateOrganization(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useDeleteOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.deleteOrganization(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
    });
}
```

**File:** `src/hooks/mutations/useUserMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { CreateUserData, AdminUser } from '../../types/admin';

export function useCreateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateUserData) => adminService.createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useUpdateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AdminUser> }) =>
            adminService.updateUser(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
}

export function useDeleteUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}
```

**File:** `src/hooks/mutations/useRequestMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useApproveAccountRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.approveAccountRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accountRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useRejectAccountRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            adminService.rejectAccountRequest(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accountRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useApprovePermissionRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.approvePermissionRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'permissionRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
}

export function useRejectPermissionRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            adminService.rejectPermissionRequest(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'permissionRequests'] });
        },
    });
}
```

**File:** `src/hooks/mutations/useAssetTransferMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useTransferAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ assetId, targetOrgId }: { assetId: string; targetOrgId: string }) =>
            adminService.transferAsset(assetId, targetOrgId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

export function useBulkTransferAssets() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ assetIds, targetOrgId }: { assetIds: string[]; targetOrgId: string }) =>
            adminService.bulkTransferAssets(assetIds, targetOrgId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}
```

**File:** `src/hooks/mutations/useShareMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

export function useCreateShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            assetId: string;
            vesselId?: string;
            scanId?: string;
            sharedWithOrganizationId: string;
            permission: 'view' | 'edit';
        }) => adminService.createShare(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

export function useUpdateShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, permission }: { id: string; permission: 'view' | 'edit' }) =>
            adminService.updateShare(id, permission),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

export function useDeleteShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.deleteShare(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

export function useApproveAccessRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => adminService.approveAccessRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accessRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

export function useRejectAccessRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            adminService.rejectAccessRequest(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accessRequests'] });
        },
    });
}
```

**File:** `src/hooks/mutations/useConfigMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ConfigListName } from '../../types/admin';

export function useAddConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ listName, item }: { listName: ConfigListName; item: string }) =>
            adminService.addConfigItem(listName, item),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

export function useUpdateConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            listName,
            oldItem,
            newItem,
        }: {
            listName: ConfigListName;
            oldItem: string;
            newItem: string;
        }) => adminService.updateConfigItem(listName, oldItem, newItem),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

export function useRemoveConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ listName, item }: { listName: ConfigListName; item: string }) =>
            adminService.removeConfigItem(listName, item),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

export function useResetConfigList() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (listName: ConfigListName) => adminService.resetConfigList(listName),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

export function useResetAllConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => adminService.resetAllConfig(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

export function useImportConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (jsonString: string) => adminService.importConfig(jsonString),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}
```

---

### Phase 3: Shared Components (Day 2 Morning)

**Goal:** Create reusable components specific to admin dashboard.

#### 3.1 StatusBadge Component

**File:** `src/pages/admin/components/StatusBadge.tsx`

```typescript
import { cn } from '../../../lib/utils';

type BadgeVariant = 'admin' | 'org_admin' | 'editor' | 'viewer' | 'active' | 'inactive' | 'pending' | 'view' | 'edit' | 'asset' | 'vessel' | 'scan';

interface StatusBadgeProps {
    variant: BadgeVariant;
    children?: React.ReactNode;
    className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
    admin: 'bg-purple-500/15 text-purple-400',
    org_admin: 'bg-blue-500/15 text-blue-400',
    editor: 'bg-green-500/15 text-green-400',
    viewer: 'bg-gray-500/15 text-gray-400',
    active: 'bg-green-500/15 text-green-400',
    inactive: 'bg-gray-500/15 text-gray-500',
    pending: 'bg-yellow-500/15 text-yellow-400',
    view: 'bg-gray-500/15 text-gray-400',
    edit: 'bg-yellow-500/15 text-yellow-400',
    asset: 'bg-blue-500/15 text-blue-400',
    vessel: 'bg-green-500/15 text-green-400',
    scan: 'bg-purple-500/15 text-purple-400',
};

const variantLabels: Record<BadgeVariant, string> = {
    admin: 'Admin',
    org_admin: 'Org Admin',
    editor: 'Editor',
    viewer: 'Viewer',
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    view: 'View',
    edit: 'Edit',
    asset: 'Asset',
    vessel: 'Vessel',
    scan: 'Scan',
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                variantStyles[variant],
                className
            )}
        >
            {children || variantLabels[variant]}
        </span>
    );
}
```

#### 3.2 StatCard Component

**File:** `src/pages/admin/components/StatCard.tsx`

```typescript
interface StatCardProps {
    label: string;
    value: number | string;
    icon?: React.ReactNode;
    trend?: {
        value: number;
        isPositive: boolean;
    };
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
                {icon && <div className="text-gray-400">{icon}</div>}
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {trend && (
                <div
                    className={cn(
                        'text-sm mt-1',
                        trend.isPositive ? 'text-green-500' : 'text-red-500'
                    )}
                >
                    {trend.isPositive ? '+' : ''}{trend.value}%
                </div>
            )}
        </div>
    );
}
```

#### 3.3 RequestCard Component

**File:** `src/pages/admin/components/RequestCard.tsx`

```typescript
import { StatusBadge } from './StatusBadge';
import type { AccountRequest, PermissionRequest } from '../../../types/admin';

interface RequestCardProps {
    request: AccountRequest | PermissionRequest;
    type: 'account' | 'permission';
    onApprove: () => void;
    onReject: () => void;
    isApproving?: boolean;
    isRejecting?: boolean;
}

export function RequestCard({
    request,
    type,
    onApprove,
    onReject,
    isApproving,
    isRejecting,
}: RequestCardProps) {
    const isPermission = type === 'permission';
    const permReq = request as PermissionRequest;
    const accReq = request as AccountRequest;

    const username = isPermission ? permReq.profiles?.username : accReq.username;
    const email = isPermission ? permReq.profiles?.email : accReq.email;
    const orgName = isPermission
        ? permReq.profiles?.organizations?.name
        : accReq.organizations?.name;
    const message = request.message;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-start">
                <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {username || 'Unknown'}
                        </h3>
                        {isPermission ? (
                            <StatusBadge variant="pending">
                                {permReq.user_current_role} → {permReq.requested_role}
                            </StatusBadge>
                        ) : (
                            <StatusBadge variant={accReq.requested_role as any}>
                                {accReq.requested_role}
                            </StatusBadge>
                        )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <div>Email: {email || 'Unknown'}</div>
                        <div>Organization: {orgName || 'Unknown'}</div>
                        <div>Requested: {new Date(request.created_at).toLocaleString()}</div>
                        {message && (
                            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded italic">
                                "{message}"
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 ml-4">
                    <button
                        onClick={onApprove}
                        disabled={isApproving || isRejecting}
                        className="px-4 py-2 rounded-lg text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isApproving ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                        onClick={onReject}
                        disabled={isApproving || isRejecting}
                        className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isRejecting ? 'Rejecting...' : 'Reject'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

---

### Phase 4: Tab Components (Day 2 Afternoon - Day 3)

**Goal:** Build each tab as a focused component.

#### 4.1 Main AdminPage with Tabs

**File:** `src/pages/admin/AdminPage.tsx`

```typescript
import { useState } from 'react';
import { createModernHeader } from '../../components/modern-header';
import { useAccountRequests, usePermissionRequests } from '../../hooks/queries/useAccountRequests';
import { cn } from '../../lib/utils';

// Lazy load tabs for code splitting
import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '../../components/ui';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const OrganizationsTab = lazy(() => import('./tabs/OrganizationsTab'));
const UsersTab = lazy(() => import('./tabs/UsersTab'));
const AssetsTab = lazy(() => import('./tabs/AssetsTab'));
const RequestsTab = lazy(() => import('./tabs/RequestsTab'));
const SharingTab = lazy(() => import('./tabs/SharingTab'));
const ConfigurationTab = lazy(() => import('./tabs/ConfigurationTab'));

type TabId = 'overview' | 'organizations' | 'users' | 'assets' | 'requests' | 'sharing' | 'configuration';

interface Tab {
    id: TabId;
    label: string;
    badge?: number;
}

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    // Fetch request counts for badge
    const { data: accountRequests } = useAccountRequests();
    const { data: permissionRequests } = usePermissionRequests();
    const pendingCount = (accountRequests?.length || 0) + (permissionRequests?.length || 0);

    const tabs: Tab[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'organizations', label: 'Organizations' },
        { id: 'users', label: 'Users' },
        { id: 'assets', label: 'Assets' },
        { id: 'requests', label: 'Account Requests', badge: pendingCount || undefined },
        { id: 'sharing', label: 'Asset Sharing' },
        { id: 'configuration', label: 'Configuration' },
    ];

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab />;
            case 'organizations':
                return <OrganizationsTab />;
            case 'users':
                return <UsersTab />;
            case 'assets':
                return <AssetsTab />;
            case 'requests':
                return <RequestsTab />;
            case 'sharing':
                return <SharingTab />;
            case 'configuration':
                return <ConfigurationTab />;
            default:
                return <OverviewTab />;
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-8">
                    <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                    <p className="text-purple-100 mt-1">
                        Manage users, organizations, and permissions across the platform
                    </p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex px-6 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                                activeTab === tab.id
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            )}
                        >
                            {tab.label}
                            {tab.badge && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-500 text-white">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-grow overflow-y-auto p-6">
                <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                    {renderTab()}
                </Suspense>
            </div>
        </div>
    );
}
```

#### 4.2 OverviewTab

**File:** `src/pages/admin/tabs/OverviewTab.tsx`

```typescript
import { useAdminStats } from '../../../hooks/queries/useAdminStats';
import { LoadingSpinner, ErrorDisplay } from '../../../components/ui';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';

export default function OverviewTab() {
    const { data: stats, isLoading, error } = useAdminStats();

    if (isLoading) return <LoadingSpinner message="Loading dashboard..." />;
    if (error) return <ErrorDisplay error={error} />;
    if (!stats) return null;

    return (
        <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Organizations" value={stats.organizationCount} />
                <StatCard label="Total Users" value={stats.userCount} />
                <StatCard label="Total Assets" value={stats.assetCount} />
                <StatCard label="Pending Requests" value={stats.pendingRequestCount} />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Organizations List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Organizations
                        </h2>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {stats.organizations.map((org) => (
                                <div
                                    key={org.organizationId}
                                    className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded"
                                >
                                    <div>
                                        <div className="font-semibold text-gray-900 dark:text-white">
                                            {org.organizationName}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {org.totalAssets} assets, {org.totalScans} scans
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Recent Users */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Recent Users
                        </h2>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {stats.recentUsers.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded"
                                >
                                    <div>
                                        <div className="font-semibold text-gray-900 dark:text-white">
                                            {user.username}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {user.organizations?.name || 'Unknown'} - {user.role}
                                        </div>
                                    </div>
                                    <StatusBadge variant={user.is_active ? 'active' : 'inactive'} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

#### 4.3 UsersTab (Example with DataTable)

**File:** `src/pages/admin/tabs/UsersTab.tsx`

```typescript
import { useState, useMemo } from 'react';
import { useAdminUsers } from '../../../hooks/queries/useAdminUsers';
import { useDeleteUser } from '../../../hooks/mutations/useUserMutations';
import { DataTable } from '../../../components/ui/DataTable';
import { LoadingSpinner, ErrorDisplay } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ui/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { CreateUserModal } from '../modals/CreateUserModal';
import { EditUserModal } from '../modals/EditUserModal';
import type { AdminUser } from '../../../types/admin';
import type { Column } from '../../../components/ui/DataTable/DataTable';

export default function UsersTab() {
    const { data: users, isLoading, error } = useAdminUsers();
    const deleteUser = useDeleteUser();

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const columns: Column<AdminUser>[] = useMemo(() => [
        {
            key: 'username',
            header: 'User',
            sortable: true,
            render: (user) => (
                <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                        {user.username}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {user.email}
                    </div>
                </div>
            ),
        },
        {
            key: 'organization',
            header: 'Organization',
            sortable: true,
            render: (user) => user.organizations?.name || 'Unknown',
        },
        {
            key: 'role',
            header: 'Role',
            sortable: true,
            render: (user) => <StatusBadge variant={user.role} />,
        },
        {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (user) => (
                <StatusBadge variant={user.is_active ? 'active' : 'inactive'} />
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (user) => (
                <div className="flex gap-2">
                    <button
                        onClick={() => setEditingUser(user)}
                        className="text-purple-600 hover:text-purple-800 text-sm"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => setDeletingUser(user)}
                        className="text-red-600 hover:text-red-800 text-sm"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ], []);

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        if (!searchQuery) return users;

        const query = searchQuery.toLowerCase();
        return users.filter(
            (user) =>
                user.username.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query) ||
                user.organizations?.name?.toLowerCase().includes(query)
        );
    }, [users, searchQuery]);

    const handleDelete = async () => {
        if (!deletingUser) return;

        const result = await deleteUser.mutateAsync(deletingUser.id);
        if (result.success) {
            setDeletingUser(null);
        }
    };

    if (isLoading) return <LoadingSpinner message="Loading users..." />;
    if (error) return <ErrorDisplay error={error} />;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h2>
                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                    + New User
                </button>
            </div>

            {/* Search */}
            <div className="flex gap-4">
                <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
            </div>

            {/* Table */}
            <DataTable
                columns={columns}
                data={filteredUsers}
                pageSize={25}
                emptyMessage="No users found"
            />

            {/* Modals */}
            <CreateUserModal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
            />

            {editingUser && (
                <EditUserModal
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                    user={editingUser}
                />
            )}

            <ConfirmDialog
                isOpen={!!deletingUser}
                onClose={() => setDeletingUser(null)}
                onConfirm={handleDelete}
                title="Delete User"
                message={`Are you sure you want to delete "${deletingUser?.username}"? This cannot be undone.`}
                confirmLabel="Delete"
                confirmVariant="danger"
                isLoading={deleteUser.isPending}
            />
        </div>
    );
}
```

---

### Phase 5: Modals (Day 3)

**Goal:** Build proper modal forms to replace `prompt()` dialogs.

#### 5.1 CreateUserModal

**File:** `src/pages/admin/modals/CreateUserModal.tsx`

```typescript
import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { FormField, FormSelect } from '../../../components/ui/Form';
import { useOrganizations } from '../../../hooks/queries/useOrganizations';
import { useCreateUser } from '../../../hooks/mutations/useUserMutations';
import type { CreateUserData } from '../../../types/admin';

interface CreateUserModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ROLES = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
    { value: 'org_admin', label: 'Organization Admin' },
];

export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
    const { data: organizations } = useOrganizations();
    const createUser = useCreateUser();

    const [formData, setFormData] = useState<CreateUserData>({
        username: '',
        email: '',
        password: '',
        organization_id: '',
        role: 'viewer',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.username.trim()) {
            newErrors.username = 'Username is required';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }
        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters';
        }
        if (!formData.organization_id) {
            newErrors.organization_id = 'Organization is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) return;

        const result = await createUser.mutateAsync(formData);

        if (result.success) {
            setFormData({
                username: '',
                email: '',
                password: '',
                organization_id: '',
                role: 'viewer',
            });
            onClose();
        } else {
            setErrors({ submit: result.error || 'Failed to create user' });
        }
    };

    const handleChange = (field: keyof CreateUserData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Create New User"
            size="medium"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <FormField
                    label="Username"
                    name="username"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    error={errors.username}
                    required
                />

                <FormField
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    error={errors.email}
                    required
                />

                <FormField
                    label="Password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    error={errors.password}
                    required
                />

                <FormSelect
                    label="Organization"
                    name="organization_id"
                    value={formData.organization_id}
                    onChange={(e) => handleChange('organization_id', e.target.value)}
                    error={errors.organization_id}
                    required
                    options={[
                        { value: '', label: 'Select an organization...' },
                        ...(organizations?.map((org) => ({
                            value: org.id,
                            label: org.name,
                        })) || []),
                    ]}
                />

                <FormSelect
                    label="Role"
                    name="role"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value as any)}
                    options={ROLES}
                />

                {errors.submit && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={createUser.isPending}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {createUser.isPending ? 'Creating...' : 'Create User'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
```

---

### Phase 6: Integration & Routing (Day 4 Morning)

**Goal:** Wire up the new admin page and update routing.

#### 6.1 Update App Routing

In your `App.jsx` or routing configuration, add:

```typescript
import { lazy } from 'react';

const AdminPage = lazy(() => import('./pages/admin'));

// In your routes:
<Route path="/admin" element={<AdminPage />} />
```

#### 6.2 Update Navigation

Update sidebar/navigation to point to the new admin route instead of the legacy tool.

---

### Phase 7: Cleanup (Day 4 Afternoon)

**Goal:** Remove legacy code and verify everything works.

#### 7.1 Removal Checklist

- [ ] Remove `src/tools/admin-dashboard.js`
- [ ] Remove admin-dashboard imports from ToolContainer
- [ ] Update any references to legacy admin tool
- [ ] Remove unused admin-related code from other managers

#### 7.2 Testing Checklist

- [ ] Overview tab loads with stats
- [ ] Organizations CRUD works
- [ ] Users CRUD works with proper modals
- [ ] Account requests approve/reject works
- [ ] Permission requests approve/reject works
- [ ] Asset transfers (single and bulk) work
- [ ] Sharing create/edit/delete works
- [ ] Configuration list editing works
- [ ] Export/import configuration works
- [ ] All loading states display correctly
- [ ] All error states display correctly
- [ ] Pagination works on tables
- [ ] Search/filter works on tables
- [ ] Tab switching preserves state correctly

---

## Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Foundation | 4 hours | Types, service layer, page shell |
| 2. Query Hooks | 4 hours | All React Query hooks |
| 3. Components | 3 hours | StatusBadge, StatCard, RequestCard |
| 4. Tabs | 8 hours | All 7 tab components |
| 5. Modals | 6 hours | All modal forms |
| 6. Integration | 2 hours | Routing, navigation |
| 7. Cleanup | 3 hours | Remove legacy, testing |

**Total: ~30 hours (3-4 days)**

---

## Success Criteria

- [ ] No `prompt()` or `alert()` calls
- [ ] All data fetching uses React Query
- [ ] All components under 300 lines
- [ ] Uses existing UI components (DataTable, Modal, Form)
- [ ] TypeScript types for all data
- [ ] Pagination on all tables
- [ ] Search on Users and Assets tabs
- [ ] Proper loading and error states
- [ ] Legacy `admin-dashboard.js` deleted

---

*Created: 2024-11-27*
*Status: READY FOR IMPLEMENTATION*
