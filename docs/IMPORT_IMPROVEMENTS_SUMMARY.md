# Import Modal Improvements Summary

## Changes Made

### 1. Fixed Modal Rendering Issue
- **Problem**: Modal wasn't appearing when Import button clicked
- **Solution**: Removed debug `console.log` statement that was breaking JSX rendering in PersonnelManagementPage.jsx:259
- **Result**: Modal now renders correctly with explicit z-index 9999

### 2. Multi-Row Excel Structure Support
The Excel parser now properly handles the 3-row structure for certifications:
- **Row 1**: Category/Competency name and expiry dates
- **Row 2**: Issuing Body values
- **Row 3**: Certificate Number values

#### Example from your Excel (NDT columns):
```
Row 1: EN 9712 PAUT L3 | EN 9712 TOFD L3 | EN 9712 MUT L3
       03/11/2027       | 03/10/2028       | 03/11/2027
Row 2: PCN              | PCN              | PCN
Row 3: E01TS22829172    | E2S6272XL6MUD    | X022S62426078
```

### 3. Database Schema Updates
Added two new columns to `employee_competencies` table:
- `issuing_body TEXT` - Stores certification issuing body (e.g., PCN, CSWIP, Matrix-AI)
- `certificate_number TEXT` - Stores certificate/registration numbers
- `custom_fields JSONB` - Added to competency_definitions for future extensibility

### 4. Import Logic Improvements
- Proper type conversion for all values (fixes `value.trim is not a function` errors)
- Increased delay between user creations (1.5s → 3s) to avoid rate limiting
- Verification step after user creation to prevent foreign key errors
- Support for both simple fields and multi-field certifications

### 5. Field Type Mapping
The importer now correctly identifies field types:
- **Simple text**: PCN Number, Passport Primary, Vantage No, etc.
- **Simple dates**: Date of Birth, Start Date, etc.
- **Expiry dates**: Passport expiry, Driving Licence expiry, etc.
- **Certifications** (3 fields): All NDT certs, CSWIP, API certifications
- **Boolean**: H&S Induction Completed, DSE Questionnaire, etc.

## What You Need to Do

### Option 1: Run SQL Migration Manually (Recommended)
Open your Supabase SQL Editor and run:

```sql
-- Add new columns for certification details
ALTER TABLE employee_competencies
ADD COLUMN IF NOT EXISTS issuing_body TEXT,
ADD COLUMN IF NOT EXISTS certificate_number TEXT;

-- Add custom fields support to definitions
ALTER TABLE competency_definitions
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL;
```

### Option 2: Use the Migration Script
The migration file is ready at: `database/add-custom-fields-to-competencies.sql`

## Testing the Import

1. **Start fresh** or **continue with existing data** - the import handles both:
   - Existing users: Updates their competencies
   - New users: Creates accounts with temp password "TempPass123!"

2. **Upload your Training Matrix Excel file** via the Import button

3. **Check the preview** - Should show employee names, emails, positions

4. **Import Process** will now:
   - Create/update user accounts (3s delay between creations to avoid rate limits)
   - Parse multi-row NDT certifications correctly
   - Store Issuing Body and Certificate Number separately
   - Store expiry dates properly

## Known Limitations

1. **Rate Limiting**: Supabase limits how fast you can create users. If you get rate limit errors:
   - Wait a few minutes
   - Re-run the import - it will skip existing users

2. **Email Generation**: Users without emails get auto-generated ones:
   - Format: `firstname.lastname@matrixinspection.com`

3. **Temporary Passwords**: All new users get password: `TempPass123!`
   - They'll need to reset on first login

## Next Steps

1. Apply the database migration (see "What You Need to Do" above)
2. Test the import with your Excel file
3. Verify that NDT certifications show all 3 fields (Issuing Body, Certificate, Expiry)
4. Check that simple fields (PCN Number, Passports, etc.) import correctly

## Files Changed

- `src/components/UniversalImportModal.jsx` - Complete rewrite of Excel parser
- `src/pages/PersonnelManagementPage.jsx` - Fixed modal rendering
- `database/add-custom-fields-to-competencies.sql` - New migration file
- `scripts/run-migration.js` - Migration script (optional)
