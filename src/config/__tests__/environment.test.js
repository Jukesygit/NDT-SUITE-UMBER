/**
 * Tests for environment configuration module.
 * Note: The module creates a singleton on import, so we test the exported instance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock import.meta.env before the module loads
// Since the module is a singleton, we test the instance behavior

describe('EnvironmentConfig', () => {
    let environmentConfig;

    beforeEach(async () => {
        // Reset module registry so we get a fresh singleton each time
        vi.resetModules();
        // Set up env vars for the module
        import.meta.env.VITE_SUPABASE_URL = '';
        import.meta.env.VITE_SUPABASE_ANON_KEY = '';
        import.meta.env.VITE_MAINTENANCE_MODE = 'false';
        const mod = await import('../environment.js');
        environmentConfig = mod.default;
    });

    describe('get()', () => {
        it('retrieves nested config via dot notation', () => {
            const appEnv = environmentConfig.get('app.environment');
            expect(typeof appEnv).toBe('string');
        });

        it('returns undefined for non-existent paths', () => {
            expect(environmentConfig.get('nonexistent.path')).toBeUndefined();
        });

        it('retrieves security config', () => {
            const timeout = environmentConfig.get('security.sessionTimeout');
            expect(typeof timeout).toBe('number');
            expect(timeout).toBeGreaterThan(0);
        });
    });

    describe('isSupabaseConfigured()', () => {
        it('returns false when credentials are empty', () => {
            expect(environmentConfig.isSupabaseConfigured()).toBe(false);
        });
    });

    describe('getConfig()', () => {
        it('returns a frozen copy of the config', () => {
            const config = environmentConfig.getConfig();
            expect(config).toHaveProperty('supabase');
            expect(config).toHaveProperty('app');
            expect(config).toHaveProperty('security');
            // Should be frozen
            expect(Object.isFrozen(config)).toBe(true);
        });
    });

    describe('isDevelopment() / isProduction()', () => {
        it('returns boolean values', () => {
            expect(typeof environmentConfig.isDevelopment()).toBe('boolean');
            expect(typeof environmentConfig.isProduction()).toBe('boolean');
        });
    });

    describe('isMaintenanceMode()', () => {
        it('returns false by default', () => {
            expect(environmentConfig.isMaintenanceMode()).toBe(false);
        });
    });
});

describe('EnvironmentConfig with Supabase configured', () => {
    it('detects valid Supabase config', async () => {
        vi.resetModules();
        import.meta.env.VITE_SUPABASE_URL = 'https://project.supabase.co';
        import.meta.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
        const mod = await import('../environment.js');
        expect(mod.default.isSupabaseConfigured()).toBe(true);
    });

    it('rejects placeholder values', async () => {
        vi.resetModules();
        import.meta.env.VITE_SUPABASE_URL = 'your_supabase_project_url';
        import.meta.env.VITE_SUPABASE_ANON_KEY = 'your_supabase_anon_key';
        const mod = await import('../environment.js');
        expect(mod.default.isSupabaseConfigured()).toBe(false);
    });

    it('rejects invalid URL format', async () => {
        vi.resetModules();
        import.meta.env.VITE_SUPABASE_URL = 'not-a-url';
        import.meta.env.VITE_SUPABASE_ANON_KEY = 'some-key';
        const mod = await import('../environment.js');
        expect(mod.default.isSupabaseConfigured()).toBe(false);
    });
});
