// Supabase Client Configuration
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase project credentials
const SUPABASE_URL = 'https://cngschckqhfpwjcvsbad.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NjaGNrcWhmcHdqY3ZzYmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzOTI4OTIsImV4cCI6MjA3NDk2ODg5Mn0.Gl3Py3mSLCYhEwMsbucWGygg3QaAHR7Kf3wq2-9jDk0';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
           SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

export default supabase;
