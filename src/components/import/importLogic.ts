import authManager from '../../auth-manager.js';
import competencyService from '../../services/competency-service';
import { FIELD_MAPPING } from './fieldMapping';
import { parseDate, parseBoolean } from './parseUtils';
import type { ParsedData, ImportProgress, ImportStage } from './types';

interface CertificationValue {
  issuingBody: string | null;
  certificateNumber: string | null;
  expiryDate: unknown;
}

function isCertificationValue(value: unknown): value is CertificationValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'expiryDate' in value
  );
}

export async function runImport(
  parseData: ParsedData,
  setImporting: (v: boolean) => void,
  setStage: (stage: ImportStage) => void,
  setProgress: (fn: ImportProgress | ((prev: ImportProgress) => ImportProgress)) => void,
  setSuccessCount: (n: number) => void,
  setErrors: (errors: string[]) => void,
): Promise<void> {
  setImporting(true);
  setStage('importing');
  setProgress({ current: 0, total: parseData.rows.length, status: 'Starting import...' });
  const importErrors: string[] = [];
  let successfulImports = 0;

  try {
    // Get all competency definitions for mapping
    setProgress((prev: ImportProgress) => ({ ...prev, status: 'Loading competency definitions...' }));
    const definitions = await competencyService.getAllCompetencyDefinitions();
    const definitionMap: Record<string, { id: string; name: string; field_type: string }> = {};
    definitions.forEach((def: { id: string; name: string; field_type: string }) => {
      definitionMap[def.name] = def;
    });

    // Get default organization
    const orgs = await authManager.getOrganizations();
    const defaultOrg = orgs.find((org: { name: string }) => org.name !== 'SYSTEM') || orgs[0];

    for (let i = 0; i < parseData.rows.length; i++) {
      const row = parseData.rows[i];
      const employeeName = row['Employee Name'] as string;

      setProgress({
        current: i + 1,
        total: parseData.rows.length,
        status: `Importing ${employeeName}...`
      });

      try {
        // Extract email
        const email = row['Email Address'] as string;
        if (!email || !email.includes('@')) {
          importErrors.push(`Row ${i + 1} (${employeeName}): Invalid or missing email address`);
          continue;
        }

        const username = employeeName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');

        // Try to find existing user first
        let userId: string;
        const existingUsers = await authManager.getUsers();
        const existingUser = existingUsers.find(
          (u: { email: string; username: string }) => u.email === email.trim() || u.username === username
        );

        if (existingUser) {
          userId = existingUser.id;
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

            // Wait longer for user creation to complete and avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify user was created by checking again
            const verifyUsers = await authManager.getUsers();
            const verifiedUser = verifyUsers.find((u: { id: string }) => u.id === userId);
            if (!verifiedUser) {
              throw new Error('User creation not confirmed in database');
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            // If it's a rate limit error, add a note and skip this user for now
            if (message.includes('rate limit')) {
              importErrors.push(`Row ${i + 1} (${employeeName}): Rate limited - user may already exist or try again later`);
            } else {
              importErrors.push(`Row ${i + 1} (${employeeName}): ${message}`);
            }
            continue;
          }
        }

        // Import competencies for this user
        const competenciesToCreate: Array<{
          user_id: string;
          competency_id: string;
          value: string | null;
          expiry_date: string | null;
          issuing_body: string | null;
          certificate_number: string | null;
          status: string;
        }> = [];

        for (const [csvColumn, defName] of Object.entries(FIELD_MAPPING)) {
          const value = row[csvColumn];

          // Handle certification objects (with issuing_body, certificate_number, expiry_date)
          if (isCertificationValue(value)) {
            const certData = value;

            // Parse the expiry date (could be Excel number or string)
            const expiryDate = parseDate(certData.expiryDate);
            if (!expiryDate) continue;

            const definition = definitionMap[defName];
            if (!definition) {
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
              continue;
            }

            let processedValue: string | null = null;
            let expiryDate: string | null = null;

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
          await competencyService.bulkCreateCompetencies(competenciesToCreate);
        }

        successfulImports++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        importErrors.push(`Row ${i + 1} (${employeeName}): ${message}`);
      }
    }

    setSuccessCount(successfulImports);
    setErrors(importErrors);
    setStage('complete');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setErrors([`Fatal error: ${message}`]);
    setStage('complete');
  } finally {
    setImporting(false);
  }
}
