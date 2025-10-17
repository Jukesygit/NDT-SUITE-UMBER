// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js';

// Load Supabase credentials from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate that environment variables are set
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase credentials. Please check your .env file.');
    console.error('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
} else {
    console.log('Supabase URL configured:', SUPABASE_URL);
    console.log('Supabase anon key length:', SUPABASE_ANON_KEY?.length);
}

// Create Supabase client with options to support anonymous requests
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
    global: {
        headers: {
            'x-client-info': 'supabase-js-web'
        }
    },
    db: {
        schema: 'public'
    }
});

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return SUPABASE_URL && SUPABASE_ANON_KEY &&
           SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
           SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

export default supabase;
