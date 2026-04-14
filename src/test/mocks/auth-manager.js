import { vi } from 'vitest';

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  ORG_ADMIN: 'org_admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
};

export function createMockUser(role = 'viewer', orgId = 'org-1') {
  return {
    id: `user-${role}-1`,
    username: `${role}_user`,
    email: `${role}@test.com`,
    role,
    organizationId: orgId,
    isActive: true,
  };
}

export function createMockProfile(role = 'viewer', orgId = 'org-1') {
  const user = createMockUser(role, orgId);
  return {
    ...user,
    organization_id: orgId,
    is_active: true,
    avatar_url: null,
    organizations: { id: orgId, name: 'Test Org' },
  };
}

export function createMockAuthManager(overrides = {}) {
  const defaultUser = null;
  return {
    currentUser: defaultUser,
    currentProfile: null,
    useSupabase: true,
    initPromise: Promise.resolve(),
    initialize: vi.fn().mockResolvedValue(undefined),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockReturnValue(defaultUser),
    getCurrentProfile: vi.fn().mockReturnValue(null),
    isLoggedIn: vi.fn().mockReturnValue(false),
    isAdmin: vi.fn().mockReturnValue(false),
    isManager: vi.fn().mockReturnValue(false),
    isOrgAdmin: vi.fn().mockReturnValue(false),
    hasElevatedAccess: vi.fn().mockReturnValue(false),
    hasPermission: vi.fn().mockReturnValue(false),
    canAccessOrganization: vi.fn().mockReturnValue(false),
    getCurrentOrganizationId: vi.fn().mockReturnValue(null),
    isUsingSupabase: vi.fn().mockReturnValue(true),
    login: vi.fn().mockResolvedValue({ success: false, error: 'Not configured' }),
    logout: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue({ success: false }),
    resetPassword: vi.fn().mockResolvedValue({ success: false }),
    verifyResetCode: vi.fn().mockResolvedValue({ success: false }),
    loadUserProfile: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn().mockReturnValue(() => {}),
    createOrganization: vi.fn().mockResolvedValue({ success: false }),
    getOrganizations: vi.fn().mockResolvedValue([]),
    getOrganization: vi.fn().mockResolvedValue(null),
    updateOrganization: vi.fn().mockResolvedValue({ success: false }),
    deleteOrganization: vi.fn().mockResolvedValue({ success: false }),
    createUser: vi.fn().mockResolvedValue({ success: false }),
    getUsers: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue(null),
    updateUser: vi.fn().mockResolvedValue({ success: false }),
    deleteUser: vi.fn().mockResolvedValue({ success: false }),
    bulkCreateUsers: vi.fn().mockResolvedValue({ success: false }),
    syncUsers: vi.fn().mockResolvedValue({ success: true }),
    requestAccount: vi.fn().mockResolvedValue({ success: false }),
    getPendingAccountRequests: vi.fn().mockResolvedValue([]),
    approveAccountRequest: vi.fn().mockResolvedValue({ success: false }),
    rejectAccountRequest: vi.fn().mockResolvedValue({ success: false }),
    generateId: vi.fn().mockReturnValue('mock-id'),
    loadAuthData: vi.fn().mockResolvedValue(null),
    saveAuthData: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

export { ROLES };
export default { createMockAuthManager, createMockUser, createMockProfile, ROLES };
