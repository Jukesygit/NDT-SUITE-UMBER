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
            console.log('Auth state changed:', event, session);

            if (event === 'PASSWORD_RECOVERY') {
                // User clicked password reset link - show password update form
                this.showPasswordResetForm();
            } else if (event === 'SIGNED_IN') {
                // User signed in (either via login or email confirmation)
                console.log('User signed in, loading profile...');
                await this.loadUserProfile(session.user.id);

                // Trigger login event to refresh UI
                window.dispatchEvent(new CustomEvent('userLoggedIn', {
                    detail: { user: this.currentUser }
                }));
            } else if (event === 'USER_UPDATED') {
                // User data updated (e.g., password changed)
                console.log('User updated');
                if (session?.user) {
                    await this.loadUserProfile(session.user.id);
                }
            } else if (event === 'SIGNED_OUT') {
                // User signed out
                this.currentUser = null;
                this.currentProfile = null;
            } else if (session?.user && !this.currentUser) {
                // Catch-all: if we have a session but no current user, load profile
                console.log('Session exists, loading profile...');
                await this.loadUserProfile(session.user.id);
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
        // First get the profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('Error loading profile:', profileError);
            return;
        }

        if (!profile) {
            console.error('Profile not found for user:', userId);
            return;
        }

        // Then get the organization if the user has one
        let organization = null;
        if (profile.organization_id) {
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', profile.organization_id)
                .single();

            if (!orgError && orgData) {
                organization = orgData;
            }
        }

        this.currentUser = {
            id: profile.id,
            username: profile.username,
            email: profile.email,
            role: profile.role,
            organizationId: profile.organization_id || null,
            isActive: profile.is_active
        };

        // Attach organization data to profile for compatibility
        this.currentProfile = { ...profile, organizations: organization };
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    // Create default ADMIN user and demo organization (local only)
    async createDefaultAdmin() {
        // Import security utilities
        const { generateSecurePassword } = await import('./config/security.js');

        const adminOrg = {
            id: this.generateId(),
            name: 'SYSTEM',
            createdAt: Date.now()
        };

        // Generate a secure random password
        const tempPassword = generateSecurePassword(16);

        const adminUser = {
            id: this.generateId(),
            username: 'admin',
            password: tempPassword, // This should be hashed server-side in production
            email: 'admin@ndtsuite.local',
            role: ROLES.ADMIN,
            organizationId: adminOrg.id,
            createdAt: Date.now(),
            isActive: true,
            requirePasswordChange: true // Force password change on first login
        };

        const demoOrg = {
            id: this.generateId(),
            name: 'Demo Organization',
            createdAt: Date.now()
        };

        this.authData.organizations = [adminOrg, demoOrg];
        this.authData.users = [adminUser];

        await this.saveAuthData();

        // Store the temporary password securely (only for local development)
        if (process.env.NODE_ENV === 'development') {
            console.log('====================================');
            console.log('LOCAL DEVELOPMENT MODE');
            console.log('Default admin account created');
            console.log('Username: admin');
            console.log('Temporary password:', tempPassword);
            console.log('IMPORTANT: Change this password immediately');
            console.log('====================================');
        } else {
            console.log('Default admin account created. Check server logs for credentials.');
        }
    }

    // Authentication
    async login(email, password, rememberMe = false) {
        await this.ensureInitialized();

        // Import rate limiter
        const { loginRateLimiter } = await import('./config/security.js');

        // Check rate limiting (use email as key)
        const rateLimitCheck = loginRateLimiter.isAllowed(email.toLowerCase());
        if (!rateLimitCheck.allowed) {
            const retryMinutes = Math.ceil(rateLimitCheck.retryAfter / 60000);
            return {
                success: false,
                error: `Too many login attempts. Please try again in ${retryMinutes} minutes.`,
                rateLimited: true,
                retryAfter: rateLimitCheck.retryAfter
            };
        }

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

                // Reset rate limiter on successful login
                loginRateLimiter.reset(email.toLowerCase());

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

                // Dispatch auth state change event for local mode
                window.dispatchEvent(new CustomEvent('authStateChange', {
                    detail: { session: { user } }
                }));

                return { success: true, user };
            }

            return { success: false, error: 'Invalid credentials' };
        }
    }

    async logout() {
        console.log('AuthManager: Starting logout...');

        // Clear current user first
        this.currentUser = null;
        this.currentProfile = null;

        if (this.useSupabase) {
            console.log('AuthManager: Signing out from Supabase...');
            // Sign out and clear all sessions
            const { error } = await supabase.auth.signOut({ scope: 'global' });
            if (error) {
                console.error('AuthManager: Supabase signOut error:', error);
            } else {
                console.log('AuthManager: Supabase signOut successful');
            }

            // Verify session is cleared
            const { data: { session } } = await supabase.auth.getSession();
            console.log('AuthManager: Session after signOut:', session);
        } else {
            sessionStorage.removeItem('currentUser');
            // Dispatch auth state change event for local mode
            window.dispatchEvent(new CustomEvent('authStateChange', {
                detail: { session: null }
            }));
        }

        // Dispatch logout event for components to clean up
        window.dispatchEvent(new CustomEvent('userLoggedOut'));
        console.log('AuthManager: Logout complete');
    }

    async resetPassword(email) {
        await this.ensureInitialized();

        if (this.useSupabase) {
            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/`
            });

            if (error) {
                return { success: false, error };
            }

            return { success: true, data };
        } else {
            // For local mode, just show a message
            return {
                success: false,
                error: { message: 'Password reset is not available in local mode. Please contact your administrator.' }
            };
        }
    }

    showPasswordResetForm() {
        // Create a modal overlay for password reset
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-center; z-index: 9999;';

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 40px; max-width: 400px; width: 90%;">
                <h2 style="color: #fff; font-size: 24px; font-weight: 700; margin-bottom: 8px;">Reset Your Password</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 24px;">Enter your new password below.</p>

                <form id="password-reset-form">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500; margin-bottom: 8px;">New Password</label>
                        <input type="password" id="new-password" required minlength="6" style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 24px;">
                        <label style="display: block; color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500; margin-bottom: 8px;">Confirm Password</label>
                        <input type="password" id="confirm-password" required minlength="6" style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box;">
                    </div>

                    <div id="reset-error" style="display: none; color: #ff6b6b; font-size: 14px; margin-bottom: 16px;"></div>

                    <div style="display: flex; gap: 12px;">
                        <button type="button" id="cancel-reset" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; cursor: pointer;">Cancel</button>
                        <button type="submit" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, rgba(90,150,255,0.9), rgba(110,170,255,0.9)); border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 20px rgba(100,150,255,0.3);">Reset Password</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('#password-reset-form');
        const newPasswordInput = modal.querySelector('#new-password');
        const confirmPasswordInput = modal.querySelector('#confirm-password');
        const errorDiv = modal.querySelector('#reset-error');
        const cancelBtn = modal.querySelector('#cancel-reset');

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            window.location.reload();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (newPassword !== confirmPassword) {
                errorDiv.textContent = 'Passwords do not match';
                errorDiv.style.display = 'block';
                return;
            }

            if (newPassword.length < 6) {
                errorDiv.textContent = 'Password must be at least 6 characters';
                errorDiv.style.display = 'block';
                return;
            }

            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                errorDiv.textContent = 'Error updating password: ' + error.message;
                errorDiv.style.display = 'block';
            } else {
                // Password updated successfully - user is automatically signed in
                document.body.removeChild(modal);

                // Redirect to main app - the USER_UPDATED event will handle loading the profile
                window.location.href = window.location.origin + '/#/';
            }
        });
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

    isOrgAdmin() {
        return this.currentUser?.role === ROLES.ORG_ADMIN;
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
        // Guard against undefined/null organization IDs
        if (!organizationId) {
            console.warn('getOrganization called with invalid ID:', organizationId);
            return null;
        }

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
            // Ensure organization_id is a valid UUID string or null
            const orgId = userData.organizationId ? String(userData.organizationId) : null;

            // Create auth user using signUp (admin.createUser requires service role key)
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        username: userData.username,
                        role: userData.role || 'user',
                        organization_id: orgId
                    },
                    emailRedirectTo: window.location.origin
                }
            });

            if (authError) {
                console.error('Supabase signUp error:', authError);
                return { success: false, error: authError.message };
            }

            if (!authData.user) {
                return { success: false, error: 'User creation failed - no user returned' };
            }

            // Profile is automatically created via trigger
            return { success: true, user: { id: authData.user.id, ...userData } };
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
            console.log('Attempting to delete user from Supabase:', userId);

            // Delete profile (can't delete auth user without service role key)
            // Just delete the profile - the auth user will remain but won't be able to access anything
            const { data, error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId)
                .select();

            console.log('Supabase delete response - data:', data, 'error:', error);

            if (error) {
                console.error('Delete error:', error);
                return { success: false, error: error.message };
            }

            // Check if any rows were actually deleted
            if (!data || data.length === 0) {
                console.warn('No rows were deleted. User may not exist or RLS policy prevented deletion.');
                return { success: false, error: 'Unable to delete user. Check permissions and RLS policies.' };
            }

            console.log('User deleted successfully:', data);
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

    // Account requests - No authentication required for submitting requests
    async requestAccount(requestData) {
        if (this.useSupabase) {
            try {
                // Use Edge Function to bypass RLS restrictions
                const { data, error } = await supabase.functions.invoke('submit-account-request', {
                    body: {
                        username: requestData.username,
                        email: requestData.email,
                        organization_id: requestData.organizationId,
                        requested_role: requestData.requestedRole || ROLES.VIEWER,
                        message: requestData.message || ''
                    }
                });

                if (error) {
                    console.error('Account request submission error:', error);
                    return { success: false, error: error.message };
                }

                if (data?.error) {
                    console.error('Edge function returned error:', data.error);
                    return { success: false, error: data.error };
                }

                return { success: true, request: data?.request };
            } catch (err) {
                console.error('Failed to submit account request:', err);
                return { success: false, error: err.message || 'Failed to submit request' };
            }
        } else{
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
            try {
                // Use Edge Function to handle approval with service role permissions
                console.log('Approving account request:', requestId);

                const { data, error } = await supabase.functions.invoke('approve-account-request', {
                    body: {
                        request_id: requestId,
                        approved_by_user_id: this.currentUser.id
                    }
                });

                if (error) {
                    console.error('Account approval error:', error);
                    return { success: false, error: error.message || JSON.stringify(error) };
                }

                if (data?.error) {
                    console.error('Edge function returned error:', data);
                    const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                    const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : '';
                    return { success: false, error: errorMsg + details };
                }

                console.log('Account approved successfully:', data);

                return {
                    success: true,
                    message: data?.message || 'Account created successfully. User will receive an email to set their password.'
                };
            } catch (err) {
                console.error('Failed to approve account request:', err);
                return { success: false, error: err.message || 'Failed to approve request' };
            }
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

    // Get current session
    async getSession() {
        if (this.useSupabase) {
            const { data: { session } } = await supabase.auth.getSession();
            return session;
        } else {
            // For local mode, return a mock session if user is logged in
            return this.currentUser ? { user: this.currentUser } : null;
        }
    }

    // Subscribe to auth state changes
    onAuthStateChange(callback) {
        if (this.useSupabase) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                callback(session);
            });
            return () => subscription.unsubscribe();
        } else {
            // For local mode, listen to custom events
            const handler = (event) => {
                callback(event.detail.session || (this.currentUser ? { user: this.currentUser } : null));
            };
            window.addEventListener('authStateChange', handler);
            return () => window.removeEventListener('authStateChange', handler);
        }
    }
}

// Create singleton instance
const authManager = new AuthManager();

export default authManager;
