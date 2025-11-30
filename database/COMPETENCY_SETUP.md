# Competency Management System - Setup Guide

## Overview
This competency management system provides comprehensive tracking of employee certifications, qualifications, and training records based on the Training and Competency Matrix.

## Phase 1: Core Implementation (Complete)

### Features Implemented:
- ✅ Normalized database schema with categories and definitions
- ✅ Employee competency tracking with expiry dates
- ✅ Document attachment support
- ✅ Audit history logging
- ✅ Role-based access control (RLS policies)
- ✅ CRUD operations UI in profile page
- ✅ Category-based organization
- ✅ Dynamic form fields based on competency type

## Database Deployment Instructions

### Step 1: Deploy the Schema

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `database/competency-schema.sql`
4. Copy the entire contents
5. Paste into the Supabase SQL Editor
6. Click **Run** to execute

### Step 2: Create Storage Bucket for Documents

1. In Supabase dashboard, go to **Storage**
2. Create a new bucket named `documents`
3. **IMPORTANT**: Set the bucket to **Private** (NOT public!)
4. Navigate to **SQL Editor** and run the contents of `database/storage-policies.sql`
5. This sets up secure RLS policies so documents are only accessible by authorized users

**Security Note**: Documents are stored privately with signed URLs (valid for 1 hour) generated on-demand. This ensures:
- Users can only access their own documents
- Org admins can access documents from users in their organization
- System admins can access all documents
- No public access to sensitive certification files

### Step 3: Verify Tables Created

Check that these tables exist in your database:
- `competency_categories`
- `competency_definitions`
- `employee_competencies`
- `competency_history`

### Step 4: Seed All Competency Definitions (REQUIRED)

1. Open the file `database/seed-all-competencies.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run** to execute

This will create **107 competency definitions** across **13 categories**, including:
- ✅ 7 Personal Details fields
- ✅ 14 Induction & Workplace Health fields
- ✅ 9 Mandatory Offshore Training certifications
- ✅ 10 Onshore Training certifications
- ✅ 1 Internal Training record
- ✅ 4 Professional Registration fields
- ✅ 15 Plant, API and Visual Qualifications
- ✅ 26 NDT Certifications (PAUT, TOFD, MUT, RAD, etc.)
- ✅ 5 UAV Operations certifications
- ✅ 2 Management Training courses
- ✅ 6 GWO Training modules
- ✅ 4 Academic Qualifications
- ✅ 4 Other Trades certifications

**Verification Query**:
```sql
SELECT
    cc.name as category,
    COUNT(cd.id) as competency_count
FROM competency_categories cc
LEFT JOIN competency_definitions cd ON cd.category_id = cc.id
GROUP BY cc.id, cc.name
ORDER BY cc.display_order;
```

Expected output should show 107 total definitions across the categories.

## Database Schema Structure

### competency_categories
Organizes competencies into logical groups (e.g., "NDT Certifications", "GWO Training")

### competency_definitions
Defines each certification/qualification type with:
- `field_type`: text, date, expiry_date, boolean, file, number
- `requires_document`: whether a certificate file is needed
- `requires_approval`: whether admin approval is required

### employee_competencies
Stores actual competency records for each user:
- Links to user and competency definition
- Stores value and expiry date
- Tracks document uploads
- Records verification status

### competency_history
Automatic audit trail of all changes via database triggers

## Using the System

### For Employees:
1. Go to **Profile** page
2. Scroll to **Competencies & Certifications** section
3. Click **Add Competency**
4. Select category and competency type
5. Enter details and upload supporting documents
6. Save

### For Admins:
- View all employee competencies through user management
- Approve pending competencies (Phase 2 feature)
- Run expiry reports (Phase 2 feature)
- Bulk import from CSV (Phase 2 feature)

## CSV Field Mapping

The system is designed to accommodate all 100+ fields from your Training and Competency Matrix CSV. The main categories match your CSV structure:

1. **Personal Details** - DOB, contact info, etc.
2. **Induction Process** - H&S induction, DSE, etc.
3. **Mandatory Offshore Training** - BOSIET, medical, etc.
4. **Onshore Training** - IRATA, first aid, etc.
5. **NDT Certifications** - PAUT, TOFD, MUT, etc.
6. **Professional Registration** - IEng, EngTech, etc.
7. **UAV Operations** - CAA PFCO, etc.
8. **GWO Training** - Fire awareness, first aid, etc.
9. **Academic Qualifications** - Degrees, HND, etc.

## Next Steps (Future Phases)

### Phase 2: Notifications & Workflows
- Email alerts for expiring certifications (30/60/90 days)
- Manager approval workflows
- Bulk import from CSV files
- Export reports

### Phase 3: Advanced Features
- Matrix view (employee vs competency grid)
- Dashboard with compliance metrics
- Document version control
- Integration with HR systems

### Phase 4: Analytics & Reporting
- Competency gap analysis
- Training needs assessment
- Compliance reporting
- Trend analysis

## API Service Methods

The `competency-service.js` provides these methods:

- `getCategories()` - Get all competency categories
- `getCompetencyDefinitions(categoryId)` - Get competency definitions
- `getUserCompetencies(userId)` - Get user's competencies
- `getUserCompetenciesByCategory(userId)` - Get grouped by category
- `upsertCompetency(userId, competencyId, data)` - Create/update
- `deleteCompetency(competencyId)` - Delete competency
- `verifyCompetency(competencyId, approved, reason)` - Approve/reject
- `getExpiringCompetencies(daysThreshold)` - Get expiring soon
- `uploadDocument(file, userId, competencyName)` - Upload certificate
- `bulkImportCompetencies(userId, csvData)` - Bulk import

## Troubleshooting

### Issue: Tables not created
- Check for SQL errors in Supabase SQL Editor
- Ensure `uuid-ossp` extension is enabled
- Verify you have admin privileges

### Issue: Can't upload documents
- Check storage bucket is created and configured
- Verify RLS policies allow document uploads
- Check file size limits

### Issue: Can't see competencies
- Check RLS policies are enabled
- Verify user is authenticated
- Check browser console for errors

## Support

For questions or issues, refer to:
- Supabase documentation: https://supabase.com/docs
- Project repository documentation
- Contact system administrator
