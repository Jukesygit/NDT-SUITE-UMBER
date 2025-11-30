import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProfiles() {
  console.log('Checking existing profiles in database...\n');

  const { data: profiles, error, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log(`Total profiles found: ${profiles?.length || 0}\n`);

  if (profiles && profiles.length > 0) {
    console.log('Sample profiles:');
    profiles.slice(0, 10).forEach(p => {
      console.log(`  - ${p.full_name || 'No name'} | Email: ${p.email || 'No email'} | Position: ${p.position || 'No position'}`);
      console.log(`    ID: ${p.id}`);
      if (p.employee_id) console.log(`    Employee ID: ${p.employee_id}`);
    });

    // Check for specific employees from Excel
    console.log('\n\nSearching for specific employees from Excel:');
    const testNames = ['David Emery', 'Calum O\'Brien', 'Jonas Whitehead', 'Gavin Robb'];

    for (const name of testNames) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`full_name.ilike.%${name}%,email.ilike.%${name.split(' ')[0].toLowerCase()}%`);

      if (data && data.length > 0) {
        console.log(`\n✅ Found match for "${name}":`);
        data.forEach(d => {
          console.log(`   - ${d.full_name} (${d.email})`);
        });
      } else {
        console.log(`\n❌ No match for "${name}"`);
      }
    }
  } else {
    console.log('No profiles found in database.');
    console.log('\nYou may need to:');
    console.log('1. Create profiles for employees first');
    console.log('2. Or update the import script to create profiles automatically');
  }
}

checkProfiles().catch(console.error);