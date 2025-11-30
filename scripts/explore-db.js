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
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

console.log('Using Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function exploreDatabase() {
  console.log('Exploring database structure...\n');

  // Try to query profiles table to see its structure
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (profilesError) {
    console.log('Error querying profiles:', profilesError);
  } else if (profiles && profiles.length > 0) {
    console.log('=== PROFILES TABLE COLUMNS ===');
    console.log(Object.keys(profiles[0]).join(', '));
    console.log('\n');
  }

  // Try competency_categories
  const { data: categories, error: catError } = await supabase
    .from('competency_categories')
    .select('*');

  if (!catError && categories) {
    console.log('=== COMPETENCY CATEGORIES ===');
    console.log(`Total: ${categories.length}\n`);
    categories.forEach(cat => {
      console.log(`- ${cat.name} (${cat.id})`);
    });
    console.log('\n');
  } else {
    console.log('Error querying competency_categories:', catError);
  }

  // Try competency_definitions with different approaches
  console.log('=== TRYING COMPETENCY_DEFINITIONS ===\n');

  // Approach 1: Simple select all
  const { data: defs1, error: err1, count: count1 } = await supabase
    .from('competency_definitions')
    .select('*', { count: 'exact' });

  console.log('Approach 1 - Select all:');
  console.log('  Error:', err1?.message || 'none');
  console.log('  Count:', count1);
  console.log('  Data length:', defs1?.length || 0);
  if (defs1 && defs1.length > 0) {
    console.log('  Sample:', defs1[0]);
  }
  console.log('\n');

  // Approach 2: Select with is_active = true
  const { data: defs2, error: err2 } = await supabase
    .from('competency_definitions')
    .select('*')
    .eq('is_active', true);

  console.log('Approach 2 - Select where is_active = true:');
  console.log('  Error:', err2?.message || 'none');
  console.log('  Data length:', defs2?.length || 0);
  console.log('\n');

  // Approach 3: Select without RLS (might need service role key)
  const { data: defs3, error: err3 } = await supabase
    .from('competency_definitions')
    .select('id, name, field_type');

  console.log('Approach 3 - Select specific fields:');
  console.log('  Error:', err3?.message || 'none');
  console.log('  Data length:', defs3?.length || 0);
  if (defs3 && defs3.length > 0) {
    console.log('  First 5 competencies:');
    defs3.slice(0, 5).forEach(comp => {
      console.log(`    - ${comp.name} (${comp.field_type})`);
    });
  }
  console.log('\n');

  // Check employee_competencies structure
  const { data: empComp, error: empError } = await supabase
    .from('employee_competencies')
    .select('*')
    .limit(1);

  if (!empError && empComp && empComp.length > 0) {
    console.log('=== EMPLOYEE_COMPETENCIES STRUCTURE ===');
    console.log('Columns:', Object.keys(empComp[0]).join(', '));
    console.log('\n');
  }

  // Check if there's a view or different table name
  console.log('=== CHECKING FOR ALTERNATE STRUCTURES ===\n');

  const tableNames = [
    'competencies',
    'certification_types',
    'qualification_types',
    'training_types'
  ];

  for (const tableName of tableNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (!error && data) {
      console.log(`✅ Found table: ${tableName}`);
      if (data.length > 0) {
        console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
      }
    }
  }
}

exploreDatabase().catch(console.error);
