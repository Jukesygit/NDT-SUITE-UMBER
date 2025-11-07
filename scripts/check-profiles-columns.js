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

async function checkProfilesColumns() {
  console.log('Checking profiles table structure...\n');

  // Get a sample profile to see all columns
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying profiles:', error);
    return;
  }

  if (profiles && profiles.length > 0) {
    const columns = Object.keys(profiles[0]);
    console.log(`=== PROFILES TABLE HAS ${columns.length} COLUMNS ===\n`);

    // Categorize columns
    const personalDetails = [];
    const competencyLike = [];
    const standard = [];

    columns.forEach(col => {
      const lowerCol = col.toLowerCase();
      if (lowerCol.includes('mobile') || lowerCol.includes('email') ||
          lowerCol.includes('address') || lowerCol.includes('next_of_kin') ||
          lowerCol.includes('date_of_birth') || lowerCol.includes('train_station')) {
        personalDetails.push(col);
      } else if (lowerCol.includes('expiry') || lowerCol.includes('certification') ||
                 lowerCol.includes('competenc') || lowerCol.includes('training') ||
                 lowerCol.includes('irata') || lowerCol.includes('passport') ||
                 lowerCol.includes('medical') || lowerCol.includes('bosiet') ||
                 lowerCol.includes('api') || lowerCol.includes('cswip') ||
                 lowerCol.includes('bindt') || lowerCol.includes('ndt')) {
        competencyLike.push(col);
      } else {
        standard.push(col);
      }
    });

    console.log('STANDARD COLUMNS:');
    standard.forEach(col => console.log(`  - ${col}`));

    if (personalDetails.length > 0) {
      console.log('\nPERSONAL DETAIL COLUMNS:');
      personalDetails.forEach(col => console.log(`  - ${col}`));
    }

    if (competencyLike.length > 0) {
      console.log('\nCOMPETENCY/CERTIFICATION-LIKE COLUMNS:');
      competencyLike.forEach(col => console.log(`  - ${col}`));
    }

    console.log(`\n\nTotal columns: ${columns.length}`);
    console.log(`  Standard: ${standard.length}`);
    console.log(`  Personal Details: ${personalDetails.length}`);
    console.log(`  Competency-like: ${competencyLike.length}`);

    if (competencyLike.length > 0) {
      console.log('\n⚠️  IMPORTANT: Found competency-like columns in profiles table!');
      console.log('This suggests competencies may be stored as individual columns,');
      console.log('not in a separate competency_definitions table.');
    }
  } else {
    console.log('No profiles found in database');
  }
}

checkProfilesColumns().catch(console.error);
