/**
 * Auth Supabase - Supabase-specific authentication flows.
 *
 * Handles Supabase init, login/signup, password reset, session management,
 * and auth state change listener.
 */

import supabase from '../supabase-client';
import { logActivity } from '../services/activity-log-service.ts';
import type { AuthCurrentUser, AuthProfile, AuthResult } from './auth-types';

// Supabase is guaranteed initialized when auth services are called
const sb = supabase!;

// ── Supabase Initialization ────────────────────────────────────────────────

export async function initializeSupabase(this: any): Promise<void> {
    const INIT_TIMEOUT = 10000; // 10 seconds

    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase initialization timed out')), INIT_TIMEOUT),
    );

    try {
        const sessionPromise = sb.auth.getSession();
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
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event: string, session: any) => {
        console.log(`[AUTH-DEBUG] onAuthStateChange: event=${event}, hasSession=${!!session}, hasUser=${!!session?.user}, currentUser=${!!this.currentUser}`);
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
            // Wait briefly to let any concurrent token refresh complete,
            // as Supabase can fire spurious SIGNED_OUT during token rotation.
            console.log('[AUTH-DEBUG] SIGNED_OUT received, waiting 500ms before verifying...');
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                const { data: { session: currentSession } } = await sb.auth.getSession();
                if (currentSession?.user) {
                    console.log('[AUTH-DEBUG] SIGNED_OUT was spurious - session still valid, ignoring');
                    return;
                }
                console.log('[AUTH-DEBUG] SIGNED_OUT confirmed - session is truly gone');
            } catch (e) {
                console.log('[AUTH-DEBUG] SIGNED_OUT getSession failed:', e);
                // If getSession fails, treat as truly signed out
            }
            this.currentUser = null;
            this.currentProfile = null;
            window.dispatchEvent(new CustomEvent('authStateChanged'));
        } else if (event === 'TOKEN_REFRESHED') {
            // Token was refreshed successfully - update profile if needed
            if (session?.user && this.currentUser) {
                // Session is valid and user is loaded, nothing to do
            } else if (session?.user && !this.currentUser) {
                await this.loadUserProfile(session.user.id);
                window.dispatchEvent(new CustomEvent('authStateChanged'));
            }
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
    const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        console.log(`[AUTH-DEBUG] loadUserProfile FAILED for ${userId}:`, profileError?.message || 'no profile found');
        return;
    }

    let organization = null;
    if (profile.organization_id) {
        const { data: orgData, error: orgError } = await sb
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
        const response = await sb.auth.signInWithPassword({ email, password });
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
            await sb.auth.signOut();
            return { success: false, error: 'Invalid email or password' };
        }

        if (!this.currentUser.isActive) {
            await sb.auth.signOut();
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
    const { data, error } = await sb.auth.signUp({
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
        const { data, error } = await sb.functions.invoke('send-reset-code', {
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
        const { data, error } = await sb.functions.invoke('verify-reset-code', {
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
        const sessionPromise = sb.auth.getSession();
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
        const refreshPromise = sb.auth.refreshSession();
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
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event: string, session: any) => {
        callback(session);
    });
    return () => subscription.unsubscribe();
}

// ── Supabase Logout ────────────────────────────────────────────────────────

export async function logoutSupabase(): Promise<void> {
    await sb.auth.signOut({ scope: 'local' });
}
