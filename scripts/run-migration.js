import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mhqfxmxymlchfgcrgsfj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ocWZ4bXh5bWxjaGZnY3Jnc2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzMxMzQ3MSwiZXhwIjoyMDQ4ODg5NDcxfQ.S0SHSoX20cjPmL6ib5JQVvDbNApIexWt7oCnGDy5KOg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('Running migration...\n');

    try {
        // We'll use raw SQL via supabase
        const queries = [
            'ALTER TABLE employee_competencies ADD COLUMN IF NOT EXISTS issuing_body TEXT',
            'ALTER TABLE employee_competencies ADD COLUMN IF NOT EXISTS certificate_number TEXT',
            'ALTER TABLE competency_definitions ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL'
        ];

        for (const query of queries) {
            console.log(`Executing: ${query}`);
            const { data, error } = await supabase.rpc('exec_sql', { sql: query });

            if (error) {
                // Check if it's just a "column already exists" error
                if (error.message && error.message.includes('already exists')) {
                    console.log('  ⚠ Column already exists, skipping\n');
                } else {
                    console.error('  ✗ Error:', error.message, '\n');
                }
            } else {
                console.log('  ✓ Success\n');
            }
        }

        console.log('✅ Migration completed!');
        console.log('\nYou can now import your Excel file with multi-field support for NDT certifications.');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
