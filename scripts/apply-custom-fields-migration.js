import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://mhqfxmxymlchfgcrgsfj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ocWZ4bXh5bWxjaGZnY3Jnc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzMTM0NzEsImV4cCI6MjA0ODg4OTQ3MX0.aBGSkuYhh5EIMEkptLBNODH3VwHtZT0XkU6c5w-1CnU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    console.log('Applying custom fields migration...');

    try {
        // Add columns to employee_competencies
        const { error: error1 } = await supabase.rpc('exec_sql', {
            sql: `
                ALTER TABLE employee_competencies
                ADD COLUMN IF NOT EXISTS issuing_body TEXT,
                ADD COLUMN IF NOT EXISTS certificate_number TEXT;
            `
        });

        if (error1 && !error1.message.includes('already exists')) {
            console.error('Error adding columns:', error1);
        } else {
            console.log('✓ Added issuing_body and certificate_number columns');
        }

        // Add custom_fields to competency_definitions
        const { error: error2 } = await supabase.rpc('exec_sql', {
            sql: `
                ALTER TABLE competency_definitions
                ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL;
            `
        });

        if (error2 && !error2.message.includes('already exists')) {
            console.error('Error adding custom_fields:', error2);
        } else {
            console.log('✓ Added custom_fields column to competency_definitions');
        }

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

applyMigration();
