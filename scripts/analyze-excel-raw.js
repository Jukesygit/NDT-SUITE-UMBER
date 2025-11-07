import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_PATH = "C:\\Users\\jonas\\OneDrive\\Documents\\MAI-LR-IMS-005 Training and Competency Matrix_Live Data Hub import.xlsx";

function analyzeRawExcel() {
  console.log('Reading Excel file with raw data extraction...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const mainSheet = 'MAI-LR-IMS-005 Training and Com';
    const worksheet = workbook.Sheets[mainSheet];

    // Get the range of the sheet
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    console.log(`Sheet range: A1:${XLSX.utils.encode_col(range.e.c)}${range.e.r + 1}`);
    console.log(`Total columns: ${range.e.c + 1}`);
    console.log(`Total rows: ${range.e.r + 1}\n`);

    // Read first 10 rows completely
    console.log('=== First 10 rows with all non-empty columns ===\n');
    for (let row = 0; row < Math.min(10, range.e.r + 1); row++) {
      const rowData = [];
      let hasData = false;

      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ c: col, r: row });
        const cell = worksheet[cellAddress];

        if (cell) {
          rowData.push({ col, value: cell.v });
          hasData = true;
        }
      }

      if (hasData) {
        console.log(`Row ${row}:`);
        rowData.forEach(({ col, value }) => {
          const truncatedValue = String(value).substring(0, 50);
          console.log(`  Col ${col}: ${truncatedValue}`);
        });
        console.log('');
      }
    }

    // Check columns 10-30 for competency headers
    console.log('=== Checking columns 10-30 for headers (rows 0-5) ===\n');
    for (let col = 10; col < Math.min(30, range.e.c + 1); col++) {
      console.log(`Column ${col}:`);
      for (let row = 0; row < 6; row++) {
        const cellAddress = XLSX.utils.encode_cell({ c: col, r: row });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          console.log(`  Row ${row}: ${String(cell.v).substring(0, 60)}`);
        }
      }
    }

    // Check columns 30-50
    console.log('\n=== Checking columns 30-50 for headers (rows 0-5) ===\n');
    for (let col = 30; col < Math.min(50, range.e.c + 1); col++) {
      let hasData = false;
      for (let row = 0; row < 6; row++) {
        const cellAddress = XLSX.utils.encode_cell({ c: col, r: row });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          if (!hasData) {
            console.log(`Column ${col}:`);
            hasData = true;
          }
          console.log(`  Row ${row}: ${String(cell.v).substring(0, 60)}`);
        }
      }
    }

    // Export to JSON for easier inspection
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

    // Save a sample to file
    const sampleData = {
      totalRows: jsonData.length,
      totalColumns: range.e.c + 1,
      first20Rows: jsonData.slice(0, 20),
      headers: {
        row0: jsonData[0],
        row1: jsonData[1],
        row2: jsonData[2],
        row3: jsonData[3]
      }
    };

    fs.writeFileSync(
      path.join(__dirname, 'excel-sample.json'),
      JSON.stringify(sampleData, null, 2)
    );

    console.log('\n✓ Sample data saved to excel-sample.json');

  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeRawExcel();