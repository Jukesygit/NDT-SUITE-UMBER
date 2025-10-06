// Authentication Manager - Handles users, organizations, and permissions (Supabase)
import supabase, { isSupabaseConfigured } from './supabase-client.js';
import indexedDB from './indexed-db.js';

const AUTH_STORE_KEY = 'auth_data';

// User roles and permissions
export const ROLES = {
    ADMIN: 'admin',           // Super admin - access to all orgs
    ORG_ADMIN: 'org_admin',   // Organization admin - manage users in their org
    EDITOR: 'editor',         // Can create/edit/delete data
    VIEWER: 'viewer'          // Read-only access
};

export const PERMISSIONS = {
    VIEW: 'view',
    CREATE: 'create',
    EDIT: 'edit',
    DELETE: 'delete',
    EXPORT: 'export',
    MANAGE_USERS: 'manage_users'
};

const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS
    ],
    [ROLES.ORG_ADMIN]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS
    ],
    [ROLES.EDITOR]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.EXPORT
    ]
};

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.useSupabase = isSupabaseConfigured();

        // Fallback local data for when Supabase is not configured
        this.authData = {
            organizations: [],
            users: [],
            accountRequests: []
        };

        this.initPromise = this.initialize();
    }

    async initialize() {
        try {
            if (this.useSupabase) {
                console.log('Initializing with Supabase backend');
                await this.initializeSupabase();
            } else {
                console.log('Initializing with local storage (Supabase not configured)');
                await this.initializeLocal();
            }
            console.log('Auth manager initialized');
        } catch (error) {
            console.error('Error initializing auth manager:', error);
            // Fallback to local if Supabase fails
            if (this.useSupabase) {
                console.log('Falling back to local storage');
                this.useSupabase = false;
                await this.initializeLocal();
            }
        }
    }

    async initializeSupabase() {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            await this.loadUserProfile(session.user.id);
        }

        // Listen for auth state changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event);

            if (session?.user) {
                await this.loadUserProfile(session.user.id);
            } else {
                this.currentUser = null;
                this.currentProfile = null;
            }
        });
    }

    async initializeLocal() {
        // Load auth data from IndexedDB
        const stored = await this.loadAuthData();

        if (stored) {
            this.authData = stored;
        } else {
            // First time setup - create default ADMIN account
            await this.createDefaultAdmin();
        }

        // Check if user was logged in (session storage)
        const sessionUser = sessionStorage.getItem('currentUser');
        if (sessionUser) {
            this.currentUser = JSON.parse(sessionUser);
        }
    }

    async loadUserProfile(userId) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error loading profile:', error);
            return;
        }

        this.currentUser = {
            id: profile.id,
            username: profile.username,
            email: profile.email,
            role: profile.role,
            organizationId: profile.organization_id,
            isActive: profile.is_active
        };
        this.currentProfile = profile;
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    // Create default ADMIN user and demo organization (local only)
    async createDefaultAdmin() {
        const adminOrg = {
            id: this.generateId(),
            name: 'SYSTEM',
            createdAt: Date.now()
        };

        const adminUser = {
            id: this.generateId(),
            username: 'admin',
            password: 'admin123',
            email: 'admin@ndtsuite.local',
            role: ROLES.ADMIN,
            organizationId: adminOrg.id,
            createdAt: Date.now(),
            isActive: true
        };

        const demoOrg = {
            id: this.generateId(),
            name: 'Demo Organization',
            createdAt: Date.now()
        };

        this.authData.organizations = [adminOrg, demoOrg];
        this.authData.users = [adminUser];

        await this.saveAuthData();

        console.log('Default admin created (username: admin, password: admin123)');
    }

    // Authentication
    async login(email, password, rememberMe = false) {
        await this.ensureInitialized();

        if (this.useSupabase) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (data.user) {
                await this.loadUserProfile(data.user.id);

                if (!this.currentUser.isActive) {
                    await supabase.auth.signOut();
                    return { success: false, error: 'Account is not active' };
                }

                // Handle remember me
                if (rememberMe) {
                    localStorage.setItem('rememberedUsername', email);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }

                return { success: true, user: this.currentUser };
            }

            return { success: false, error: 'Login failed' };
        } else {
            // Local auth - email is treated as username
            const user = this.authData.users.find(
                u => (u.username === email || u.email === email) && u.password === password && u.isActive
            );

            if (user) {
                this.currentUser = user;
                sessionStorage.setItem('currentUser', JSON.stringify(user));

                // Handle remember me
                if (rememberMe) {
                    localStorage.setItem('rememberedUsername', email);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }

                return { success: true, user };
            }

            return { success: false, error: 'Invalid credentials' };
        }
    }

    async logout() {
        if (this.useSupabase) {
            await supabase.auth.signOut();
        } else {
            sessionStorage.removeItem('currentUser');
        }

        this.currentUser = null;
        this.currentProfile = null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getCurrentProfile() {
        return this.currentProfile;
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    isAdmin() {
        return this.currentUser?.role === ROLES.ADMIN;
    }

    // Permissions
    hasPermission(permission) {
        if (!this.currentUser) return false;
        const permissions = ROLE_PERMISSIONS[this.currentUser.role] || [];
        return permissions.includes(permission);
    }

    canAccessOrganization(organizationId) {
        if (!this.currentUser) return false;

        // ADMIN can access all organizations
        if (this.currentUser.role === ROLES.ADMIN) return true;

        // Users can only access their own organization
        return this.currentUser.organizationId === organizationId;
    }

    getCurrentOrganizationId() {
        return this.currentUser?.organizationId;
    }

    // Organization management
    async createOrganization(name) {
        if (!this.hasPermission(PERMISSIONS.MANAGE_USERS) || !this.isAdmin()) {
            return { success: false, error: 'Permission denied' };
        }

        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('organizations')
                .insert({ name })
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true, organization: data };
        } else {
            const org = {
                id: this.generateId(),
                name,
                createdAt: Date.now()
            };

            this.authData.organizations.push(org);
            await this.saveAuthData();

            return { success: true, organization: org };
        }
    }

    async getOrganizations() {
        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .order('name');

            if (error) {
                console.error('Error fetching organizations:', error);
                return [];
            }

            return data || [];
        } else {
            // If not logged in, return all organizations (for account request flow)
            if (!this.currentUser) {
                return this.authData.organizations;
            }

            if (this.isAdmin()) {
                return this.authData.organizations;
            }

            return this.authData.organizations.filter(
                org => org.id === this.currentUser.organizationId
            );
        }
    }

    async getOrganization(organizationId) {
        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', organizationId)
                .single();

            if (error) {
                console.error('Error fetching organization:', error);
                return null;
            }

            return data;
        } else {
            return this.authData.organizations.find(org => org.id === organizationId);
        }
    }

    async updateOrganization(organizationId, updates) {
        if (!this.isAdmin()) {
            return { success: false, error: 'Permission denied' };
        }

        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('organizations')
                .update(updates)
                .eq('id', organizationId)
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true, organization: data };
        } else {
            const org = await this.getOrganization(organizationId);
            if (org) {
                Object.assign(org, updates);
                await this.saveAuthData();
                return { success: true, organization: org };
            }

            return { success: false, error: 'Organization not found' };
        }
    }

    async deleteOrganization(organizationId) {
        if (!this.isAdmin()) {
            return { success: false, error: 'Permission denied' };
        }

        if (this.useSupabase) {
            // Check if it's SYSTEM org
            const org = await this.getOrganization(organizationId);
            if (org?.name === 'SYSTEM') {
                return { success: false, error: 'Cannot delete system organization' };
            }

            const { error } = await supabase
                .from('organizations')
                .delete()
                .eq('id', organizationId);

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true };
        } else {
            const org = await this.getOrganization(organizationId);
            if (org?.name === 'SYSTEM') {
                return { success: false, error: 'Cannot delete system organization' };
            }

            const index = this.authData.organizations.findIndex(o => o.id === organizationId);
            if (index !== -1) {
                this.authData.organizations.splice(index, 1);
                this.authData.users = this.authData.users.filter(
                    u => u.organizationId !== organizationId
                );
                await this.saveAuthData();
                return { success: true };
            }

            return { success: false, error: 'Organization not found' };
        }
    }

    // User management
    async createUser(userData) {
        const canManageUsers = this.hasPermission(PERMISSIONS.MANAGE_USERS);

        if (!canManageUsers) {
            return { success: false, error: 'Permission denied' };
        }

        // Org admins can only create users in their own organization
        if (this.currentUser.role === ROLES.ORG_ADMIN &&
            userData.organizationId !== this.currentUser.organizationId) {
            return { success: false, error: 'Can only create users in your organization' };
        }

        // Only ADMIN can create ADMIN or ORG_ADMIN users
        if ((userData.role === ROLES.ADMIN || userData.role === ROLES.ORG_ADMIN) &&
            !this.isAdmin()) {
            return { success: false, error: 'Insufficient permissions to create admin users' };
        }

        if (this.useSupabase) {
            // Create auth user using signUp (admin.createUser requires service role key)
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        username: userData.username,
                        role: userData.role,
                        organization_id: userData.organizationId
                    },
                    emailRedirectTo: window.location.origin
                }
            });

            if (authError) {
                return { success: false, error: authError.message };
            }

            // Profile is automatically created via trigger
            return { success: true, user: { id: authData.user?.id, ...userData } };
        } else {
            // Check if username already exists
            if (this.authData.users.find(u => u.username === userData.username)) {
                return { success: false, error: 'Username already exists' };
            }

            const user = {
                id: this.generateId(),
                username: userData.username,
                password: userData.password,
                email: userData.email,
                role: userData.role,
                organizationId: userData.organizationId,
                createdAt: Date.now(),
                isActive: true
            };

            this.authData.users.push(user);
            await this.saveAuthData();

            return { success: true, user };
        }
    }

    async getUsers() {
        if (this.useSupabase) {
            let query = supabase
                .from('profiles')
                .select('*, organizations(*)');

            // Org admins only see users in their org
            if (this.currentUser?.role === ROLES.ORG_ADMIN) {
                query = query.eq('organization_id', this.currentUser.organizationId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching users:', error);
                return [];
            }

            return data || [];
        } else {
            if (this.isAdmin()) {
                return this.authData.users;
            }

            if (this.currentUser?.role === ROLES.ORG_ADMIN) {
                return this.authData.users.filter(
                    u => u.organizationId === this.currentUser.organizationId
                );
            }

            return [];
        }
    }

    async getUser(userId) {
        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('profiles')
                .select('*, organizations(*)')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching user:', error);
                return null;
            }

            return data;
        } else {
            return this.authData.users.find(u => u.id === userId);
        }
    }

    async updateUser(userId, updates) {
        const user = await this.getUser(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        // Check permissions
        if (!this.isAdmin() && this.currentUser?.role !== ROLES.ORG_ADMIN) {
            return { success: false, error: 'Permission denied' };
        }

        // Org admins can only update users in their organization
        if (this.currentUser?.role === ROLES.ORG_ADMIN &&
            user.organization_id !== this.currentUser.organizationId) {
            return { success: false, error: 'Can only update users in your organization' };
        }

        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            // Update current user if updating self
            if (userId === this.currentUser?.id) {
                await this.loadUserProfile(userId);
            }

            return { success: true, user: data };
        } else {
            Object.assign(user, updates);
            await this.saveAuthData();

            // Update session if updating current user
            if (userId === this.currentUser?.id) {
                this.currentUser = user;
                sessionStorage.setItem('currentUser', JSON.stringify(user));
            }

            return { success: true, user };
        }
    }

    async deleteUser(userId) {
        const user = await this.getUser(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        // Can't delete yourself
        if (userId === this.currentUser?.id) {
            return { success: false, error: 'Cannot delete yourself' };
        }

        // Check permissions
        if (!this.hasPermission(PERMISSIONS.MANAGE_USERS)) {
            return { success: false, error: 'Permission denied' };
        }

        // Org admins can only delete users in their organization
        if (this.currentUser?.role === ROLES.ORG_ADMIN &&
            user.organization_id !== this.currentUser.organizationId) {
            return { success: false, error: 'Can only delete users in your organization' };
        }

        if (this.useSupabase) {
            // Delete auth user (profile will cascade delete)
            const { error } = await supabase.auth.admin.deleteUser(userId);

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true };
        } else {
            const index = this.authData.users.findIndex(u => u.id === userId);
            if (index !== -1) {
                this.authData.users.splice(index, 1);
                await this.saveAuthData();
                return { success: true };
            }

            return { success: false, error: 'User not found' };
        }
    }

    // Account requests
    async requestAccount(requestData) {
        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('account_requests')
                .insert({
                    username: requestData.username,
                    email: requestData.email,
                    requested_role: requestData.requestedRole || ROLES.VIEWER,
                    organization_id: requestData.organizationId,
                    message: requestData.message || ''
                })
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true, request: data };
        } else {
            const request = {
                id: this.generateId(),
                username: requestData.username,
                email: requestData.email,
                requestedRole: requestData.requestedRole || ROLES.VIEWER,
                organizationId: requestData.organizationId,
                message: requestData.message || '',
                status: 'pending',
                createdAt: Date.now()
            };

            this.authData.accountRequests.push(request);
            await this.saveAuthData();

            return { success: true, request };
        }
    }

    async getPendingAccountRequests() {
        if (!this.isAdmin() && this.currentUser?.role !== ROLES.ORG_ADMIN) {
            return [];
        }

        if (this.useSupabase) {
            let query = supabase
                .from('account_requests')
                .select('*, organizations(*)')
                .eq('status', 'pending');

            // Org admins only see requests for their org
            if (this.currentUser?.role === ROLES.ORG_ADMIN) {
                query = query.eq('organization_id', this.currentUser.organizationId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching account requests:', error);
                return [];
            }

            return data || [];
        } else {
            if (this.isAdmin()) {
                return this.authData.accountRequests.filter(r => r.status === 'pending');
            }

            return this.authData.accountRequests.filter(
                r => r.status === 'pending' && r.organizationId === this.currentUser.organizationId
            );
        }
    }

    async approveAccountRequest(requestId) {
        if (this.useSupabase) {
            const { data: request, error: fetchError } = await supabase
                .from('account_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError || !request) {
                return { success: false, error: 'Request not found' };
            }

            // Create user with signUp and auto-generated password
            // User will receive confirmation email to set their password
            const tempPassword = crypto.randomUUID();
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: request.email,
                password: tempPassword,
                options: {
                    data: {
                        username: request.username,
                        role: request.requested_role,
                        organization_id: request.organization_id
                    }
                }
            });

            if (authError) {
                return { success: false, error: authError.message };
            }

            // Update request status
            const { error: updateError } = await supabase
                .from('account_requests')
                .update({
                    status: 'approved',
                    approved_by: this.currentUser.id,
                    approved_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            return { success: true, message: 'User account created. Confirmation email sent.' };
        } else {
            const request = this.authData.accountRequests.find(r => r.id === requestId);
            if (!request) {
                return { success: false, error: 'Request not found' };
            }

            // For local mode, create with a temporary password
            const tempPassword = 'ChangeMe123!';
            const result = await this.createUser({
                username: request.username,
                email: request.email,
                password: tempPassword,
                role: request.requestedRole,
                organizationId: request.organizationId
            });

            if (result.success) {
                request.status = 'approved';
                request.approvedAt = Date.now();
                request.approvedBy = this.currentUser.id;
                await this.saveAuthData();
            }

            return result;
        }
    }

    async rejectAccountRequest(requestId, reason) {
        if (this.useSupabase) {
            const { error } = await supabase
                .from('account_requests')
                .update({
                    status: 'rejected',
                    rejected_by: this.currentUser.id,
                    rejected_at: new Date().toISOString(),
                    rejection_reason: reason
                })
                .eq('id', requestId);

            if (error) {
                return { success: false, error: error.message };
            }

            return { success: true };
        } else {
            const request = this.authData.accountRequests.find(r => r.id === requestId);
            if (!request) {
                return { success: false, error: 'Request not found' };
            }

            request.status = 'rejected';
            request.rejectedAt = Date.now();
            request.rejectedBy = this.currentUser.id;
            request.rejectionReason = reason;
            await this.saveAuthData();

            return { success: true };
        }
    }

    // Storage (local fallback only)
    async loadAuthData() {
        try {
            const data = await indexedDB.loadData();
            return data[AUTH_STORE_KEY] || null;
        } catch (error) {
            console.error('Error loading auth data:', error);
            return null;
        }
    }

    async saveAuthData() {
        try {
            const data = await indexedDB.loadData();
            data[AUTH_STORE_KEY] = this.authData;
            await indexedDB.saveData(data);
            return true;
        } catch (error) {
            console.error('Error saving auth data:', error);
            return false;
        }
    }

    // Utility
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Check if using Supabase backend
    isUsingSupabase() {
        return this.useSupabase;
    }
}

// Create singleton instance
const authManager = new AuthManager();

export default authManager;
