import React, { useState } from 'react';
import Papa from 'papaparse';
import authManager from '../auth-manager.js';
import competencyService from '../services/competency-service.js';
import { RandomMatrixSpinner } from './MatrixSpinners';
import { sanitizeString, validateEmail } from '../utils/validation.js';

export default function CSVImportModal({ onClose, onComplete }) {
    const [file, setFile] = useState(null);
    const [parseData, setParseData] = useState(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [errors, setErrors] = useState([]);
    const [successCount, setSuccessCount] = useState(0);
    const [stage, setStage] = useState('upload'); // upload, preview, importing, complete

    // Map CSV column names to competency definition names
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

        // Add more mappings as needed...
    };

    const handleFileUpload = (event) => {
        const uploadedFile = event.target.files[0];
        if (!uploadedFile) return;

        setFile(uploadedFile);
        setErrors([]);

        // First, parse without headers to get raw data
        Papa.parse(uploadedFile, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                console.log('Raw CSV data:', results);

                // The structure is:
                // Row 0: Date header
                // Row 1: Actual field names (Date of Birth, Mobile Number, etc.)
                // Row 2: Category labels (Employee Name, Job Position, etc.)
                // Row 3: More category labels
                // Row 4+: Actual data

                if (results.data.length < 5) {
                    setErrors(['CSV file does not have enough rows']);
                    return;
                }

                // Extract headers from row 1 (index 1) and row 2 (index 2)
                const fieldHeaders = results.data[1]; // Actual field names
                const categoryHeaders = results.data[2]; // Employee Name, Job Position, etc.

                // Combine headers - use category header for first few columns, field headers for the rest
                const headers = categoryHeaders.map((cat, idx) => {
                    if (idx === 0) return 'Employee Name'; // First column
                    if (idx === 1) return 'Job Position';
                    if (idx === 2) return 'Start Date';
                    return fieldHeaders[idx] || `Column_${idx}`;
                });

                // Convert data rows (starting from row 4, index 4) to objects
                const dataRows = [];
                for (let i = 4; i < results.data.length; i++) {
                    const row = results.data[i];

                    // Skip rows that are metadata (Certificate No, Expiry Date, Issuing Body, etc.)
                    // These rows have empty first column or metadata in first column
                    const firstCol = row[0] ? row[0].trim() : '';
                    if (!firstCol ||
                        firstCol === '' ||
                        firstCol === 'Employee Name' ||
                        firstCol === 'EE Details' ||
                        firstCol.includes('Issuing Body') ||
                        firstCol.includes('Certificate No') ||
                        firstCol.includes('Expiry Date') ||
                        firstCol === 'CONTRACTORS' ||
                        firstCol.includes('CONTRACTORS')) {
                        continue;
                    }

                    const rowObj = {};
                    headers.forEach((header, idx) => {
                        if (header && row[idx]) {
                            rowObj[header] = row[idx];
                        }
                    });

                    // Only include rows that have BOTH a name AND a valid email
                    const name = rowObj['Employee Name'];
                    const email = rowObj['Email Address'];

                    // Validate email properly using validation utility
                    const emailValidation = email ? validateEmail(email) : { isValid: false };

                    if (name && name.trim() !== '' && emailValidation.isValid) {
                        // Sanitize the employee name before storing
                        rowObj['Employee Name'] = sanitizeString(name, { encodeHtml: false, maxLength: 100 });
                        rowObj['Email Address'] = emailValidation.sanitized;
                        dataRows.push(rowObj);
                    }
                }

                console.log('Processed data rows:', dataRows);
                console.log('Headers:', headers);

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
        if (!dateStr || dateStr.trim() === '' || dateStr === 'N' || dateStr === 'N/A') {
            return null;
        }

        // Handle DD/MM/YYYY format
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
            const year = parseInt(parts[2], 10);

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month, day).toISOString();
            }
        }

        return null;
    };

    const parseBoolean = (value) => {
        if (!value || value.trim() === '') return null;
        const lower = value.toLowerCase().trim();
        if (lower === 'yes' || lower === 'mai' || lower === 'completed' || lower === 'true') {
            return 'Yes';
        }
        if (lower === 'no' || lower === 'n' || lower === 'n/a' || lower === 'false') {
            return null; // Don't store "No" values
        }
        return value; // Store as-is if unclear
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

            // Get default organization
            const orgs = await authManager.getOrganizations();
            const defaultOrg = orgs.find(org => org.name !== 'SYSTEM') || orgs[0];

            for (let i = 0; i < parseData.rows.length; i++) {
                const row = parseData.rows[i];
                // Employee name is already sanitized during parsing, but double-check
                const employeeName = sanitizeString(row['Employee Name'] || '', { encodeHtml: false, maxLength: 100 });

                setProgress({
                    current: i + 1,
                    total: parseData.rows.length,
                    status: `Importing ${employeeName}...`
                });

                try {
                    // Extract and validate email (already validated during parsing)
                    const email = row['Email Address'];
                    const emailValidation = validateEmail(email);
                    if (!emailValidation.isValid) {
                        importErrors.push(`Row ${i + 1} (${employeeName}): Invalid or missing email address`);
                        continue;
                    }

                    // Generate safe username from sanitized name
                    const username = employeeName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '').substring(0, 20);

                    // Create user account
                    let userId;
                    try {
                        const tempPassword = 'TempPass123!'; // Users will need to reset
                        const createResult = await authManager.createUser({
                            email: emailValidation.sanitized, // Use validated and sanitized email
                            username: username,
                            password: tempPassword,
                            role: 'viewer', // Changed from 'user' to valid role
                            organizationId: defaultOrg.id
                        });

                        if (!createResult.success) {
                            throw new Error(createResult.error || 'Failed to create user');
                        }

                        userId = createResult.user.id;

                        // Wait longer for the database trigger to create the profile
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (error) {
                        if (error.message.includes('already exists') ||
                            error.message.includes('duplicate') ||
                            error.message.includes('User already registered')) {
                            // User already exists - try to find them and use their ID
                            try {
                                const existingUsers = await authManager.getAllUsers();
                                const existingUser = existingUsers.find(u =>
                                    u.email === email.trim() || u.username === username
                                );

                                if (existingUser) {
                                    userId = existingUser.id;
                                    console.log(`Using existing user: ${employeeName} (${userId})`);
                                } else {
                                    importErrors.push(`Row ${i + 1} (${employeeName}): User already exists but could not be found (${email})`);
                                    continue;
                                }
                            } catch (lookupError) {
                                importErrors.push(`Row ${i + 1} (${employeeName}): User already exists (${email})`);
                                continue;
                            }
                        } else {
                            throw error;
                        }
                    }

                    // Verify the user profile was created before adding competencies
                    if (!userId) {
                        importErrors.push(`Row ${i + 1} (${employeeName}): No user ID available`);
                        continue;
                    }

                    // Import competencies for this user
                    const competenciesToCreate = [];

                    for (const [csvColumn, defName] of Object.entries(FIELD_MAPPING)) {
                        const value = row[csvColumn];
                        if (!value || value.trim() === '' || value === 'N/A' || value === 'N') {
                            continue;
                        }

                        const definition = definitionMap[defName];
                        if (!definition) {
                            continue; // Skip unmapped fields
                        }

                        let processedValue = null;
                        let expiryDate = null;

                        // Process based on field type - sanitize all text inputs
                        if (definition.field_type === 'expiry_date') {
                            expiryDate = parseDate(value);
                            if (!expiryDate) continue;
                            // Sanitize display value to prevent XSS
                            processedValue = sanitizeString(value, { encodeHtml: false, maxLength: 50 });
                        } else if (definition.field_type === 'date') {
                            processedValue = parseDate(value);
                            if (!processedValue) continue;
                        } else if (definition.field_type === 'boolean') {
                            processedValue = parseBoolean(value);
                            if (!processedValue) continue;
                        } else {
                            // Sanitize text values to prevent injection attacks
                            processedValue = sanitizeString(value, { encodeHtml: false, maxLength: 500 });
                        }

                        competenciesToCreate.push({
                            user_id: userId,
                            competency_id: definition.id,
                            value: processedValue,
                            expiry_date: expiryDate,
                            status: 'active'
                        });
                    }

                    // Batch create competencies
                    if (competenciesToCreate.length > 0) {
                        await competencyService.bulkCreateCompetencies(competenciesToCreate);
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

    return (
        <div className="modal" style={{ display: 'flex' }}>
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                        Import Personnel from CSV
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
                                Upload your Training and Competency Matrix CSV file
                            </p>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                                id="csv-upload"
                            />
                            <label htmlFor="csv-upload" className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                                Choose CSV File
                            </label>
                        </div>

                        <div className="glass-item" style={{ padding: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
                                Import Information:
                            </h4>
                            <ul style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li>Creates user accounts for each employee</li>
                                <li>Sets temporary password: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '3px' }}>TempPass123!</code></li>
                                <li>Imports all filled competency data</li>
                                <li>Parses dates in DD/MM/YYYY format</li>
                                <li>Skips empty or N/A values</li>
                                <li>All users assigned "user" role by default</li>
                            </ul>
                        </div>
                    </div>
                )}

                {stage === 'preview' && parseData && (
                    <div>
                        <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
                                Preview
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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parseData.rows.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                                                    {row['Employee Name']}
                                                </td>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                                    {row['Email Address'] || <span style={{ color: '#ef4444' }}>Missing</span>}
                                                </td>
                                                <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                                    {row['Job Position'] || '-'}
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

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            {successCount > 0 && (
                                <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', fontSize: '14px', color: '#10b981' }}>
                                    ✓ {successCount} user account{successCount !== 1 ? 's' : ''} created successfully
                                </div>
                            )}
                        </div>
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
