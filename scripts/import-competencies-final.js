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

// Define the competency mappings based on the Excel structure
const COMPETENCY_COLUMNS = [
  // Workplace Health and Safety
  { col: 10, name: 'Certificate of Incorporation', category: 'Induction Process' },
  { col: 11, name: 'Company Number', category: 'Induction Process' },
  { col: 12, name: 'Company Insurance Expiry Date', category: 'Induction Process', isDate: true },
  { col: 13, name: 'H&S Induction Completed', category: 'Health & Safety', isDate: true },
  { col: 14, name: 'DSE Questionnaire Completed', category: 'Health & Safety' },
  { col: 15, name: 'Driving Licence Expiry Date', category: 'Licenses', isDate: true },
  { col: 16, name: 'Passport Primary', category: 'Documentation' },
  { col: 17, name: 'Primary Passport Expiry', category: 'Documentation', isDate: true },
  { col: 20, name: 'Pension Information', category: 'Administration' },
  { col: 21, name: 'PPE Issued', category: 'Health & Safety' },
  { col: 22, name: 'Policies & Procedures Issued', category: 'Induction Process' },

  // Mandatory Offshore Training
  { col: 23, name: 'Vantage No', category: 'Offshore Training' },
  { col: 24, name: 'BOSIET / FOET Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 25, name: 'Norwegian Escape Chute Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 26, name: 'Offshore Medical Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 27, name: 'Audiometry Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 28, name: 'MIST Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 29, name: 'DONUT Escape training Expiry Date', category: 'Offshore Training', isDate: true },
  { col: 30, name: 'PSL 44 Vision Test Expiry', category: 'Medical', isDate: true },

  // Onshore Training
  { col: 32, name: 'CCNSG / CSCS Safety Passport Expiry Date', category: 'Onshore Training', isDate: true },

  // Rope Access
  { col: 33, name: 'IRATA Level and No.', category: 'Rope Access' },
  { col: 34, name: 'IRATA Expiry Date', category: 'Rope Access', isDate: true },
  { col: 35, name: 'Logbook Entry', category: 'Rope Access', isDate: true },
  { col: 36, name: 'Logbook - 6 Monthly Check Due', category: 'Rope Access', isDate: true },

  // Training
  { col: 37, name: 'First Aid at Work Expiry', category: 'Training', isDate: true },
  { col: 38, name: 'Anti corruption and Bribery', category: 'Training' },
  { col: 39, name: 'IOSH', category: 'Training' },
  { col: 40, name: 'Fire Warden', category: 'Training' },
  { col: 41, name: 'Defib', category: 'Training' },
  { col: 42, name: 'Internal Training Record', category: 'Training' },
  { col: 43, name: 'Confined Space Entry', category: 'Training' },

  // Professional Registration
  { col: 45, name: 'IEng Incorporated Engineer', category: 'Professional Registration' },
  { col: 46, name: 'Engtech Engineering Technician', category: 'Professional Registration' },
  { col: 47, name: 'Project Management (PFQ/PMQ)', category: 'Professional Registration' },
  { col: 48, name: 'BINDT Registration', category: 'Professional Registration' },

  // Plant API and Visual
  { col: 50, name: 'ASME Plant Inspection L3', category: 'Plant Inspection' },
  { col: 51, name: 'ASME Plant Inspection L2', category: 'Plant Inspection' },
  { col: 52, name: 'ASME Plant Inspection L1', category: 'Plant Inspection' },
  { col: 53, name: 'API 510 Pressure Vessel', category: 'Plant Inspection' },
  { col: 54, name: 'API 570 Pipework', category: 'Plant Inspection' },
  { col: 55, name: 'API 653 Storage Tanks', category: 'Plant Inspection' },
  { col: 56, name: 'CSWIP Plant Inspector Level 3', category: 'Plant Inspection' },
  { col: 57, name: 'CSWIP Plant Inspector Level 2', category: 'Plant Inspection' },
  { col: 58, name: 'CSWIP 3.2 (Snr Weld Inspector)', category: 'Welding Inspection' },
  { col: 59, name: 'CSWIP 3.1 (Weld Inspector)', category: 'Welding Inspection' },
  { col: 60, name: 'CSWIP 3.0 (Visual Inspection)', category: 'Welding Inspection' },
  { col: 61, name: 'Flange Face Inspection and Remedials', category: 'Inspection' },
  { col: 62, name: 'ICorr Painting Inspector Level 1', category: 'Inspection' },
  { col: 64, name: 'Ceaform In House Training', category: 'Training' },

  // NDT
  { col: 65, name: 'PCN Number', category: 'NDT' },
  { col: 67, name: 'EN 9712 PAUT L3', category: 'NDT', isDate: true },
  { col: 68, name: 'EN 9712 TOFD L3', category: 'NDT', isDate: true },
  { col: 69, name: 'EN 9712 MUT L3', category: 'NDT', isDate: true },
  { col: 70, name: 'EN 9712 PAUT L2', category: 'NDT', isDate: true },
  { col: 72, name: 'EN 9712 TOFD L2', category: 'NDT', isDate: true },
  { col: 74, name: 'EN 9712 RAD L2', category: 'NDT', isDate: true },
  { col: 76, name: 'Basic Radiation Safety', category: 'NDT' },
  { col: 78, name: 'EN 9712 MUT L2 3.8/3.9', category: 'NDT', isDate: true },
  { col: 80, name: 'EN 9712 MUT L2 3.1/3.2', category: 'NDT', isDate: true },
  { col: 82, name: 'PEC L2 Training', category: 'NDT' },
  { col: 84, name: 'EN 9712 ECI L2', category: 'NDT', isDate: true },
  { col: 86, name: 'EN 9712 MPI L2', category: 'NDT', isDate: true },
  { col: 88, name: 'EN 9712 LPI L2', category: 'NDT', isDate: true },
  { col: 90, name: 'EN 9712 VIS L2', category: 'NDT', isDate: true },

  // UAV
  { col: 93, name: 'CAA PFCO / GVC Multi Rotor', category: 'UAV' },
  { col: 94, name: 'Flyer ID', category: 'UAV' },
  { col: 95, name: 'Internal UAV Training', category: 'UAV' },
  { col: 96, name: 'Currency 350', category: 'UAV' },
  { col: 97, name: 'Elios 2', category: 'UAV' },

  // Management Training
  { col: 99, name: 'ISO 17020 Awareness training', category: 'Management Systems' },
  { col: 100, name: 'ISO 9001 Training', category: 'Management Systems' },

  // GWO
  { col: 102, name: 'Fire Awareness', category: 'GWO' },
  { col: 103, name: 'First Aid', category: 'GWO' },
  { col: 104, name: 'Sea Survival', category: 'GWO' },
  { col: 105, name: 'Working at Height', category: 'GWO' },
  { col: 106, name: 'Manual Handling', category: 'GWO' },
  { col: 107, name: 'Blade Repair', category: 'GWO' }
];

function parseExcelDate(excelDate) {
  if (!excelDate || excelDate === 'N/A' || excelDate === 'N' || excelDate === 'NA') {
    return null;
  }

  // Check if it's already a date string (e.g., "28/05/28" or "17th Feb 2026")
  if (typeof excelDate === 'string') {
    // Try to parse various date formats
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

  // Find the data start row (where actual employee data begins)
  let dataStartRow = -1;
  for (let i = 0; i < 10; i++) {
    if (jsonData[i] && jsonData[i][0] === 'Employee Name') {
      dataStartRow = i + 2; // Data typically starts 2 rows after the header
      break;
    }
  }

  console.log(`Data starts at row ${dataStartRow}`);
  return { jsonData, dataStartRow };
}

async function matchEmployeeToProfile(employeeData) {
  const name = employeeData.name;
  const email = employeeData.email;

  // Try to match by email first
  if (email && email !== 'N/A') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .ilike('email', email)
      .single();

    if (data) {
      console.log(`  Matched by email: ${email} -> ${data.full_name}`);
      return data.id;
    }
  }

  // Try to match by name
  if (name) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .ilike('full_name', `%${name}%`)
      .single();

    if (data) {
      console.log(`  Matched by name: ${name} -> ${data.full_name}`);
      return data.id;
    }
  }

  console.log(`  No match found for ${name} (${email})`);
  return null;
}

async function importCompetencies(dryRun = true) {
  console.log(`\nStarting competency import (${dryRun ? 'DRY RUN' : 'LIVE'})...\n`);

  const { jsonData, dataStartRow } = await loadExcelData();

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const competenciesToInsert = [];

  // Process each employee row
  for (let rowIdx = dataStartRow; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];

    // Skip empty rows
    if (!row || !row[0] || row[0] === '') continue;

    const employeeData = {
      name: row[0],
      position: row[1],
      startDate: parseExcelDate(row[2]),
      dateOfBirth: parseExcelDate(row[3]),
      mobile: row[4],
      email: row[5],
      address: row[6]
    };

    console.log(`\nProcessing: ${employeeData.name} (${employeeData.position})`);

    // Match to profile
    const userId = await matchEmployeeToProfile(employeeData);
    if (!userId) {
      console.log(`  ⚠️  Skipping - no profile match`);
      skippedCount++;
      continue;
    }

    // Extract competencies for this employee
    for (const comp of COMPETENCY_COLUMNS) {
      const value = row[comp.col];

      // Skip empty or N/A values
      if (!value || value === 'N/A' || value === 'N' || value === '') continue;

      // Prepare competency record
      const competency = {
        user_id: userId,
        competency_name: comp.name,
        competency_type: comp.category,
        issuing_body: null,
        certificate_number: null,
        date_achieved: null,
        expiry_date: null,
        status: 'current',
        notes: null
      };

      // Parse dates if this is a date field
      if (comp.isDate) {
        const parsedDate = parseExcelDate(value);
        if (parsedDate) {
          competency.expiry_date = parsedDate;
          // Set status based on expiry
          const expDate = new Date(parsedDate);
          const today = new Date();
          if (expDate < today) {
            competency.status = 'expired';
          } else if (expDate < new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) {
            competency.status = 'expiring_soon';
          }
        }
      } else {
        // For non-date fields, store the value appropriately
        if (typeof value === 'string') {
          // Check if it looks like a certificate number
          if (value.match(/^[A-Z0-9\-\/]+$/i) && value.length < 50) {
            competency.certificate_number = value;
          } else {
            competency.notes = value;
          }
        } else if (typeof value === 'number') {
          // Excel date as number
          const parsedDate = parseExcelDate(value);
          if (parsedDate) {
            competency.date_achieved = parsedDate;
          } else {
            competency.certificate_number = String(value);
          }
        }
      }

      // Check for issuing body in adjacent cells (usually next row)
      if (rowIdx + 1 < jsonData.length) {
        const nextRow = jsonData[rowIdx + 1];
        if (nextRow && nextRow[comp.col - 1] === 'Issuing Body' && nextRow[comp.col]) {
          competency.issuing_body = nextRow[comp.col];
        }
      }

      competenciesToInsert.push(competency);
    }

    processedCount++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log(`  Employees processed: ${processedCount}`);
  console.log(`  Employees skipped (no profile): ${skippedCount}`);
  console.log(`  Competencies to insert: ${competenciesToInsert.length}`);
  console.log('='.repeat(50) + '\n');

  if (!dryRun && competenciesToInsert.length > 0) {
    console.log('Inserting competencies into database...');

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < competenciesToInsert.length; i += batchSize) {
      const batch = competenciesToInsert.slice(i, i + batchSize);

      const { data, error } = await supabase
        .from('employee_competencies')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
        errorCount += batch.length;
      } else {
        console.log(`  Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log(`\n✅ Import complete! Inserted ${competenciesToInsert.length - errorCount} competencies.`);
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} competencies failed to insert.`);
    }
  } else if (dryRun) {
    console.log('\n🔍 DRY RUN COMPLETE - No data was inserted.');
    console.log('Run with --live flag to perform actual import.');
  }
}

// Main execution
const isDryRun = !process.argv.includes('--live');
importCompetencies(isDryRun).catch(console.error);