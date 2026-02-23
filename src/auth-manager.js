// Authentication Manager - Handles users, organizations, and permissions (Supabase)
import supabase, { isSupabaseConfigured } from './supabase-client.js';
import indexedDB from './indexed-db.js';
import bcrypt from 'bcryptjs';
import { logActivity } from './services/activity-log-service.ts';

const AUTH_STORE_KEY = 'auth_data';

// User roles and permissions
export const ROLES = {
    ADMIN: 'admin',           // Super admin - access to all orgs, including admin tools
    MANAGER: 'manager',       // Manager - access to everything except admin tools
    ORG_ADMIN: 'org_admin',   // Organization admin - manage users in their org (limited nav)
    EDITOR: 'editor',         // Can create/edit/delete data (limited nav)
    VIEWER: 'viewer'          // Read-only access (limited nav)
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
    [ROLES.MANAGER]: [
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
                await this.initializeSupabase();
            } else {
                await this.initializeLocal();
            }
        } catch (error) {
            // Fallback to local if Supabase fails
            if (this.useSupabase) {
                this.useSupabase = false;
                await this.initializeLocal();
            }
        }
    }

    async initializeSupabase() {
        const INIT_TIMEOUT = 10000; // 10 seconds

        // Wrap getSession in a timeout to prevent indefinite hanging during init
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase initialization timed out')), INIT_TIMEOUT)
        );

        try {
            // Check for existing session with timeout
            const sessionPromise = supabase.auth.getSession();
            const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

            if (session?.user) {
                await this.loadUserProfile(session.user.id);
            }
        } catch (error) {
            // Allow app to continue - user will be prompted to login
        }

        // Listen for auth state changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                // User clicked password reset link
                // Don't show modal here - LoginPageNew handles this via React state
                // Just dispatch an event so other components can react if needed
                window.dispatchEvent(new CustomEvent('passwordRecoveryMode', { detail: { active: true } }));
                return; // Don't proceed with normal sign-in flow
            } else if (event === 'SIGNED_IN') {
                // User signed in (either via login or email confirmation)
                await this.loadUserProfile(session.user.id);

                // Trigger login event to refresh UI
                window.dispatchEvent(new CustomEvent('userLoggedIn', {
                    detail: { user: this.currentUser }
                }));
            } else if (event === 'USER_UPDATED') {
                // User data updated (e.g., password changed)
                if (session?.user) {
                    await this.loadUserProfile(session.user.id);
                }
            } else if (event === 'SIGNED_OUT') {
                // User signed out
                this.currentUser = null;
                this.currentProfile = null;
            } else if (session?.user && !this.currentUser) {
                // Catch-all: if we have a session but no current user, load profile
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
            return;
        }

        if (!profile) {
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

        // Hash password for secure storage (even in local mode)
        const hashedPassword = bcrypt.hashSync(tempPassword, 10);

        const adminUser = {
            id: this.generateId(),
            username: 'admin',
            password: hashedPassword, // Securely hashed password
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

        // SECURITY: Never store plaintext passwords, even in dev mode
        // For first-time setup, display credentials securely via console only
        if (process.env.NODE_ENV === 'development') {
            // Store only a flag indicating first setup (no sensitive data)
            sessionStorage.setItem('_ndt_first_setup', JSON.stringify({
                username: 'admin',
                isFirstSetup: true,
                showOnce: true
            }));
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
            let data, error;
            try {
                const response = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                data = response.data;
                error = response.error;
            } catch (fetchError) {
                return { success: false, error: 'Unable to connect to authentication service. Please check your internet connection or try again later.' };
            }

            if (error) {
                return { success: false, error: 'Invalid email or password' };
            }

            if (data.user) {
                await this.loadUserProfile(data.user.id);

                if (!this.currentUser) {
                    await supabase.auth.signOut();
                    return { success: false, error: 'Invalid email or password' };
                }

                if (!this.currentUser.isActive) {
                    // SECURITY: Use generic message to prevent account enumeration
                    await supabase.auth.signOut();
                    return { success: false, error: 'Invalid email or password' };
                }

                // Reset rate limiter on successful login
                loginRateLimiter.reset(email.toLowerCase());

                // Log successful login
                logActivity({
                    userId: this.currentUser.id,
                    actionType: 'login_success',
                    actionCategory: 'auth',
                    description: `User ${this.currentUser.username || email} logged in successfully`,
                });

                // Dispatch userLoggedIn event immediately to update AuthContext
                // This ensures the React auth state updates before login() returns
                // (onAuthStateChange also dispatches this, but asynchronously)
                window.dispatchEvent(new CustomEvent('userLoggedIn', {
                    detail: { user: this.currentUser }
                }));

                return { success: true, user: this.currentUser };
            }

            // Log failed login
            logActivity({
                actionType: 'login_failed',
                actionCategory: 'auth',
                description: `Login failed for ${email}`,
                details: { email },
            });

            return { success: false, error: 'Login failed' };
        } else {
            // Local auth - email is treated as username
            // Find user by username/email first, then verify password with bcrypt
            const user = this.authData.users.find(
                u => (u.username === email || u.email === email) && u.isActive
            );

            // Verify password using bcrypt (secure comparison)
            if (user && bcrypt.compareSync(password, user.password)) {
                this.currentUser = user;
                sessionStorage.setItem('currentUser', JSON.stringify(user));

                // Dispatch auth state change event for local mode
                window.dispatchEvent(new CustomEvent('authStateChange', {
                    detail: { session: { user } }
                }));

                return { success: true, user };
            }

            return { success: false, error: 'Invalid credentials' };
        }
    }

    async signUp(email, password) {
        await this.ensureInitialized();

        if (this.useSupabase) {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/login`
                }
            });

            if (error) {
                return { success: false, error };
            }

            return { success: true, data };
        } else {
            // For local mode, self-registration is not supported
            // Users should use the account request flow
            return {
                success: false,
                error: { message: 'Self-registration is not available in local mode. Please contact your administrator.' }
            };
        }
    }

    async logout() {
        // Capture user info before clearing for activity log
        const userId = this.currentUser?.id;
        const username = this.currentUser?.username;

        // Log logout activity (fire and forget)
        if (userId) {
            logActivity({
                userId,
                actionType: 'logout',
                actionCategory: 'auth',
                description: `User ${username || 'Unknown'} logged out`,
            });
        }

        // Clear current user immediately
        this.currentUser = null;
        this.currentProfile = null;

        // Dispatch logout event for components to clean up
        window.dispatchEvent(new CustomEvent('userLoggedOut'));

        if (this.useSupabase) {
            // Sign out from current device only (faster than global)
            await supabase.auth.signOut({ scope: 'local' });
        } else {
            sessionStorage.removeItem('currentUser');
            window.dispatchEvent(new CustomEvent('authStateChange', {
                detail: { session: null }
            }));
        }
    }

    async resetPassword(email) {
        // Don't wait for full initialization - password reset should work for unauthenticated users
        // Just check if we're configured to use Supabase
        if (this.useSupabase) {
            try {
                // Use custom code-based reset flow to bypass corporate email scanners
                const { data, error } = await supabase.functions.invoke('send-reset-code', {
                    body: { email }
                });

                if (error) {
                    return { success: false, error: { message: error.message || 'Failed to send reset code' } };
                }

                if (data?.error) {
                    return { success: false, error: { message: data.error } };
                }

                return { success: true, data, useCodeFlow: true };
            } catch (err) {
                return { success: false, error: { message: err.message || 'Failed to send password reset code' } };
            }
        } else {
            // For local mode, just show a message
            return {
                success: false,
                error: { message: 'Password reset is not available in local mode. Please contact your administrator.' }
            };
        }
    }

    // Verify reset code and update password
    async verifyResetCode(email, code, newPassword) {
        if (!this.useSupabase) {
            return {
                success: false,
                error: { message: 'Password reset is not available in local mode.' }
            };
        }

        try {
            const { data, error } = await supabase.functions.invoke('verify-reset-code', {
                body: { email, code, newPassword }
            });

            if (error) {
                return { success: false, error: { message: error.message || 'Failed to verify reset code' } };
            }

            if (data?.error) {
                return { success: false, error: { message: data.error } };
            }

            return { success: true, message: data?.message };
        } catch (err) {
            return { success: false, error: { message: err.message || 'Failed to verify reset code' } };
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

    isManager() {
        return this.currentUser?.role === ROLES.MANAGER;
    }

    isOrgAdmin() {
        return this.currentUser?.role === ROLES.ORG_ADMIN;
    }

    // Check if user has elevated access (admin or manager)
    hasElevatedAccess() {
        return this.isAdmin() || this.isManager();
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
            return null;
        }

        if (this.useSupabase) {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', organizationId)
                .single();

            if (error) {
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

            // Use Edge Function to create user with admin API
            // This pre-confirms email and ensures profile trigger fires correctly
            const { data, error } = await supabase.functions.invoke('create-user', {
                body: {
                    email: userData.email,
                    username: userData.username,
                    password: userData.password,
                    role: userData.role || 'viewer',
                    organization_id: orgId
                }
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (data?.error) {
                return { success: false, error: data.error };
            }

            if (!data?.user) {
                return { success: false, error: 'User creation failed - no user returned' };
            }

            return { success: true, user: data.user };
        } else {
            // Check if username already exists
            if (this.authData.users.find(u => u.username === userData.username)) {
                return { success: false, error: 'Username already exists' };
            }

            // Hash password for secure storage in local mode
            const hashedPassword = bcrypt.hashSync(userData.password, 10);

            const user = {
                id: this.generateId(),
                username: userData.username,
                password: hashedPassword, // Securely hashed
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

    // Sync auth users with profiles table
    async syncUsers() {
        if (!this.useSupabase) {
            return { success: true, message: 'Sync not needed in local mode' };
        }

        try {
            const { data, error } = await supabase.functions.invoke('sync-users');

            if (error) {
                return { success: false, error: error.message };
            }

            if (data?.error) {
                return { success: false, error: data.error };
            }

            return { success: true, ...data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getUsers() {
        if (this.useSupabase) {
            // Sync users first to ensure profiles exist for all auth users
            await this.syncUsers();

            let query = supabase
                .from('profiles')
                .select('*, organizations(*)');

            // Org admins only see users in their org
            if (this.currentUser?.role === ROLES.ORG_ADMIN) {
                query = query.eq('organization_id', this.currentUser.organizationId);
            }

            const { data, error } = await query;

            if (error) {
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
            // Perform the update and select the result to verify it worked
            const { data: updatedRows, error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select();

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            // Check if any rows were actually updated (RLS may silently block)
            if (!updatedRows || updatedRows.length === 0) {
                return {
                    success: false,
                    error: 'Unable to update user. You may not have permission to modify this user.'
                };
            }

            const data = updatedRows[0];

            // Verify the update actually applied by checking a key field
            if (updates.role && data.role !== updates.role) {
                return {
                    success: false,
                    error: 'Unable to update user role. Database policy may have blocked this change.'
                };
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
            // Use Edge Function to delete both auth user and profile
            const { data, error } = await supabase.functions.invoke('delete-user', {
                body: { userId }
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (data?.error) {
                return { success: false, error: data.error };
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
                    return { success: false, error: error.message };
                }

                if (data?.error) {
                    return { success: false, error: data.error };
                }

                return { success: true, request: data?.request };
            } catch (err) {
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
                const { data, error } = await supabase.functions.invoke('approve-account-request', {
                    body: {
                        request_id: requestId,
                        approved_by_user_id: this.currentUser.id
                    }
                });

                if (error) {
                    return { success: false, error: error.message || JSON.stringify(error) };
                }

                if (data?.error) {
                    const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                    const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : '';
                    return { success: false, error: errorMsg + details };
                }

                return {
                    success: true,
                    message: data?.message || 'Account created successfully. User will receive an email to set their password.'
                };
            } catch (err) {
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
            // FAST PATH: Try to load isolated auth data first
            const isolatedData = await indexedDB.loadItem(AUTH_STORE_KEY);
            if (isolatedData) {
                return isolatedData;
            }

            // FALLBACK: Load from monolithic store (slow, but needed for migration)
            const data = await indexedDB.loadData();
            const legacyAuthData = data[AUTH_STORE_KEY];

            if (legacyAuthData) {
                // Copy to isolated store for next time
                await indexedDB.saveItem(AUTH_STORE_KEY, legacyAuthData);
                return legacyAuthData;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    async saveAuthData() {
        try {
            // FAST PATH: Save to isolated store
            await indexedDB.saveItem(AUTH_STORE_KEY, this.authData);
            
            // Note: We don't update the monolithic store here to save time.
            // This might cause drift if something reads ONLY loadData(), 
            // but AuthManager is the source of truth for auth.
            return true;
        } catch (error) {
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

    // Get current session with timeout to prevent hanging
    async getSession(timeoutMs = 10000) {
        if (this.useSupabase) {
            // Wrap getSession in a timeout to prevent indefinite hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Session check timed out')), timeoutMs);
            });

            try {
                const sessionPromise = supabase.auth.getSession();
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                return session;
            } catch (error) {
                // Return null on timeout - will trigger logout flow
                return null;
            }
        } else {
            // For local mode, return a mock session if user is logged in
            return this.currentUser ? { user: this.currentUser } : null;
        }
    }

    // Attempt to refresh the session token
    async refreshSession(timeoutMs = 10000) {
        if (!this.useSupabase) {
            return this.currentUser ? { user: this.currentUser } : null;
        }

        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Session refresh timed out')), timeoutMs);
        });

        try {
            const refreshPromise = supabase.auth.refreshSession();
            const { data: { session }, error } = await Promise.race([refreshPromise, timeoutPromise]);
            
            clearTimeout(timeoutId);

            if (error) {
                return null;
            }

            return session;
        } catch (error) {
            clearTimeout(timeoutId);
            return null;
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

    // Bulk create users from a list of user data
    // Each user object should have: email, username, role, organization_id (optional)
    // Returns: { success: boolean, results: array of individual results }
    async bulkCreateUsers(users, sendPasswordReset = true) {
        if (!this.isAdmin()) {
            return { success: false, error: 'Only admins can bulk create users' };
        }

        if (!this.useSupabase) {
            return { success: false, error: 'Bulk user creation only available in Supabase mode' };
        }

        if (!Array.isArray(users) || users.length === 0) {
            return { success: false, error: 'Users array is required' };
        }

        try {
            const { data, error } = await supabase.functions.invoke('bulk-create-users', {
                body: {
                    users: users.map(u => ({
                        email: u.email,
                        username: u.username,
                        role: u.role || 'viewer',
                        organization_id: u.organizationId || u.organization_id || null
                    })),
                    send_password_reset: sendPasswordReset
                }
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (data?.error) {
                return { success: false, error: data.error };
            }

            return {
                success: true,
                message: data?.message,
                results: data?.results || []
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

// Create singleton instance
const authManager = new AuthManager();

export default authManager;
