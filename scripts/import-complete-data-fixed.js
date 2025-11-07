import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

async function createOrUpdateProfile(employeeData) {
  const { name, position, email, mobile, address, startDate, dateOfBirth, nearestStation, nextOfKin, nextOfKinContact } = employeeData;

  // Check if profile already exists by email
  let profile = null;
  if (email && email !== 'N/A') {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`email.ilike.${email},email_address.ilike.${email}`)
      .single();
    profile = data;
  }

  // If not found by email, try by name
  if (!profile && name) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', name.toLowerCase().replace(' ', '.'))
      .single();
    profile = data;
  }

  if (profile) {
    // Update existing profile with new information
    const updates = {
      mobile_number: mobile || profile.mobile_number,
      email_address: email || profile.email_address,
      home_address: address || profile.home_address,
      nearest_uk_train_station: nearestStation || profile.nearest_uk_train_station,
      next_of_kin: nextOfKin || profile.next_of_kin,
      next_of_kin_emergency_contact_number: nextOfKinContact || profile.next_of_kin_emergency_contact_number,
      date_of_birth: dateOfBirth || profile.date_of_birth
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      console.log(`  ❌ Error updating profile: ${error.message}`);
      return null;
    }

    console.log(`  ✅ Updated existing profile`);
    return data.id;
  } else {
    // We need to create an auth user first
    console.log(`  ℹ️  Creating new auth user for ${name}`);

    const tempPassword = crypto.randomBytes(16).toString('hex');
    const userEmail = email && email !== 'N/A' ? email : `${name.toLowerCase().replace(/\s+/g, '.')}@matrixinspection.com`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: name
      }
    });

    if (authError) {
      // Try without admin API (requires service role key)
      console.log(`  ⚠️  Cannot create auth user without service role key. Skipping.`);
      return null;
    }

    // Create profile for the new user
    const newProfile = {
      id: authData.user.id,
      username: name.toLowerCase().replace(/\s+/g, '.'),
      email: userEmail,
      role: position && position.toLowerCase().includes('manager') ? 'org_admin' : 'viewer',
      mobile_number: mobile && mobile !== 'N/A' ? mobile : null,
      email_address: email && email !== 'N/A' ? email : null,
      home_address: address && address !== 'N/A' ? address : null,
      nearest_uk_train_station: nearestStation && nearestStation !== 'N/A' ? nearestStation : null,
      next_of_kin: nextOfKin && nextOfKin !== 'N/A' ? nextOfKin : null,
      next_of_kin_emergency_contact_number: nextOfKinContact && nextOfKinContact !== 'N/A' ? nextOfKinContact : null,
      date_of_birth: dateOfBirth
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (error) {
      console.log(`  ❌ Error creating profile: ${error.message}`);
      return null;
    }

    console.log(`  ✅ Created new profile with username: ${newProfile.username}`);
    return data.id;
  }
}

async function importData(dryRun = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting data import (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
  console.log(`${'='.repeat(60)}\n`);

  const { jsonData, dataStartRow } = await loadExcelData();

  let processedCount = 0;
  let skippedCount = 0;
  const competenciesToInsert = [];
  const profilesCreated = [];

  // Process each employee row
  for (let rowIdx = dataStartRow; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];

    // Skip empty rows or header rows
    if (!row || !row[0] || row[0] === '' || row[0].includes('CONTRACTORS') || row[0].includes('New Start')) {
      continue;
    }

    const employeeData = {
      name: row[0],
      position: row[1],
      startDate: parseExcelDate(row[2]),
      dateOfBirth: parseExcelDate(row[3]),
      mobile: row[4],
      email: row[5],
      address: row[6],
      nearestStation: row[7],
      nextOfKin: row[8],
      nextOfKinContact: row[9]
    };

    console.log(`\n📋 Processing: ${employeeData.name} (${employeeData.position || 'No position'})`);

    let userId = null;
    if (!dryRun) {
      userId = await createOrUpdateProfile(employeeData);
    } else {
      // In dry run, just simulate profile creation
      userId = crypto.randomUUID();
      console.log(`  🔍 Would create/update profile`);
      profilesCreated.push(employeeData);
    }

    if (!userId) {
      console.log(`  ⚠️  Skipping - profile creation failed`);
      skippedCount++;
      continue;
    }

    // Extract competencies for this employee
    let competencyCount = 0;
    for (const comp of COMPETENCY_COLUMNS) {
      const value = row[comp.col];

      // Skip empty or N/A values
      if (!value || value === 'N/A' || value === 'N' || value === '' || value === 'TBC') continue;

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
        } else if (value !== 'MAI' && value !== 'Matrix' && value !== 'Matrix-AI') {
          competency.notes = value;
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

      competenciesToInsert.push(competency);
      competencyCount++;
    }

    console.log(`  📊 Found ${competencyCount} competencies`);
    processedCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY:');
  console.log(`  Employees processed: ${processedCount}`);
  console.log(`  Employees skipped: ${skippedCount}`);
  if (dryRun) {
    console.log(`  Profiles to create/update: ${profilesCreated.length}`);
  }
  console.log(`  Competencies to insert: ${competenciesToInsert.length}`);
  console.log('='.repeat(60) + '\n');

  if (!dryRun && competenciesToInsert.length > 0) {
    console.log('💾 Inserting competencies into database...\n');

    // Insert in batches
    const batchSize = 50;
    let successCount = 0;
    for (let i = 0; i < competenciesToInsert.length; i += batchSize) {
      const batch = competenciesToInsert.slice(i, i + batchSize);

      const { data, error } = await supabase
        .from('employee_competencies')
        .insert(batch);

      if (error) {
        console.error(`  ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      } else {
        successCount += batch.length;
        console.log(`  ✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
      }
    }

    console.log(`\n🎉 Import complete! Successfully imported ${successCount} competencies.`);
  } else if (dryRun) {
    console.log('\n🔍 DRY RUN COMPLETE - No data was inserted.');
    console.log('\n📝 NOTE: To create new users, you need a Supabase service role key.');
    console.log('   Without it, the script can only update existing profiles.');
    console.log('\n📝 Sample profiles that would be created:');
    profilesCreated.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name} (${p.email || 'generated email'})`);
    });
    console.log('\n✅ To perform the actual import, run: node scripts/import-complete-data-fixed.js --live');
  }
}

// Main execution
const isDryRun = !process.argv.includes('--live');
importData(isDryRun).catch(console.error);