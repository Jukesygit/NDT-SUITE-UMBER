/**
 * Auth Local - Local/IndexedDB fallback authentication.
 *
 * Handles local init, bcrypt login, default admin creation,
 * and IndexedDB auth data persistence.
 */

import indexedDB from '../indexed-db';
import bcrypt from 'bcryptjs';
import { ROLES, AUTH_STORE_KEY, type AuthData, type AuthCurrentUser, type AuthResult } from './auth-types';
import { generateId } from './auth-core';

// ── Local Initialization ───────────────────────────────────────────────────

export async function initializeLocal(this: any): Promise<void> {
    const stored = await loadAuthData();

    if (stored) {
        this.authData = stored;
    } else {
        await createDefaultAdmin.call(this);
    }

    const sessionUser = sessionStorage.getItem('currentUser');
    if (sessionUser) {
        this.currentUser = JSON.parse(sessionUser);
    }
}

// ── Default Admin Creation ─────────────────────────────────────────────────

export async function createDefaultAdmin(this: any): Promise<void> {
    const { generateSecurePassword } = await import('../config/security.js');

    const adminOrg = {
        id: generateId(),
        name: 'SYSTEM',
        createdAt: Date.now(),
    };

    const tempPassword = generateSecurePassword(16);
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);

    const adminUser = {
        id: generateId(),
        username: 'admin',
        password: hashedPassword,
        email: 'admin@ndtsuite.local',
        role: ROLES.ADMIN,
        organizationId: adminOrg.id,
        createdAt: Date.now(),
        isActive: true,
        requirePasswordChange: true,
    };

    const demoOrg = {
        id: generateId(),
        name: 'Demo Organization',
        createdAt: Date.now(),
    };

    this.authData.organizations = [adminOrg, demoOrg];
    this.authData.users = [adminUser];

    await saveAuthData(this.authData);

    if (process.env.NODE_ENV === 'development') {
        sessionStorage.setItem('_ndt_first_setup', JSON.stringify({
            username: 'admin',
            isFirstSetup: true,
            showOnce: true,
        }));
    }
}

// ── Local Login ────────────────────────────────────────────────────────────

export async function loginLocal(
    this: any,
    email: string,
    password: string,
): Promise<AuthResult> {
    const user = this.authData.users.find(
        (u: any) => (u.username === email || u.email === email) && u.isActive,
    );

    if (user && bcrypt.compareSync(password, user.password)) {
        this.currentUser = user;
        sessionStorage.setItem('currentUser', JSON.stringify(user));

        window.dispatchEvent(new CustomEvent('authStateChange', {
            detail: { session: { user } },
        }));

        return { success: true, user };
    }

    return { success: false, error: 'Invalid credentials' };
}

// ── Local Logout ───────────────────────────────────────────────────────────

export function logoutLocal(): void {
    sessionStorage.removeItem('currentUser');
    window.dispatchEvent(new CustomEvent('authStateChange', {
        detail: { session: null },
    }));
}

// ── Local Session ──────────────────────────────────────────────────────────

export function getSessionLocal(currentUser: AuthCurrentUser | null): any {
    return currentUser ? { user: currentUser } : null;
}

export function onAuthStateChangeLocal(
    currentUser: AuthCurrentUser | null,
    callback: (session: any) => void,
): () => void {
    const handler = (event: CustomEvent) => {
        callback(event.detail.session || (currentUser ? { user: currentUser } : null));
    };
    window.addEventListener('authStateChange', handler as EventListener);
    return () => window.removeEventListener('authStateChange', handler as EventListener);
}

// ── IndexedDB Persistence ──────────────────────────────────────────────────

export async function loadAuthData(): Promise<AuthData | null> {
    try {
        const isolatedData = await indexedDB.loadItem(AUTH_STORE_KEY);
        if (isolatedData) {
            return isolatedData;
        }

        const data = await indexedDB.loadData();
        const legacyAuthData = data[AUTH_STORE_KEY];

        if (legacyAuthData) {
            await indexedDB.saveItem(AUTH_STORE_KEY, legacyAuthData);
            return legacyAuthData;
        }

        return null;
    } catch (_error) {
        return null;
    }
}

export async function saveAuthData(authData: AuthData): Promise<boolean> {
    try {
        await indexedDB.saveItem(AUTH_STORE_KEY, authData);
        return true;
    } catch (_error) {
        return false;
    }
}
