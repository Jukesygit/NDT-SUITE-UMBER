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

async function checkSchema() {
  console.log('Checking database schema...\n');

  // Get all tables
  const { data: tables, error: tablesError } = await supabase.rpc('get_tables');

  if (tablesError) {
    console.log('RPC not available, trying direct query...');

    // Try to get profiles table columns
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (!profilesError) {
      console.log('✅ profiles table exists');
      if (profiles && profiles.length > 0) {
        console.log('Profile columns:', Object.keys(profiles[0]).join(', '));
      }
    }

    // Try employee_competencies
    const { data: empComp, error: empCompError } = await supabase
      .from('employee_competencies')
      .select('*')
      .limit(1);

    if (!empCompError) {
      console.log('\n✅ employee_competencies table exists');
      if (empComp && empComp.length > 0) {
        console.log('employee_competencies columns:', Object.keys(empComp[0]).join(', '));
      }

      // Get all distinct field_name values
      const { data: allComps, error: allCompsError } = await supabase
        .from('employee_competencies')
        .select('field_name, field_type, category, display_name')
        .limit(1000);

      if (!allCompsError && allComps) {
        // Get unique competencies
        const competenciesMap = new Map();
        allComps.forEach(comp => {
          if (!competenciesMap.has(comp.field_name)) {
            competenciesMap.set(comp.field_name, comp);
          }
        });

        console.log(`\nTotal unique competencies: ${competenciesMap.size}\n`);

        // Group by category
        const byCategory = {};
        competenciesMap.forEach(comp => {
          const cat = comp.category || 'Uncategorized';
          if (!byCategory[cat]) {
            byCategory[cat] = [];
          }
          byCategory[cat].push(comp);
        });

        Object.keys(byCategory).sort().forEach(category => {
          console.log(`\n${category}:`);
          byCategory[category].forEach(comp => {
            const displayName = comp.display_name || comp.field_name.replace(/_/g, ' ');
            console.log(`  - ${displayName} (${comp.field_name}) [${comp.field_type || 'unknown'}]`);
          });
        });
      }
    } else {
      console.log('\n❌ employee_competencies table not found:', empCompError.message);
    }

    // Try competencies_metadata or similar
    const { data: metaData, error: metaError } = await supabase
      .from('competencies_metadata')
      .select('*')
      .limit(10);

    if (!metaError) {
      console.log('\n✅ competencies_metadata table exists');
      if (metaData && metaData.length > 0) {
        console.log('Columns:', Object.keys(metaData[0]).join(', '));
        console.log('\nSample data:');
        metaData.forEach(item => console.log('  -', item));
      }
    }

  } else {
    console.log('Tables:', tables);
  }
}

checkSchema().catch(console.error);
