// Supabase Client Configuration
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import environmentConfig from './config/environment';

// Get Supabase credentials from secure config
const SUPABASE_URL = environmentConfig.get('supabase.url') as string;
const SUPABASE_ANON_KEY = environmentConfig.get('supabase.anonKey') as string;

// Create Supabase client only if properly configured
let supabase: SupabaseClient | null = null;

if (environmentConfig.isSupabaseConfigured()) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
                storageKey: 'ndt-suite-auth',
                flowType: 'pkce',
                // Disable navigator.locks — the default lock mechanism deadlocks when
                // DB queries (which call getSession() for the auth token) run immediately
                // after signInWithPassword, because signInWithPassword holds the lock
                // while notifying onAuthStateChange listeners. A no-op lock is safe here
                // because this is a single-tab SPA (no cross-tab session coordination needed).
                lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
                    return await fn();
                },
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

    } catch (error) {
        supabase = null;
    }
}

// Export the client (will be null if not configured)
export { supabase };

// Get supabase client with non-null assertion for use in services
// Throws if called before Supabase is configured
export function getSupabase(): SupabaseClient {
    if (!supabase) throw new Error('Supabase client not initialized');
    return supabase;
}

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
    return environmentConfig.isSupabaseConfigured() && supabase !== null;
}

export default supabase;
