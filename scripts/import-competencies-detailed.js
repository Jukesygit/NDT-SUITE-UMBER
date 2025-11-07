import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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

// Excel file path
const EXCEL_PATH = "C:\\Users\\jonas\\OneDrive\\Documents\\MAI-LR-IMS-005 Training and Competency Matrix_Live Data Hub import.xlsx";

async function analyzeDetailedStructure() {
  console.log('Analyzing Excel structure in detail...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_PATH);

    // Focus on the main training sheet
    const mainSheet = 'MAI-LR-IMS-005 Training and Com';
    const worksheet = workbook.Sheets[mainSheet];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Get full data with proper headers
    const dataWithHeaders = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    console.log('=== Analyzing Main Training Sheet ===');
    console.log(`Total rows: ${jsonData.length}`);

    // Find where actual data starts (after headers)
    let dataStartRow = -1;
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (row[0] && typeof row[0] === 'string' && row[0].includes('Employee Name')) {
        dataStartRow = i + 2; // Data typically starts 2 rows after header
        break;
      }
    }

    console.log(`Data starts at row: ${dataStartRow}`);

    // Extract column headers from the complex header structure
    const headers = [];
    const competencyStartCol = 10; // Competencies typically start after personal details

    // Get all unique column headers from rows 0-3
    for (let col = 0; col < jsonData[0]?.length; col++) {
      let header = null;
      for (let row = 0; row < 4; row++) {
        if (jsonData[row] && jsonData[row][col]) {
          header = jsonData[row][col];
          break;
        }
      }
      headers[col] = header;
    }

    console.log('\nDetected columns (first 30):');
    headers.slice(0, 30).forEach((h, idx) => {
      if (h) console.log(`  Col ${idx}: ${h}`);
    });

    // Analyze actual data rows
    console.log('\n=== Sample Employee Data ===');
    for (let i = dataStartRow; i < Math.min(dataStartRow + 3, jsonData.length); i++) {
      const row = jsonData[i];
      if (row && row[0]) {
        console.log(`\nEmployee: ${row[0]}`);
        console.log(`  Position: ${row[1]}`);
        console.log(`  Start Date: ${row[2]}`);
        console.log(`  Date of Birth: ${row[3]}`);
        console.log(`  Mobile: ${row[4]}`);
        console.log(`  Email: ${row[5]}`);
      }
    }

    return { jsonData, headers, dataStartRow };

  } catch (error) {
    console.error('Error analyzing Excel:', error);
    return null;
  }
}

async function checkExistingData() {
  console.log('\n=== Checking Existing Database Data ===');

  try {
    // Check employee_competencies table structure
    const { data: competencies, error: compError } = await supabase
      .from('employee_competencies')
      .select('*')
      .limit(5);

    if (compError) {
      console.error('Error checking employee_competencies table:', compError);
    } else {
      console.log('\nEmployee competencies table exists');
      if (competencies && competencies.length > 0) {
        console.log('Sample competency structure:');
        console.log(JSON.stringify(competencies[0], null, 2));

        // List all fields
        console.log('\nAvailable fields in employee_competencies:');
        Object.keys(competencies[0]).forEach(key => {
          console.log(`  - ${key}: ${typeof competencies[0][key]}`);
        });
      }
    }

    // Count existing records
    const { count, error: countError } = await supabase
      .from('employee_competencies')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`\nTotal existing competency records: ${count}`);
    }

    // Check profiles to match employees
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, full_name, email, position, employee_id')
      .limit(10);

    if (!profError && profiles) {
      console.log(`\nSample profiles (${profiles.length}):`)
      profiles.forEach(p => {
        console.log(`  - ${p.full_name} (${p.email}) - ID: ${p.id}`);
      });
    }

  } catch (error) {
    console.error('Database error:', error);
  }
}

async function mapCompetencyColumns(headers) {
  console.log('\n=== Mapping Competency Columns ===');

  const competencyMapping = [];
  const personalDetailsEndCol = 10; // Personal details typically end around column 10

  // Look for competency-related headers
  for (let i = personalDetailsEndCol; i < headers.length; i++) {
    const header = headers[i];
    if (header && typeof header === 'string') {
      // Check if this looks like a competency field
      if (header.includes('NDT') ||
          header.includes('IRATA') ||
          header.includes('Training') ||
          header.includes('Certificate') ||
          header.includes('PCN') ||
          header.includes('CSWIP') ||
          header.includes('Competency') ||
          header.includes('ISO') ||
          header.includes('Inspection')) {
        competencyMapping.push({
          columnIndex: i,
          competencyName: header,
          category: categorizeCompetency(header)
        });
      }
    }
  }

  console.log(`Found ${competencyMapping.length} potential competency columns`);

  // Group by category
  const byCategory = {};
  competencyMapping.forEach(cm => {
    if (!byCategory[cm.category]) byCategory[cm.category] = [];
    byCategory[cm.category].push(cm.competencyName);
  });

  console.log('\nCompetencies by category:');
  Object.entries(byCategory).forEach(([cat, comps]) => {
    console.log(`  ${cat}: ${comps.length} competencies`);
  });

  return competencyMapping;
}

function categorizeCompetency(name) {
  if (name.includes('NDT') || name.includes('Ultrasonic') || name.includes('MPI') || name.includes('TOFD')) {
    return 'NDT Techniques';
  }
  if (name.includes('IRATA') || name.includes('Rope')) {
    return 'Rope Access';
  }
  if (name.includes('H&S') || name.includes('Safety') || name.includes('Health')) {
    return 'Health & Safety';
  }
  if (name.includes('ISO') || name.includes('Quality')) {
    return 'Quality Systems';
  }
  if (name.includes('Training') || name.includes('Induction')) {
    return 'Training';
  }
  return 'Other Certifications';
}

async function main() {
  console.log('Starting detailed competency analysis...\n');

  // Analyze Excel structure
  const excelData = await analyzeDetailedStructure();

  if (!excelData) {
    console.error('Failed to analyze Excel structure');
    return;
  }

  // Check existing database data
  await checkExistingData();

  // Map competency columns
  const competencyMap = await mapCompetencyColumns(excelData.headers);

  console.log('\n\n=== Ready for Import ===');
  console.log('Next steps:');
  console.log('1. Match employee names/emails from Excel with profiles table');
  console.log('2. Extract competency data for each employee');
  console.log('3. Format data according to employee_competencies table structure');
  console.log('4. Insert/update competency records');
  console.log('\nRun the full import script when ready.');
}

main().catch(console.error);