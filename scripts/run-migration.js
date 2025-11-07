import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mhqfxmxymlchfgcrgsfj.supabase.co';
const supabaseServiceKey = '***REDACTED_SERVICE_ROLE_KEY***';

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
