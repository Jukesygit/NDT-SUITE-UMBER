import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import authManager from '../auth-manager.js';
import competencyService from '../services/competency-service.js';
import { RandomMatrixSpinner } from './MatrixSpinners';

export default function UniversalImportModal({ onClose, onComplete }) {
    console.log('UniversalImportModal component loaded');
    console.log('UniversalImportModal props:', { onClose, onComplete });
    const [file, setFile] = useState(null);
    const [parseData, setParseData] = useState(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [errors, setErrors] = useState([]);
    const [successCount, setSuccessCount] = useState(0);
    const [stage, setStage] = useState('upload'); // upload, preview, importing, complete
    const [fileType, setFileType] = useState(null); // 'csv' or 'excel'

    // Enhanced field mapping to handle Excel structure
    const FIELD_MAPPING = {
        // Personal Details
        'Date of Birth': 'Date of Birth',
        'Mobile Number': 'Mobile Number',
        'Email Address': 'Email Address',
        'Home Address': 'Home Address',
        'Nearest UK Train Station': 'Nearest UK Train Station',
        'Next of Kin / Emergency Contact Name': 'Next of Kin / Emergency Contact Name',
        'Next of Kin / Emergency Contact Number': 'Next of Kin / Emergency Contact Number',

        // Induction & Workplace Health
        'Certificate of Incorporation': 'Certificate of Incorporation',
        'Company Number': 'Company Number',
        'Company Insurance Expiry Date': 'Company Insurance Expiry Date',
        'H&S Induction Completed': 'H&S Induction Completed',
        'DSE Questionnaire Completed': 'DSE Questionnaire Completed',
        'Driving Licence Expiry Date': 'Driving Licence Expiry Date',
        'Passport Primary': 'Passport Primary',
        'Primary Passport Expiry': 'Primary Passport Expiry',
        'Passport Secondary': 'Passport Secondary',
        'Passport Secondary Expiry': 'Passport Secondary Expiry',
        'Pension Information': 'Pension Information',
        'PPE Issued': 'PPE Issued',
        'Policies & Procedures Issued (Quality, H&S, Environmental & Impartiality)': 'Policies & Procedures Issued',
        'Policies & Procedures Issued': 'Policies & Procedures Issued',
        'Vantage No': 'Vantage No',

        // Mandatory Offshore Training
        'BOSIET / FOET Expiry Date': 'BOSIET / FOET Expiry Date',
        'Norwegian Escape Chute Expiry Date': 'Norwegian Escape Chute Expiry Date',
        'Offshore Medical Expiry Date': 'Offshore Medical Expiry Date',
        'Audiometry Expiry Date': 'Audiometry Expiry Date',
        'MIST Expiry Date': 'MIST Expiry Date',
        'DONUT Escape training Expiry Date': 'DONUT Escape training Expiry Date',
        'PSL 44 Vision Test Expiry': 'PSL 44 Vision Test Expiry',
        'Bideltiod Measurement': 'Bideltiod Measurement',
        'CCNSG / CSCS Safety Passport Expiry Date': 'CCNSG / CSCS Safety Passport Expiry Date',

        // Rope Access
        'IRATA Level and No.': 'IRATA Level and No.',
        'IRATA Expiry Date': 'IRATA Expiry Date',
        'Logbook Entry': 'Logbook Entry',
        'Logbook - 6 Monthly Check Due': 'Logbook - 6 Monthly Check Due',

        // Training
        'First Aid at Work Expiry': 'First Aid at Work Expiry',
        'Anti corruption and Bribery': 'Anti corruption and Bribery',
        'IOSH': 'IOSH',
        'Fire Warden': 'Fire Warden',
        'Defib': 'Defib',
        'MAI-F-IMS-008 Record of Internal Training R03': 'MAI-F-IMS-008 Record of Internal Training R03',
        'Confined Space Entry': 'Confined Space Entry',

        // Professional Registration
        'IEng Incorperated Engineer': 'IEng Incorporated Engineer',
        'IEng Incorporated Engineer': 'IEng Incorporated Engineer',
        'Engtech Engineering Technician': 'Engtech Engineering Technician',
        'Project Management (PFQ/PMQ)': 'Project Management (PFQ/PMQ)',
        'BINDT Registration': 'BINDT Registration',

        // Plant API and Visual
        'ASME Plant Inspection L3': 'ASME Plant Inspection L3',
        'ASME Plant Inspection L2': 'ASME Plant Inspection L2',
        'ASME Plant Inspection L1': 'ASME Plant Inspection L1',
        'API 510 Pressure Vessel': 'API 510 Pressure Vessel',
        'API 570 Pipework': 'API 570 Pipework',
        'API 653 Storage Tanks': 'API 653 Storage Tanks',
        'CSWIP Plant Inspector Level 3': 'CSWIP Plant Inspector Level 3',
        'CSWIP Plant Inspector Level 2': 'CSWIP Plant Inspector Level 2',
        'CSWIP 3.2 (Snr Weld Inspector)': 'CSWIP 3.2 (Snr Weld Inspector)',
        'CSWIP 3.1 (Weld Inspector)': 'CSWIP 3.1 (Weld Inspector)',
        'CSWIP 3.0 (Visual Inspection)': 'CSWIP 3.0 (Visual Inspection)',
        'Flange Face Inspection and Remedials': 'Flange Face Inspection and Remedials',
        'ICorr Painting Inspector Level 1': 'ICorr Painting Inspector Level 1',

        // NDT
        'PCN Number': 'PCN Number',
        'EN 9712 PAUT L3': 'EN 9712 PAUT L3',
        'EN 9712 TOFD L3': 'EN 9712 TOFD L3',
        'EN 9712 MUT L3': 'EN 9712 MUT L3',
        'EN 9712 PAUT L2': 'EN 9712 PAUT L2',
        'EN 9712 TOFD L2': 'EN 9712 TOFD L2',
        'EN 9712 RAD L2': 'EN 9712 RAD L2',
        'Basic Radiation Safety': 'Basic Radiation Safety',
        'EN 9712 MUT L2 3.8/3.9': 'EN 9712 MUT L2 3.8/3.9',
        'EN 9712 MUT L2 3.1/3.2': 'EN 9712 MUT L2 3.1/3.2',
        'PEC L2 Training': 'PEC L2 Training',
        'EN 9712 ECI L2': 'EN 9712 ECI L2',
        'EN 9712 MPI L2': 'EN 9712 MPI L2',
        'EN 9712 LPI L2': 'EN 9712 LPI L2',
        'EN 9712 VIS L2': 'EN 9712 VIS L2',

        // UAV
        'CAA PFCO  / GVC Multi Rotor': 'CAA PFCO / GVC Multi Rotor',
        'CAA PFCO / GVC Multi Rotor': 'CAA PFCO / GVC Multi Rotor',
        'Flyer ID': 'Flyer ID',
        'Internal TRG': 'Internal TRG',
        'Currencey 350': 'Currency 350',
        'Currency 350': 'Currency 350',
        'Elios 2': 'Elios 2',

        // Management Training
        'ISO 17020 Awareness training': 'ISO 17020 Awareness training',
        'ISO 9001 Training': 'ISO 9001 Training',

        // GWO
        'Fire Awareness': 'Fire Awareness',
        'First Aid': 'First Aid',
        'Sea Survival': 'Sea Survival',
        'Working at Height': 'Working at Height',
        'Manual Handling': 'Manual Handling',
        'Blade Repair': 'Blade Repair'
    };

    const handleFileUpload = (event) => {
        const uploadedFile = event.target.files[0];
        if (!uploadedFile) return;

        setFile(uploadedFile);
        setErrors([]);

        const fileName = uploadedFile.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            setFileType('csv');
            parseCSVFile(uploadedFile);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            setFileType('excel');
            parseExcelFile(uploadedFile);
        } else {
            setErrors(['Please upload a CSV or Excel file (.csv, .xlsx, .xls)']);
        }
    };

    const parseExcelFile = (uploadedFile) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Use the first sheet or the training matrix sheet
                let worksheet;
                let sheetName = workbook.SheetNames[0];

                // Look for the main training sheet
                for (const name of workbook.SheetNames) {
                    if (name.includes('Training') && name.includes('Com')) {
                        sheetName = name;
                        break;
                    }
                }

                worksheet = workbook.Sheets[sheetName];

                // Convert to JSON with raw data (no headers)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                processExcelData(jsonData);
            } catch (error) {
                console.error('Error parsing Excel file:', error);
                setErrors([`Failed to parse Excel file: ${error.message}`]);
            }
        };
        reader.readAsArrayBuffer(uploadedFile);
    };

    const processExcelData = (rawData) => {
        // Find where data starts (look for "Employee Name" row)
        let dataStartRow = -1;
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
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
        const headerRow1 = rawData[headerRowIndex - 1] || [];  // Field names
        const headerRow2 = rawData[headerRowIndex] || [];       // Categories

        // Build column headers - prefer row1, fallback to row2
        const headers = [];
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

        console.log('Found headers:', headers.filter(h => h).length, 'columns');
        console.log('Sample headers:', headers.slice(0, 15));

        // Process data rows - each employee takes 3 rows
        const dataRows = [];
        for (let i = dataStartRow; i < rawData.length; i += 3) {
            const employeeRow = rawData[i];           // Row 1: Name + Issuing Bodies
            const certificateRow = rawData[i + 1];    // Row 2: Certificate Numbers
            const expiryRow = rawData[i + 2];         // Row 3: Expiry Dates

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

            const rowObj = {};

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
            const email = rowObj['Email Address'];

            if (name && String(name).trim() !== '' &&
                email && (String(email).includes('@') || email === 'N/A')) {
                // Generate email if N/A
                if (email === 'N/A' || !String(email).includes('@')) {
                    rowObj['Email Address'] = `${String(name).toLowerCase().replace(/\s+/g, '.')}@matrixinspection.com`;
                }
                dataRows.push(rowObj);
            }
        }

        console.log('Processed Excel data:', dataRows.length, 'employees');
        console.log('Sample row keys:', dataRows[0] ? Object.keys(dataRows[0]).slice(0, 20) : 'No data');
        console.log('Sample NDT fields in first row:');
        if (dataRows[0]) {
            const ndtFields = Object.keys(dataRows[0]).filter(k => k.includes('9712') || k.includes('PCN'));
            ndtFields.forEach(field => {
                console.log(`  ${field}:`, dataRows[0][field]);
            });
        }

        setParseData({
            headers: headers.filter(h => h),
            rows: dataRows
        });
        setStage('preview');
    };

    const parseCSVFile = (uploadedFile) => {
        Papa.parse(uploadedFile, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                console.log('Raw CSV data:', results);

                if (results.data.length < 5) {
                    setErrors(['CSV file does not have enough rows']);
                    return;
                }

                // Extract headers from row 1 (index 1) and row 2 (index 2)
                const fieldHeaders = results.data[1];
                const categoryHeaders = results.data[2];

                // Combine headers
                const headers = categoryHeaders.map((cat, idx) => {
                    if (idx === 0) return 'Employee Name';
                    if (idx === 1) return 'Job Position';
                    if (idx === 2) return 'Start Date';
                    return fieldHeaders[idx] || `Column_${idx}`;
                });

                // Convert data rows (starting from row 4, index 4) to objects
                const dataRows = [];
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

                    const rowObj = {};
                    headers.forEach((header, idx) => {
                        if (header && row[idx]) {
                            rowObj[header] = row[idx];
                        }
                    });

                    // Only include rows with name and email
                    const name = rowObj['Employee Name'];
                    const email = rowObj['Email Address'];

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
            error: (error) => {
                setErrors([`Failed to parse CSV: ${error.message}`]);
            }
        });
    };

    const parseDate = (dateStr) => {
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
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }

        return null;
    };

    const parseBoolean = (value) => {
        if (!value || value.trim() === '') return null;
        const lower = value.toLowerCase().trim();
        if (lower === 'yes' || lower === 'mai' || lower === 'completed' || lower === 'true') {
            return 'Yes';
        }
        if (lower === 'no' || lower === 'n' || lower === 'n/a' || lower === 'false' || lower === 'tbc') {
            return null;
        }
        return value;
    };

    const startImport = async () => {
        setImporting(true);
        setStage('importing');
        setProgress({ current: 0, total: parseData.rows.length, status: 'Starting import...' });
        const importErrors = [];
        let successfulImports = 0;

        try {
            // Get all competency definitions for mapping
            setProgress(prev => ({ ...prev, status: 'Loading competency definitions...' }));
            const definitions = await competencyService.getAllCompetencyDefinitions();
            const definitionMap = {};
            definitions.forEach(def => {
                definitionMap[def.name] = def;
            });

            console.log('Total competency definitions loaded:', definitions.length);
            console.log('NDT definitions:', definitions.filter(d => d.name.includes('9712')).map(d => d.name));
            console.log('Plant/API definitions:', definitions.filter(d => d.name.includes('API') || d.name.includes('CSWIP')).map(d => d.name));
            console.log('Management definitions:', definitions.filter(d => d.name.includes('ISO')).map(d => d.name));

            // Get default organization
            const orgs = await authManager.getOrganizations();
            const defaultOrg = orgs.find(org => org.name !== 'SYSTEM') || orgs[0];

            for (let i = 0; i < parseData.rows.length; i++) {
                const row = parseData.rows[i];
                const employeeName = row['Employee Name'];

                setProgress({
                    current: i + 1,
                    total: parseData.rows.length,
                    status: `Importing ${employeeName}...`
                });

                try {
                    // Extract email
                    const email = row['Email Address'];
                    if (!email || !email.includes('@')) {
                        importErrors.push(`Row ${i + 1} (${employeeName}): Invalid or missing email address`);
                        continue;
                    }

                    const username = employeeName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');

                    // Try to find existing user first
                    let userId;
                    const existingUsers = await authManager.getUsers();
                    const existingUser = existingUsers.find(u =>
                        u.email === email.trim() || u.username === username
                    );

                    if (existingUser) {
                        userId = existingUser.id;
                        console.log(`Using existing user: ${employeeName} (${userId})`);
                    } else {
                        // Create new user
                        try {
                            const tempPassword = 'TempPass123!';
                            const createResult = await authManager.createUser({
                                email: email.trim(),
                                username: username,
                                password: tempPassword,
                                role: 'viewer',
                                organizationId: defaultOrg.id
                            });

                            if (!createResult.success) {
                                throw new Error(createResult.error || 'Failed to create user');
                            }

                            userId = createResult.user.id;
                            console.log(`Created new user: ${employeeName} (${userId})`);

                            // Wait longer for user creation to complete and avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 3000));

                            // Verify user was created by checking again
                            const verifyUsers = await authManager.getUsers();
                            const verifiedUser = verifyUsers.find(u => u.id === userId);
                            if (!verifiedUser) {
                                throw new Error('User creation not confirmed in database');
                            }
                        } catch (error) {
                            // If it's a rate limit error, add a note and skip this user for now
                            if (error.message.includes('rate limit')) {
                                importErrors.push(`Row ${i + 1} (${employeeName}): Rate limited - user may already exist or try again later`);
                            } else {
                                importErrors.push(`Row ${i + 1} (${employeeName}): ${error.message}`);
                            }
                            continue;
                        }
                    }

                    // Import competencies for this user
                    const competenciesToCreate = [];

                    console.log(`Processing competencies for ${employeeName}:`, Object.keys(row).length, 'fields in row');

                    for (const [csvColumn, defName] of Object.entries(FIELD_MAPPING)) {
                        const value = row[csvColumn];

                        // Handle certification objects (with issuing_body, certificate_number, expiry_date)
                        if (value && typeof value === 'object' && value.expiryDate !== undefined) {
                            const certData = value;

                            // Parse the expiry date (could be Excel number or string)
                            const expiryDate = parseDate(certData.expiryDate);
                            if (!expiryDate) continue;

                            const definition = definitionMap[defName];
                            if (!definition) {
                                console.warn(`No definition found for: ${defName}`);
                                continue;
                            }

                            // Format the display value as a date string
                            const displayValue = new Date(expiryDate).toLocaleDateString('en-GB');

                            competenciesToCreate.push({
                                user_id: userId,
                                competency_id: definition.id,
                                value: displayValue,
                                expiry_date: expiryDate,
                                issuing_body: certData.issuingBody ? String(certData.issuingBody) : null,
                                certificate_number: certData.certificateNumber ? String(certData.certificateNumber) : null,
                                status: 'active'
                            });
                        } else {
                            // Handle simple values
                            const stringValue = value != null ? String(value) : '';
                            if (!value || stringValue.trim() === '' || stringValue === 'N/A' || stringValue === 'N' || stringValue === 'TBC') {
                                continue;
                            }

                            const definition = definitionMap[defName];
                            if (!definition) {
                                console.warn(`No definition found for: ${defName}`);
                                continue;
                            }

                            let processedValue = null;
                            let expiryDate = null;

                            // Process based on field type
                            if (definition.field_type === 'expiry_date') {
                                expiryDate = parseDate(stringValue);
                                if (!expiryDate) continue;
                                processedValue = stringValue;
                            } else if (definition.field_type === 'date') {
                                processedValue = parseDate(stringValue);
                                if (!processedValue) continue;
                            } else if (definition.field_type === 'boolean') {
                                processedValue = parseBoolean(stringValue);
                                if (!processedValue) continue;
                            } else {
                                processedValue = stringValue.trim();
                            }

                            competenciesToCreate.push({
                                user_id: userId,
                                competency_id: definition.id,
                                value: processedValue,
                                expiry_date: expiryDate,
                                issuing_body: null,
                                certificate_number: null,
                                status: 'active'
                            });
                        }
                    }

                    // Batch create competencies
                    if (competenciesToCreate.length > 0) {
                        console.log(`Creating ${competenciesToCreate.length} competencies for ${employeeName}`);
                        console.log('Sample competencies:', competenciesToCreate.slice(0, 3).map(c => ({
                            name: definitions.find(d => d.id === c.competency_id)?.name,
                            value: c.value,
                            issuing_body: c.issuing_body,
                            certificate_number: c.certificate_number
                        })));
                        await competencyService.bulkCreateCompetencies(competenciesToCreate);
                    } else {
                        console.warn(`No competencies to create for ${employeeName}`);
                    }

                    successfulImports++;
                } catch (error) {
                    console.error(`Error importing ${employeeName}:`, error);
                    importErrors.push(`Row ${i + 1} (${employeeName}): ${error.message}`);
                }
            }

            setSuccessCount(successfulImports);
            setErrors(importErrors);
            setStage('complete');
        } catch (error) {
            console.error('Import failed:', error);
            setErrors([`Fatal error: ${error.message}`]);
            setStage('complete');
        } finally {
            setImporting(false);
        }
    };

    console.log('UniversalImportModal rendering, stage:', stage);

    return (
        <div className="modal" style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9999 }}>
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                        Import Personnel from File
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={importing}
                        style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '24px', padding: 0 }}
                    >
                        ×
                    </button>
                </div>

                {stage === 'upload' && (
                    <div>
                        <div className="glass-card" style={{ padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
                            <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '20px' }}>
                                Upload your Training and Competency Matrix file
                            </p>
                            <input
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                                id="file-upload"
                            />
                            <label htmlFor="file-upload" className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                                Choose File (CSV or Excel)
                            </label>
                        </div>

                        <div className="glass-item" style={{ padding: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
                                Supported Formats:
                            </h4>
                            <ul style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li><strong>Excel (.xlsx, .xls):</strong> Training and Competency Matrix format</li>
                                <li><strong>CSV (.csv):</strong> Exported matrix data</li>
                            </ul>

                            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginTop: '16px', marginBottom: '12px' }}>
                                Import Features:
                            </h4>
                            <ul style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li>Creates or updates user accounts</li>
                                <li>Imports all competency data with expiry dates</li>
                                <li>Handles Excel date formats automatically</li>
                                <li>Skips empty or N/A values</li>
                                <li>Generates emails for users without them</li>
                            </ul>
                        </div>
                    </div>
                )}

                {stage === 'preview' && parseData && (
                    <div>
                        <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
                                Preview ({fileType === 'excel' ? 'Excel' : 'CSV'} File)
                            </h4>
                            <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                Found <strong style={{ color: '#10b981' }}>{parseData.rows.length}</strong> employees to import
                            </div>

                            <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="glass-scrollbar">
                                <table style={{ width: '100%', fontSize: '13px' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)' }}>
                                        <tr>
                                            <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Name</th>
                                            <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Email</th>
                                            <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Position</th>
                                            <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Mobile</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parseData.rows.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                                                    {row['Employee Name']}
                                                </td>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>
                                                    {row['Email Address'] || <span style={{ color: '#ef4444' }}>Missing</span>}
                                                </td>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                                    {row['Job Position'] || '-'}
                                                </td>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                                    {row['Mobile Number'] || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setStage('upload');
                                    setParseData(null);
                                    setFile(null);
                                    setFileType(null);
                                }}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={startImport}
                                className="btn-primary"
                            >
                                Start Import
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'importing' && (
                    <div>
                        <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                                    <RandomMatrixSpinner size={100} />
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                                    {progress.status}
                                </div>
                                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                    {progress.current} of {progress.total} employees
                                </div>
                            </div>

                            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        width: `${(progress.current / progress.total) * 100}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                                        transition: 'width 0.3s ease'
                                    }}
                                ></div>
                            </div>
                        </div>
                    </div>
                )}

                {stage === 'complete' && (
                    <div>
                        <div className="glass-card" style={{ padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
                            <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <h4 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                                Import Complete
                            </h4>
                            <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                Successfully imported <strong style={{ color: '#10b981' }}>{successCount}</strong> of {parseData.rows.length} employees
                            </p>
                        </div>

                        {errors.length > 0 && (
                            <div className="glass-card" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid #ef4444' }}>
                                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444', marginBottom: '12px' }}>
                                    Errors ({errors.length})
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }} className="glass-scrollbar">
                                    {errors.map((error, i) => (
                                        <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            {error}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <button
                                onClick={() => {
                                    onComplete();
                                    onClose();
                                }}
                                className="btn-primary"
                            >
                                Close and View Personnel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}