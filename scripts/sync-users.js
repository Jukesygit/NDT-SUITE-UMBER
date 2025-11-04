// Script to sync auth users to profiles table
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://cngschckqhfpwjcvsbad.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NjaGNrcWhmcHdqY3ZzYmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM2ODM0NDksImV4cCI6MjA0OTI1OTQ0OX0.Q9o-jH0kHZVWFhtRbTUdXTz8jxzX-GZ_bKlqt1_zqZw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUsers() {
    console.log('Starting user sync...');

    try {
        // Step 1: Apply the trigger fix
        console.log('Step 1: Applying trigger fix...');
        const triggerSql = fs.readFileSync('./database/fix-user-creation-trigger.sql', 'utf8');
        const { error: triggerError } = await supabase.rpc('exec_sql', { sql: triggerSql });

        if (triggerError) {
            console.warn('Could not apply trigger (might need service role):', triggerError.message);
        } else {
            console.log('✓ Trigger fix applied');
        }

        // Step 2: Get all profiles to see what we have
        console.log('\nStep 2: Checking existing profiles...');
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, email, role, created_at')
            .order('created_at', { ascending: false });

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
            return;
        }

        console.log(`Found ${profiles.length} existing profiles:`);
        profiles.forEach((p, i) => {
            if (i < 10) { // Show first 10
                console.log(`  - ${p.username} (${p.email}) - ${p.role} - ${new Date(p.created_at).toLocaleString()}`);
            }
        });
        if (profiles.length > 10) {
            console.log(`  ... and ${profiles.length - 10} more`);
        }

        console.log('\n✅ Sync check complete!');
        console.log('\nIf you see your imported employees above, the import worked.');
        console.log('If not, the profiles may not have been created due to the trigger issue.');
        console.log('\nTo fix this, you need to:');
        console.log('1. Apply the trigger fix SQL manually in the Supabase dashboard');
        console.log('2. Re-import the CSV file');

    } catch (error) {
        console.error('Error during sync:', error);
    }
}

syncUsers();
