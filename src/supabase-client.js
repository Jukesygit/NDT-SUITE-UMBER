// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js';
import environmentConfig from './config/environment.js';

// Get Supabase credentials from secure config
const SUPABASE_URL = environmentConfig.get('supabase.url');
const SUPABASE_ANON_KEY = environmentConfig.get('supabase.anonKey');

// Create Supabase client only if properly configured
let supabase = null;

if (environmentConfig.isSupabaseConfigured()) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: window.localStorage, // Explicit storage for better control
                storageKey: 'ndt-suite-auth', // Custom key to avoid conflicts
                flowType: 'pkce' // More secure flow for SPAs
            },
            global: {
                headers: {
                    'x-client-info': 'ndt-suite-web'
                }
            },
            db: {
                schema: 'public'
            },
            realtime: {
                params: {
                    eventsPerSecond: 10 // Rate limiting for realtime
                }
            }
        });

        console.log('Supabase client initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        supabase = null;
    }
} else {
    console.info('Supabase not configured - running in local mode');
}

// Export the client (will be null if not configured)
export { supabase };

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return environmentConfig.isSupabaseConfigured() && supabase !== null;
}

export default supabase;
