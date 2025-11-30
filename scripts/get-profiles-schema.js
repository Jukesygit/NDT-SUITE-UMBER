import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getProfilesSchema() {
  console.log('='.repeat(80));
  console.log('PROFILES TABLE SCHEMA');
  console.log('='.repeat(80));
  console.log();

  // Try to query the PostgreSQL information schema for exact column definitions
  let columns = null;
  let error = null;

  try {
    const result = await supabase.rpc('get_columns', { table_name: 'profiles' });
    columns = result.data;
    error = result.error;
  } catch (rpcError) {
    error = rpcError;
  }

  if (error || !columns) {
    console.log('Direct schema query not available. Using sample data method...\n');

    // Fallback: Get sample data and infer types
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (profileError) {
      console.error('Error querying profiles:', profileError);
      return;
    }

    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      const columnNames = Object.keys(profile);

      console.log(`Total Columns: ${columnNames.length}\n`);
      console.log('-'.repeat(80));
      console.log(`${'COLUMN NAME'.padEnd(40)} | ${'TYPE (inferred)'.padEnd(20)} | VALUE`);
      console.log('-'.repeat(80));

      columnNames.sort().forEach(colName => {
        const value = profile[colName];
        let inferredType = 'unknown';

        if (value === null) {
          inferredType = 'nullable';
        } else if (typeof value === 'string') {
          if (value.match(/^\d{4}-\d{2}-\d{2}(T|\s)/)) {
            inferredType = 'timestamp/date';
          } else if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            inferredType = 'uuid';
          } else {
            inferredType = 'text/varchar';
          }
        } else if (typeof value === 'number') {
          inferredType = Number.isInteger(value) ? 'integer' : 'numeric';
        } else if (typeof value === 'boolean') {
          inferredType = 'boolean';
        } else if (typeof value === 'object') {
          inferredType = 'json/jsonb';
        }

        const displayValue = value === null ? 'NULL' :
                           typeof value === 'object' ? JSON.stringify(value).substring(0, 30) + '...' :
                           String(value).substring(0, 30);

        console.log(`${colName.padEnd(40)} | ${inferredType.padEnd(20)} | ${displayValue}`);
      });

      console.log('-'.repeat(80));
      console.log();

      // Categorize columns
      console.log('\n' + '='.repeat(80));
      console.log('COLUMN CATEGORIES');
      console.log('='.repeat(80));
      console.log();

      const categories = {
        'Core Identity': [],
        'Personal Details': [],
        'Contact Information': [],
        'Employment': [],
        'Certifications/Training': [],
        'System Fields': []
      };

      columnNames.forEach(col => {
        const lower = col.toLowerCase();

        if (['id', 'user_id', 'employee_id', 'full_name', 'first_name', 'last_name'].includes(lower)) {
          categories['Core Identity'].push(col);
        } else if (lower.includes('date_of_birth') || lower.includes('next_of_kin') ||
                   lower.includes('emergency') || lower.includes('address') ||
                   lower.includes('postcode')) {
          categories['Personal Details'].push(col);
        } else if (lower.includes('email') || lower.includes('mobile') ||
                   lower.includes('phone') || lower.includes('telephone')) {
          categories['Contact Information'].push(col);
        } else if (lower.includes('position') || lower.includes('department') ||
                   lower.includes('role') || lower.includes('status') ||
                   lower.includes('station')) {
          categories['Employment'].push(col);
        } else if (lower.includes('expiry') || lower.includes('certification') ||
                   lower.includes('training') || lower.includes('competenc') ||
                   lower.includes('passport') || lower.includes('medical') ||
                   lower.includes('irata') || lower.includes('bosiet') ||
                   lower.includes('api') || lower.includes('cswip') ||
                   lower.includes('bindt') || lower.includes('ndt')) {
          categories['Certifications/Training'].push(col);
        } else if (lower.includes('created') || lower.includes('updated') ||
                   lower.includes('modified') || lower.includes('avatar')) {
          categories['System Fields'].push(col);
        }
      });

      Object.entries(categories).forEach(([category, cols]) => {
        if (cols.length > 0) {
          console.log(`\n${category} (${cols.length} columns):`);
          cols.forEach(col => console.log(`  - ${col}`));
        }
      });

      // Summary statistics
      console.log('\n' + '='.repeat(80));
      console.log('SUMMARY');
      console.log('='.repeat(80));
      console.log(`Total columns: ${columnNames.length}`);
      Object.entries(categories).forEach(([category, cols]) => {
        if (cols.length > 0) {
          console.log(`  ${category}: ${cols.length}`);
        }
      });

      // Export for easy reference
      console.log('\n' + '='.repeat(80));
      console.log('COLUMN LIST (for copy/paste)');
      console.log('='.repeat(80));
      console.log(columnNames.join(',\n'));

    } else {
      console.log('No profiles found in database. Cannot determine schema.');
      console.log('Try creating a sample profile first.');
    }

  } else {
    // Display schema from information_schema
    console.log(`Total Columns: ${columns.length}\n`);
    console.log('-'.repeat(100));
    console.log(`${'COLUMN NAME'.padEnd(40)} | ${'DATA TYPE'.padEnd(20)} | ${'NULLABLE'.padEnd(10)} | DEFAULT`);
    console.log('-'.repeat(100));

    columns.forEach(col => {
      const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      const dataType = `${col.data_type}${maxLength}`;
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default || '-';

      console.log(`${col.column_name.padEnd(40)} | ${dataType.padEnd(20)} | ${nullable.padEnd(10)} | ${defaultVal}`);
    });

    console.log('-'.repeat(100));
  }
}

getProfilesSchema().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});
