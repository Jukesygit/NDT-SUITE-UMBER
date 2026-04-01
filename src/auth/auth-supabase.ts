/**
 * Auth Supabase - Supabase-specific authentication flows.
 *
 * Handles Supabase init, login/signup, password reset, session management,
 * and auth state change listener.
 */

import supabase from '../supabase-client.js';
import { logActivity } from '../services/activity-log-service.ts';
import type { AuthCurrentUser, AuthProfile, AuthResult } from './auth-types';

// ── Supabase Initialization ────────────────────────────────────────────────

export async function initializeSupabase(this: any): Promise<void> {
    const INIT_TIMEOUT = 10000; // 10 seconds

    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase initialization timed out')), INIT_TIMEOUT),
    );

    try {
        const sessionPromise = supabase.auth.getSession();
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

        if (session?.user) {
            await this.loadUserProfile(session.user.id);
        }
    } catch (_error) {
        // Allow app to continue - user will be prompted to login
    }

    // Prevent duplicate listener registration (e.g., during HMR)
    if (this._authSubscription) {
        this._authSubscription.unsubscribe();
        this._authSubscription = null;
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
        if (event === 'PASSWORD_RECOVERY') {
            window.dispatchEvent(new CustomEvent('passwordRecoveryMode', { detail: { active: true } }));
            return;
        } else if (event === 'SIGNED_IN') {
            await this.loadUserProfile(session.user.id);

            window.dispatchEvent(new CustomEvent('userLoggedIn', {
                detail: { user: this.currentUser },
            }));
        } else if (event === 'USER_UPDATED') {
            if (session?.user) {
                await this.loadUserProfile(session.user.id);
                window.dispatchEvent(new CustomEvent('authStateChanged'));
            }
        } else if (event === 'SIGNED_OUT') {
            // Guard: verify session is truly gone before clearing state.
            try {
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                if (currentSession?.user) {
                    return;
                }
            } catch {
                // If getSession fails, treat as truly signed out
            }
            this.currentUser = null;
            this.currentProfile = null;
        } else if (session?.user && !this.currentUser) {
            await this.loadUserProfile(session.user.id);
            window.dispatchEvent(new CustomEvent('authStateChanged'));
        }
    });
    this._authSubscription = subscription;
}

// ── Profile Loading ────────────────────────────────────────────────────────

export async function loadUserProfile(
    this: any,
    userId: string,
): Promise<void> {
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        return;
    }

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
        isActive: profile.is_active,
    } as AuthCurrentUser;

    this.currentProfile = { ...profile, organizations: organization } as AuthProfile;
}

// ── Supabase Login ─────────────────────────────────────────────────────────

export async function loginSupabase(
    this: any,
    email: string,
    password: string,
    loginRateLimiter: any,
): Promise<AuthResult> {
    let data: any, error: any;
    try {
        const response = await supabase.auth.signInWithPassword({ email, password });
        data = response.data;
        error = response.error;
    } catch (_fetchError) {
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
            await supabase.auth.signOut();
            return { success: false, error: 'Invalid email or password' };
        }

        loginRateLimiter.reset(email.toLowerCase());

        logActivity({
            userId: this.currentUser.id,
            actionType: 'login_success',
            actionCategory: 'auth',
            description: `User ${this.currentUser.username || email} logged in successfully`,
        });

        window.dispatchEvent(new CustomEvent('userLoggedIn', {
            detail: { user: this.currentUser },
        }));

        return { success: true, user: this.currentUser };
    }

    logActivity({
        actionType: 'login_failed',
        actionCategory: 'auth',
        description: `Login failed for ${email}`,
        details: { email },
    });

    return { success: false, error: 'Login failed' };
}

// ── Signup ──────────────────────────────────────────────────────────────────

export async function signUpSupabase(
    this: any,
    email: string,
    password: string,
): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${window.location.origin}/login`,
        },
    });

    if (error) {
        return { success: false, error };
    }

    return { success: true, data };
}

// ── Password Reset ─────────────────────────────────────────────────────────

export async function resetPasswordSupabase(
    _this: any,
    email: string,
): Promise<AuthResult> {
    try {
        const { data, error } = await supabase.functions.invoke('send-reset-code', {
            body: { email },
        });

        if (error) {
            return { success: false, error: { message: error.message || 'Failed to send reset code' } };
        }

        if (data?.error) {
            return { success: false, error: { message: data.error } };
        }

        return { success: true, data, useCodeFlow: true };
    } catch (err: any) {
        return { success: false, error: { message: err.message || 'Failed to send password reset code' } };
    }
}

export async function verifyResetCodeSupabase(
    _this: any,
    email: string,
    code: string,
    newPassword: string,
): Promise<AuthResult> {
    try {
        const { data, error } = await supabase.functions.invoke('verify-reset-code', {
            body: { email, code, newPassword },
        });

        if (error) {
            return { success: false, error: { message: error.message || 'Failed to verify reset code' } };
        }

        if (data?.error) {
            return { success: false, error: { message: data.error } };
        }

        return { success: true, message: data?.message };
    } catch (err: any) {
        return { success: false, error: { message: err.message || 'Failed to verify reset code' } };
    }
}

// ── Session Management ─────────────────────────────────────────────────────

export async function getSessionSupabase(timeoutMs: number = 10000): Promise<any> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session check timed out')), timeoutMs);
    });

    try {
        const sessionPromise = supabase.auth.getSession();
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        return session;
    } catch (_error) {
        return null;
    }
}

export async function refreshSessionSupabase(timeoutMs: number = 10000): Promise<any> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Session refresh timed out')), timeoutMs);
    });

    try {
        const refreshPromise = supabase.auth.refreshSession();
        const { data: { session }, error } = await Promise.race([refreshPromise, timeoutPromise]);

        clearTimeout(timeoutId!);

        if (error) {
            return null;
        }

        return session;
    } catch (_error) {
        clearTimeout(timeoutId!);
        return null;
    }
}

export function onAuthStateChangeSupabase(callback: (session: any) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
        callback(session);
    });
    return () => subscription.unsubscribe();
}

// ── Supabase Logout ────────────────────────────────────────────────────────

export async function logoutSupabase(): Promise<void> {
    await supabase.auth.signOut({ scope: 'local' });
}
