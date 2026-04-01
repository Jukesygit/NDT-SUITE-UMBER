/**
 * Environment Configuration Module
 * Centralizes all environment variables with validation and defaults
 */

interface SupabaseConfig {
    url: string;
    anonKey: string;
    isConfigured: boolean;
}

interface AppConfig {
    url: string;
    environment: string;
    isDevelopment: boolean;
    isProduction: boolean;
    enableAnalytics: boolean;
    maintenanceMode: boolean;
}

interface SecurityConfig {
    enableLocalAuth: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
}

interface EnvironmentConfigData {
    supabase: SupabaseConfig;
    app: AppConfig;
    security: SecurityConfig;
    [key: string]: unknown;
}

class EnvironmentConfig {
    private config: EnvironmentConfigData;

    constructor() {
        this.config = this.loadAndValidateConfig();
        this.validateRequiredVariables();
    }

    private loadAndValidateConfig(): EnvironmentConfigData {
        return {
            supabase: {
                url: import.meta.env.VITE_SUPABASE_URL || '',
                anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                isConfigured: false // Will be set in validation
            },
            app: {
                url: import.meta.env.VITE_APP_URL || window.location.origin,
                environment: import.meta.env.MODE || 'development',
                isDevelopment: import.meta.env.DEV || false,
                isProduction: import.meta.env.PROD || false,
                enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
                maintenanceMode: import.meta.env.VITE_MAINTENANCE_MODE === 'true'
            },
            security: {
                // Security settings that should never be in client code
                enableLocalAuth: import.meta.env.VITE_ENABLE_LOCAL_AUTH !== 'false', // Default true for dev
                sessionTimeout: parseInt(import.meta.env.VITE_SESSION_TIMEOUT) || 3600000, // 1 hour
                maxLoginAttempts: parseInt(import.meta.env.VITE_MAX_LOGIN_ATTEMPTS) || 5,
                lockoutDuration: parseInt(import.meta.env.VITE_LOCKOUT_DURATION) || 900000 // 15 minutes
            }
        };
    }

    private validateRequiredVariables(): void {
        const { supabase } = this.config;

        // Check if Supabase is properly configured
        if (supabase.url && supabase.anonKey) {
            // Validate URL format
            try {
                new URL(supabase.url);

                // Check for placeholder values
                if (supabase.url === 'your_supabase_project_url' ||
                    supabase.anonKey === 'your_supabase_anon_key') {
                    supabase.isConfigured = false;
                } else {
                    supabase.isConfigured = true;
                }
            } catch (error) {
                supabase.isConfigured = false;
            }
        } else {
            supabase.isConfigured = false;
        }

    }

    /**
     * Get a specific configuration value
     */
    get(path: string): unknown {
        return path.split('.').reduce((obj: unknown, key: string) => (obj as Record<string, unknown>)?.[key], this.config);
    }

    /**
     * Check if Supabase is properly configured
     */
    isSupabaseConfigured(): boolean {
        return this.config.supabase.isConfigured;
    }

    /**
     * Get the full configuration object (readonly)
     */
    getConfig(): Readonly<EnvironmentConfigData> {
        return Object.freeze(JSON.parse(JSON.stringify(this.config)));
    }

    /**
     * Check if running in development mode
     */
    isDevelopment(): boolean {
        return this.config.app.isDevelopment;
    }

    /**
     * Check if running in production mode
     */
    isProduction(): boolean {
        return this.config.app.isProduction;
    }

    /**
     * Check if app is in maintenance mode (PII lockdown - tools only)
     */
    isMaintenanceMode(): boolean {
        return this.config.app.maintenanceMode;
    }
}

// Create singleton instance
const environmentConfig = new EnvironmentConfig();

// Freeze to prevent modifications
Object.freeze(environmentConfig);

export default environmentConfig;
