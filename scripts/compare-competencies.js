import XLSX from 'xlsx';
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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function compareCompetencies() {
  console.log('Reading Excel file...\n');

  // Read the Excel file
  const excelPath = 'C:\\Users\\jonas\\OneDrive\\Documents\\MAI-LR-IMS-005 Training and Competency Matrix_Live Data Hub import.xlsx';
  const workbook = XLSX.readFile(excelPath);

  console.log('Available sheets:', workbook.SheetNames.join(', '));
  console.log('\n');

  // Get all competencies from Excel - they should be in the header row
  const excelCompetencies = new Set();
  const personalDetailsFields = new Set([
    'mobile number',
    'mobile_number',
    'email address',
    'email_address',
    'home address',
    'home_address',
    'nearest uk train station',
    'nearest_uk_train_station',
    'next of kin',
    'next_of_kin',
    'next of kin / emergency contact name',
    'next of kin emergency contact number',
    'next of kin / emergency contact number',
    'next_of_kin_emergency_contact_number',
    'date of birth',
    'date_of_birth',
    'ee details',
    'employee name',
    'name',
    'job positon',
    'start date',
    'personal details'
  ]);

  // Focus on the main sheet
  const mainSheetName = 'MAI-LR-IMS-005 Training and Com';
  const sheet = workbook.Sheets[mainSheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log(`=== Analyzing main sheet: ${mainSheetName} ===\n`);

  if (data.length > 0) {
    // Look for the header row - it might not be the first row
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      // A header row should have multiple non-empty cells
      const nonEmptyCells = row.filter(cell => cell && cell.toString().trim()).length;
      if (nonEmptyCells > 10) { // Assuming at least 10 competency columns
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log('Could not find header row. Trying first row...');
      headerRowIndex = 0;
    } else {
      console.log(`Found header row at index ${headerRowIndex}\n`);
    }

    const headers = data[headerRowIndex];
    console.log(`Total columns in header: ${headers.length}\n`);

    // Extract competency names from headers (skip first few columns which are employee details)
    headers.forEach((header, index) => {
      if (header && typeof header === 'string' && header.trim()) {
        const headerLower = header.trim().toLowerCase();
        const headerNormalized = headerLower.replace(/\s+/g, '_');

        // Skip employee detail columns and empty headers
        if (!personalDetailsFields.has(headerLower) &&
            !personalDetailsFields.has(headerNormalized) &&
            index > 0) { // Skip first column which is likely employee name
          excelCompetencies.add(headerLower);
        }
      }
    });
  }

  console.log('\n=== EXCEL COMPETENCIES (excluding personal details) ===');
  console.log(`Total: ${excelCompetencies.size}\n`);

  // Get competencies from database
  console.log('Fetching competencies from database...\n');

  const { data: dbCompetencies, error } = await supabase
    .from('competency_definitions')
    .select(`
      id,
      name,
      description,
      field_type,
      category:competency_categories(id, name)
    `)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching competencies:', error);
    process.exit(1);
  }

  console.log('=== DATABASE COMPETENCIES ===');
  console.log(`Total: ${dbCompetencies.length}\n`);

  const dbCompetencyNames = new Map();
  const competenciesByCategory = {};

  dbCompetencies.forEach(comp => {
    const nameLower = comp.name.toLowerCase();
    dbCompetencyNames.set(nameLower, comp);

    const category = comp.category?.name || 'Uncategorized';
    if (!competenciesByCategory[category]) {
      competenciesByCategory[category] = [];
    }
    competenciesByCategory[category].push(comp);
  });

  Object.keys(competenciesByCategory).sort().forEach(category => {
    console.log(`\n${category}:`);
    competenciesByCategory[category].forEach(comp => {
      console.log(`  - ${comp.name} [${comp.field_type}]`);
    });
  });

  // Compare
  console.log('\n\n=== COMPARISON ===\n');

  const missingInDb = [];
  const missingInExcel = [];

  excelCompetencies.forEach(excelComp => {
    if (!dbCompetencyNames.has(excelComp)) {
      missingInDb.push(excelComp);
    }
  });

  dbCompetencyNames.forEach((comp, dbCompName) => {
    if (!excelCompetencies.has(dbCompName) && !personalDetailsFields.has(dbCompName)) {
      missingInExcel.push(dbCompName);
    }
  });

  if (missingInDb.length > 0) {
    console.log(`❌ MISSING IN DATABASE (${missingInDb.length}):`);
    missingInDb.sort().forEach(comp => console.log(`  - ${comp}`));
  } else {
    console.log('✅ All Excel competencies exist in database');
  }

  console.log('\n');

  if (missingInExcel.length > 0) {
    console.log(`⚠️  IN DATABASE BUT NOT IN EXCEL (${missingInExcel.length}):`);
    missingInExcel.sort().forEach(comp => console.log(`  - ${comp}`));
    console.log('\nNote: These may be newly added competencies or renamed fields.');
  } else {
    console.log('✅ All database competencies exist in Excel');
  }

  console.log('\n\n=== SUMMARY ===');
  console.log(`Excel competencies: ${excelCompetencies.size}`);
  console.log(`Database competencies: ${dbCompetencies.length}`);
  console.log(`Missing in database: ${missingInDb.length}`);
  console.log(`Missing in Excel: ${missingInExcel.length}`);

  console.log('\n\n=== PERSONAL DETAILS (moved to profile page) ===');
  console.log('These fields are no longer competencies, they are on the profile page:');
  const movedFields = [
    'Mobile Number',
    'Email Address',
    'Home Address',
    'Nearest UK Train Station',
    'Next of Kin / Emergency Contact Name',
    'Next of Kin / Emergency Contact Number',
    'Date of Birth'
  ];
  movedFields.forEach(field => console.log(`  - ${field}`));

  // Export missing competencies to a file for easier review
  if (missingInDb.length > 0) {
    console.log('\n\nExporting missing competencies to missing-competencies.txt...');
    const outputPath = path.join(__dirname, 'missing-competencies.txt');
    const output = [
      '=== MISSING COMPETENCIES IN DATABASE ===',
      `Total: ${missingInDb.length}`,
      '',
      ...missingInDb.sort().map(c => `- ${c}`),
      '',
      '=== NOTES ===',
      '- Personal detail fields have been moved to the profile page',
      '- Some fields may have been renamed in the database',
      '- Review each field and add to competency_definitions if needed'
    ].join('\n');

    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`✅ Written to: ${outputPath}`);
  }
}

compareCompetencies().catch(console.error);
