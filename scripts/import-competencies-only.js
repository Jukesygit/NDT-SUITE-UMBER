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

const EXCEL_PATH = "C:\\Users\\jonas\\OneDrive\\Documents\\MAI-LR-IMS-005 Training and Competency Matrix_Live Data Hub import.xlsx";

// Define the competency mappings
const COMPETENCY_COLUMNS = [
  // Workplace Health and Safety
  { col: 13, name: 'H&S Induction Completed', category: 'Health & Safety', isDate: true },
  { col: 14, name: 'DSE Questionnaire Completed', category: 'Health & Safety' },
  { col: 15, name: 'Driving Licence Expiry Date', category: 'Licenses', isDate: true },
  { col: 21, name: 'PPE Issued', category: 'Health & Safety' },
  { col: 22, name: 'Policies & Procedures Issued', category: 'Induction Process' },

  // Mandatory Offshore Training
  { col: 23, name: 'Vantage No', category: 'Offshore Training' },
  { col: 24, name: 'BOSIET / FOET Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 26, name: 'Offshore Medical Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 28, name: 'MIST Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 30, name: 'PSL 44 Vision Test Expiry', category: 'Medical', isDate: true },

  // Onshore Training
  { col: 32, name: 'CCNSG / CSCS Safety Passport Expiry Date', category: 'Onshore Training', isDate: true },

  // Rope Access
  { col: 33, name: 'IRATA Level and No.', category: 'Rope Access' },
  { col: 34, name: 'IRATA Expiry Date', category: 'Rope Access', isDate: true },
  { col: 35, name: 'Logbook Entry', category: 'Rope Access', isDate: true },

  // Training
  { col: 37, name: 'First Aid at Work Expiry', category: 'Training', isDate: true },
  { col: 47, name: 'Project Management (PFQ/PMQ)', category: 'Professional Registration' },

  // Plant API and Visual
  { col: 53, name: 'API 510 Pressure Vessel', category: 'Plant Inspection' },
  { col: 54, name: 'API 570 Pipework', category: 'Plant Inspection' },
  { col: 56, name: 'CSWIP Plant Inspector Level 3', category: 'Plant Inspection' },
  { col: 57, name: 'CSWIP Plant Inspector Level 2', category: 'Plant Inspection' },
  { col: 58, name: 'CSWIP 3.2 (Snr Weld Inspector)', category: 'Welding Inspection' },
  { col: 59, name: 'CSWIP 3.1 (Weld Inspector)', category: 'Welding Inspection' },
  { col: 60, name: 'CSWIP 3.0 (Visual Inspection)', category: 'Welding Inspection' },

  // NDT
  { col: 65, name: 'PCN Number', category: 'NDT' },
  { col: 70, name: 'EN 9712 PAUT L2', category: 'NDT' },
  { col: 72, name: 'EN 9712 TOFD L2', category: 'NDT' },
  { col: 78, name: 'EN 9712 MUT L2 3.8/3.9', category: 'NDT' },
  { col: 80, name: 'EN 9712 MUT L2 3.1/3.2', category: 'NDT' },
  { col: 86, name: 'EN 9712 MPI L2', category: 'NDT' },
  { col: 88, name: 'EN 9712 LPI L2', category: 'NDT' },
  { col: 90, name: 'EN 9712 VIS L2', category: 'NDT' },

  // UAV
  { col: 94, name: 'Flyer ID', category: 'UAV' },

  // GWO
  { col: 102, name: 'Fire Awareness', category: 'GWO', isDate: true },
  { col: 103, name: 'First Aid', category: 'GWO', isDate: true },
  { col: 104, name: 'Sea Survival', category: 'GWO', isDate: true },
  { col: 105, name: 'Working at Height', category: 'GWO', isDate: true },
  { col: 106, name: 'Manual Handling', category: 'GWO', isDate: true }
];

function parseExcelDate(excelDate) {
  if (!excelDate || excelDate === 'N/A' || excelDate === 'N' || excelDate === 'NA' || excelDate === 'MAI' || excelDate === 'TBC') {
    return null;
  }

  // Check if it's already a date string
  if (typeof excelDate === 'string') {
    // Handle special formats like "28/05/28" or "17th Feb 2026"
    if (excelDate.match(/^\d{2}\/\d{2}\/\d{2}$/)) {
      // DD/MM/YY format
      const parts = excelDate.split('/');
      const year = parseInt(parts[2]) < 50 ? 2000 + parseInt(parts[2]) : 1900 + parseInt(parts[2]);
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const parsed = new Date(excelDate);
    if (!isNaN(parsed)) {
      return parsed.toISOString().split('T')[0];
    }
    return null;
  }

  // Excel serial number to date
  if (typeof excelDate === 'number' && excelDate > 0) {
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }

  return null;
}

async function loadExcelData() {
  console.log('Loading Excel data...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  const mainSheet = 'MAI-LR-IMS-005 Training and Com';
  const worksheet = workbook.Sheets[mainSheet];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

  let dataStartRow = -1;
  for (let i = 0; i < 10; i++) {
    if (jsonData[i] && jsonData[i][0] === 'Employee Name') {
      dataStartRow = i + 2;
      break;
    }
  }

  console.log(`Data starts at row ${dataStartRow}`);
  return { jsonData, dataStartRow };
}

async function exportToJSON() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Exporting Excel data to JSON format...`);
  console.log(`${'='.repeat(60)}\n`);

  const { jsonData, dataStartRow } = await loadExcelData();

  const employees = [];
  const allCompetencies = [];

  // Process each employee row
  for (let rowIdx = dataStartRow; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];

    // Skip empty rows or header rows
    if (!row || !row[0] || row[0] === '' || row[0].includes('CONTRACTORS') || row[0].includes('New Start')) {
      continue;
    }

    const employee = {
      name: row[0],
      position: row[1],
      startDate: parseExcelDate(row[2]),
      dateOfBirth: parseExcelDate(row[3]),
      mobile: row[4],
      email: row[5],
      home_address: row[6],
      nearestStation: row[7],
      nextOfKin: row[8],
      nextOfKinContact: row[9],
      competencies: []
    };

    console.log(`📋 Processing: ${employee.name} (${employee.position || 'No position'})`);

    // Extract competencies for this employee
    for (const comp of COMPETENCY_COLUMNS) {
      const value = row[comp.col];

      // Skip empty or N/A values
      if (!value || value === 'N/A' || value === 'N' || value === '' || value === 'TBC') continue;

      const competency = {
        employee_name: employee.name,
        employee_email: employee.email,
        competency_name: comp.name,
        competency_type: comp.category,
        issuing_body: null,
        certificate_number: null,
        date_achieved: null,
        expiry_date: null,
        status: 'current',
        raw_value: value
      };

      // Handle different value types
      if (comp.isDate || typeof value === 'number') {
        const parsedDate = parseExcelDate(value);
        if (parsedDate) {
          if (comp.isDate) {
            competency.expiry_date = parsedDate;
            // Set status based on expiry
            const expDate = new Date(parsedDate);
            const today = new Date();
            if (expDate < today) {
              competency.status = 'expired';
            } else if (expDate < new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) {
              competency.status = 'expiring_soon';
            }
          } else {
            competency.date_achieved = parsedDate;
          }
        }
      } else if (typeof value === 'string') {
        // Check for specific patterns
        if (value.match(/^[A-Z0-9\-\/\s]+$/i) && value.length < 50 && !value.includes('MAI')) {
          competency.certificate_number = value;
        }
      }

      // Try to find issuing body from adjacent cells
      for (let checkRow = rowIdx + 1; checkRow < Math.min(rowIdx + 3, jsonData.length); checkRow++) {
        const checkData = jsonData[checkRow];
        if (checkData && checkData[comp.col]) {
          const cellValue = checkData[comp.col];
          if (typeof cellValue === 'string' &&
              (cellValue.includes('PCN') || cellValue.includes('CSWIP') || cellValue.includes('API') ||
               cellValue.includes('TWI') || cellValue.includes('SGS') || cellValue === 'Matrix-AI' ||
               cellValue === 'Matrix' || cellValue === 'UK Civil Aviation' || cellValue === 'Flyability')) {
            competency.issuing_body = cellValue;
            break;
          }
        }
      }

      employee.competencies.push(competency);
      allCompetencies.push(competency);
    }

    console.log(`  📊 Found ${employee.competencies.length} competencies`);
    employees.push(employee);
  }

  // Save to JSON files
  const outputDir = path.join(__dirname, 'export');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Save employees with embedded competencies
  fs.writeFileSync(
    path.join(outputDir, 'employees-with-competencies.json'),
    JSON.stringify(employees, null, 2)
  );

  // Save flat competencies list
  fs.writeFileSync(
    path.join(outputDir, 'all-competencies.json'),
    JSON.stringify(allCompetencies, null, 2)
  );

  // Save summary
  const summary = {
    totalEmployees: employees.length,
    totalCompetencies: allCompetencies.length,
    competencyCategories: [...new Set(allCompetencies.map(c => c.competency_type))],
    employeeList: employees.map(e => ({
      name: e.name,
      email: e.email,
      position: e.position,
      competencyCount: e.competencies.length
    }))
  };

  fs.writeFileSync(
    path.join(outputDir, 'import-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n' + '='.repeat(60));
  console.log('📈 EXPORT COMPLETE:');
  console.log(`  Total employees: ${employees.length}`);
  console.log(`  Total competencies: ${allCompetencies.length}`);
  console.log('\n📁 Files created:');
  console.log(`  - export/employees-with-competencies.json`);
  console.log(`  - export/all-competencies.json`);
  console.log(`  - export/import-summary.json`);
  console.log('='.repeat(60) + '\n');

  console.log('📝 Next steps:');
  console.log('1. Review the exported JSON files');
  console.log('2. Create user accounts in Supabase Auth manually or via the dashboard');
  console.log('3. Use the JSON data to populate profiles and competencies');
  console.log('\n💡 You can also use these JSON files to:');
  console.log('   - Import data via Supabase dashboard');
  console.log('   - Create a custom import script with proper auth');
  console.log('   - Share data with your development team');
}

// Main execution
exportToJSON().catch(console.error);