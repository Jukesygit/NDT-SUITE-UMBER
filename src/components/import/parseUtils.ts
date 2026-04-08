// @ts-expect-error papaparse has no type declarations installed
import Papa from 'papaparse';
import type { ParsedData, ImportStage } from './types';

// XLSX will be dynamically imported when needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let XLSX: any = null;

export function parseDate(dateStr: unknown): string | null {
  if (!dateStr) return null;

  // Handle string inputs
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    if (trimmed === '' || trimmed === 'N' || trimmed === 'N/A' || trimmed === 'TBC' || trimmed === 'MAI') {
      return null;
    }

    // Handle DD/MM/YYYY format
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);

      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
        return new Date(fullYear, month, day).toISOString();
      }
    }
  }

  // Handle Excel date serial numbers (numbers between 1 and 100000)
  if (typeof dateStr === 'number' && dateStr > 1 && dateStr < 100000) {
    // Excel date serial number conversion
    const date = new Date((dateStr - 25569) * 86400 * 1000);
    return date.toISOString();
  }

  // Try parsing as regular date
  const parsed = new Date(dateStr as string);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

export function parseBoolean(value: string): string | null {
  if (!value || value.trim() === '') return null;
  const lower = value.toLowerCase().trim();
  if (lower === 'yes' || lower === 'mai' || lower === 'completed' || lower === 'true') {
    return 'Yes';
  }
  if (lower === 'no' || lower === 'n' || lower === 'n/a' || lower === 'false' || lower === 'tbc') {
    return null;
  }
  return value;
}

export async function parseExcelFile(
  uploadedFile: File,
  setParseData: (data: ParsedData) => void,
  setStage: (stage: ImportStage) => void,
  setErrors: (errors: string[]) => void,
): Promise<void> {
  // Dynamically import XLSX when needed
  if (!XLSX) {
    // @ts-expect-error xlsx is loaded dynamically and has no type declarations
    const xlsxModule = await import('xlsx');
    XLSX = xlsxModule;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

      // Use the first sheet or the training matrix sheet
      let sheetName = workbook.SheetNames[0];

      // Look for the main training sheet
      for (const name of workbook.SheetNames) {
        if (name.includes('Training') && name.includes('Com')) {
          sheetName = name;
          break;
        }
      }

      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with raw data (no headers)
      const jsonData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

      processExcelData(jsonData, setParseData, setStage, setErrors);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors([`Failed to parse Excel file: ${message}`]);
    }
  };
  reader.readAsArrayBuffer(uploadedFile);
}

function processExcelData(
  rawData: unknown[][],
  setParseData: (data: ParsedData) => void,
  setStage: (stage: ImportStage) => void,
  setErrors: (errors: string[]) => void,
): void {
  // Find where data starts (look for "Employee Name" row)
  let dataStartRow = -1;
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i] as unknown[];
    if (row && row[0] === 'Employee Name') {
      headerRowIndex = i;
      // Data starts 2 rows after the header row
      dataStartRow = i + 2;
      break;
    }
  }

  if (dataStartRow === -1 || headerRowIndex === -1) {
    setErrors(['Could not find data structure in Excel file']);
    return;
  }

  // Get header rows - row1 has the field names, row2 has category groupings
  const headerRow1 = (rawData[headerRowIndex - 1] || []) as unknown[];
  const headerRow2 = (rawData[headerRowIndex] || []) as unknown[];

  // Build column headers - prefer row1, fallback to row2
  const headers: (string | null)[] = [];
  const maxCols = Math.max(headerRow1.length, headerRow2.length);

  for (let col = 0; col < maxCols; col++) {
    if (headerRow1[col] && String(headerRow1[col]).trim() !== '') {
      headers[col] = String(headerRow1[col]).trim();
    } else if (headerRow2[col] && String(headerRow2[col]).trim() !== '') {
      headers[col] = String(headerRow2[col]).trim();
    } else {
      headers[col] = null;
    }
  }

  // Process data rows - each employee takes 3 rows
  const dataRows: Record<string, unknown>[] = [];
  for (let i = dataStartRow; i < rawData.length; i += 3) {
    const employeeRow = rawData[i] as unknown[];       // Row 1: Name + Issuing Bodies
    const certificateRow = rawData[i + 1] as unknown[];  // Row 2: Certificate Numbers
    const expiryRow = rawData[i + 2] as unknown[];       // Row 3: Expiry Dates

    // Skip empty rows
    if (!employeeRow || !employeeRow[0]) continue;

    const firstCol = String(employeeRow[0]).trim();

    // Skip non-employee rows
    if (firstCol === '' ||
      firstCol === 'null' ||
      firstCol.includes('CONTRACTORS') ||
      firstCol.includes('New Start')) {
      continue;
    }

    const rowObj: Record<string, unknown> = {};

    // Process each column
    for (let col = 0; col < headers.length; col++) {
      const header = headers[col];
      if (!header) continue;

      const empValue = employeeRow[col];
      const certValue = certificateRow ? certificateRow[col] : null;
      const expValue = expiryRow ? expiryRow[col] : null;

      // Check if this is a certification field (has issuing body data)
      const isCertification = (expValue !== null && expValue !== undefined && empValue &&
        (String(empValue).includes('PCN') || String(empValue).includes('CSWIP') ||
          String(empValue).includes('Matrix') || String(empValue).includes('TWI') ||
          String(empValue).includes('SGS') || String(empValue).includes('ASNT')));

      if (isCertification && expValue) {
        // This is a certification with issuing body, cert number, and expiry
        rowObj[header] = {
          issuingBody: empValue ? String(empValue) : null,
          certificateNumber: certValue ? String(certValue) : null,
          expiryDate: expValue
        };
      } else {
        // Regular field - use value from employee row
        if (empValue !== null && empValue !== undefined) {
          // Handle Excel dates
          if (typeof empValue === 'number' && empValue > 40000 && empValue < 50000) {
            const date = new Date((empValue - 25569) * 86400 * 1000);
            rowObj[header] = date.toLocaleDateString('en-GB');
          } else {
            rowObj[header] = empValue;
          }
        }
      }
    }

    // Only include rows that have both name and valid email
    const name = rowObj['Employee Name'];
    const email = rowObj['Email Address'] as string | undefined;

    if (name && String(name).trim() !== '' &&
      email && (String(email).includes('@') || email === 'N/A')) {
      // Generate email if N/A
      if (email === 'N/A' || !String(email).includes('@')) {
        rowObj['Email Address'] = `${String(name).toLowerCase().replace(/\s+/g, '.')}@matrixinspection.com`;
      }
      dataRows.push(rowObj);
    }
  }

  setParseData({
    headers: headers.filter((h): h is string => h !== null),
    rows: dataRows
  });
  setStage('preview');
}

export function parseCSVFile(
  uploadedFile: File,
  setParseData: (data: ParsedData) => void,
  setStage: (stage: ImportStage) => void,
  setErrors: (errors: string[]) => void,
): void {
  Papa.parse(uploadedFile, {
    header: false,
    skipEmptyLines: true,
    complete: (results: { data: string[][] }) => {
      if (results.data.length < 5) {
        setErrors(['CSV file does not have enough rows']);
        return;
      }

      // Extract headers from row 1 (index 1) and row 2 (index 2)
      const fieldHeaders = results.data[1];
      const categoryHeaders = results.data[2];

      // Combine headers
      const headers = categoryHeaders.map((_cat: string, idx: number) => {
        if (idx === 0) return 'Employee Name';
        if (idx === 1) return 'Job Position';
        if (idx === 2) return 'Start Date';
        return fieldHeaders[idx] || `Column_${idx}`;
      });

      // Convert data rows (starting from row 4, index 4) to objects
      const dataRows: Record<string, unknown>[] = [];
      for (let i = 4; i < results.data.length; i++) {
        const row = results.data[i];

        // Skip invalid rows
        const firstCol = row[0] ? row[0].trim() : '';
        if (!firstCol ||
          firstCol === '' ||
          firstCol.includes('CONTRACTORS') ||
          firstCol.includes('Issuing Body') ||
          firstCol.includes('Certificate No')) {
          continue;
        }

        const rowObj: Record<string, unknown> = {};
        headers.forEach((header: string, idx: number) => {
          if (header && row[idx]) {
            rowObj[header] = row[idx];
          }
        });

        // Only include rows with name and email
        const name = rowObj['Employee Name'] as string | undefined;
        const email = rowObj['Email Address'] as string | undefined;

        if (name && name.trim() !== '' && email && email.includes('@')) {
          dataRows.push(rowObj);
        }
      }

      setParseData({
        headers: headers,
        rows: dataRows
      });
      setStage('preview');
    },
    error: (error: { message: string }) => {
      setErrors([`Failed to parse CSV: ${error.message}`]);
    }
  });
}
