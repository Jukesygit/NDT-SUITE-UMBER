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
  console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Excel file path
const EXCEL_PATH = "C:\\Users\\jonas\\OneDrive\\Documents\\MAI-LR-IMS-005 Training and Competency Matrix_Live Data Hub import.xlsx";

async function analyzeExcelStructure() {
  console.log('Reading Excel file...');

  try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    console.log('\nWorkbook sheets:', workbook.SheetNames);

    // Analyze each sheet
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n\n=== Sheet: ${sheetName} ===`);
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length > 0) {
        console.log('First few rows:');
        jsonData.slice(0, 5).forEach((row, idx) => {
          console.log(`Row ${idx}:`, row.slice(0, 10)); // Show first 10 columns
        });

        // Get headers (assuming first row)
        const headers = jsonData[0];
        console.log('\nColumn headers:');
        headers.forEach((header, idx) => {
          if (header) console.log(`  Column ${idx}: ${header}`);
        });

        console.log(`\nTotal rows: ${jsonData.length}`);
        console.log(`Total columns: ${headers.length}`);
      }
    }

  } catch (error) {
    console.error('Error reading Excel file:', error);
  }
}

async function checkDatabaseSchema() {
  console.log('\n\n=== Checking Database Schema ===');

  try {
    // Check competencies table structure
    const { data: competencies, error: compError } = await supabase
      .from('competencies')
      .select('*')
      .limit(1);

    if (compError) {
      console.error('Error checking competencies table:', compError);
    } else {
      console.log('\nCompetencies table exists');
      if (competencies.length > 0) {
        console.log('Sample competency fields:', Object.keys(competencies[0]));
      }
    }

    // Check profiles table structure
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (profError) {
      console.error('Error checking profiles table:', profError);
    } else {
      console.log('\nProfiles table exists');
      if (profiles.length > 0) {
        console.log('Sample profile fields:', Object.keys(profiles[0]));
      }
    }

    // Count existing competencies
    const { count, error: countError } = await supabase
      .from('competencies')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`\nExisting competencies in database: ${count}`);
    }

    // Get unique users with competencies
    const { data: uniqueUsers, error: usersError } = await supabase
      .from('competencies')
      .select('user_id')
      .limit(1000);

    if (!usersError && uniqueUsers) {
      const uniqueUserIds = [...new Set(uniqueUsers.map(c => c.user_id))];
      console.log(`\nUnique users with competencies: ${uniqueUserIds.length}`);
    }

  } catch (error) {
    console.error('Database error:', error);
  }
}

async function main() {
  console.log('Starting Excel analysis for competency import...\n');

  // First analyze the Excel structure
  await analyzeExcelStructure();

  // Then check the database schema
  await checkDatabaseSchema();

  console.log('\n\nAnalysis complete. Ready to create import logic based on the structure.');
}

main().catch(console.error);