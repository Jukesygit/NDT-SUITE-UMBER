/**
 * Environment Configuration Module
 * Centralizes all environment variables with validation and defaults
 */

class EnvironmentConfig {
    constructor() {
        this.config = this.loadAndValidateConfig();
        this.validateRequiredVariables();
    }

    loadAndValidateConfig() {
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
                enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
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

    validateRequiredVariables() {
        const { supabase } = this.config;

        // Check if Supabase is properly configured
        if (supabase.url && supabase.anonKey) {
            // Validate URL format
            try {
                const url = new URL(supabase.url);
                if (!url.hostname.includes('supabase')) {
                    console.warn('Warning: Supabase URL does not appear to be valid');
                }

                // Check for placeholder values
                if (supabase.url === 'your_supabase_project_url' ||
                    supabase.anonKey === 'your_supabase_anon_key') {
                    console.error('Error: Supabase credentials contain placeholder values');
                    console.info('Please copy .env.example to .env and add your actual credentials');
                    supabase.isConfigured = false;
                } else {
                    supabase.isConfigured = true;
                }
            } catch (error) {
                console.error('Error: Invalid Supabase URL format', error);
                supabase.isConfigured = false;
            }
        } else {
            if (this.config.app.isProduction) {
                console.error('Error: Supabase credentials are required in production');
                console.info('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
            } else {
                console.info('Info: Running in local mode (Supabase not configured)');
            }
            supabase.isConfigured = false;
        }

        // Additional security checks for production
        if (this.config.app.isProduction) {
            if (this.config.security.enableLocalAuth) {
                console.warn('Warning: Local authentication is enabled in production. This should be disabled.');
            }

            if (!this.config.app.url || this.config.app.url === window.location.origin) {
                console.warn('Warning: VITE_APP_URL should be explicitly set in production');
            }
        }
    }

    /**
     * Get a specific configuration value
     * @param {string} path - Dot-notation path to config value (e.g., 'supabase.url')
     * @returns {any} The configuration value
     */
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }

    /**
     * Check if Supabase is properly configured
     * @returns {boolean}
     */
    isSupabaseConfigured() {
        return this.config.supabase.isConfigured;
    }

    /**
     * Get the full configuration object (readonly)
     * @returns {Object}
     */
    getConfig() {
        return Object.freeze(JSON.parse(JSON.stringify(this.config)));
    }

    /**
     * Check if running in development mode
     * @returns {boolean}
     */
    isDevelopment() {
        return this.config.app.isDevelopment;
    }

    /**
     * Check if running in production mode
     * @returns {boolean}
     */
    isProduction() {
        return this.config.app.isProduction;
    }
}

// Create singleton instance
const environmentConfig = new EnvironmentConfig();

// Freeze to prevent modifications
Object.freeze(environmentConfig);

export default environmentConfig;