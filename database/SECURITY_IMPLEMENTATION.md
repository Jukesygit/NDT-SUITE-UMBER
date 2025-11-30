# Competency Document Security Implementation

## Overview
All competency documents (certificates, licenses, training records) are stored **privately** with strict access controls. This ensures compliance with data protection regulations and prevents unauthorized access to sensitive employee information.

## Security Architecture

### 1. Private Storage Bucket
- **Bucket Name**: `documents`
- **Visibility**: PRIVATE (not public)
- **Access Method**: Signed URLs only

### 2. Row-Level Security (RLS) Policies

#### Upload Policy
Users can only upload documents to their own folder:
```
Path structure: documents/competency-documents/{user_id}/filename.pdf
```

#### View Policy
Access is restricted based on role:
- **Users**: Can view only their own documents
- **Org Admins**: Can view documents from users in their organization
- **System Admins**: Can view all documents

#### Update/Delete Policies
- Users can update/delete their own documents
- Admins can delete any documents (for compliance/cleanup)

### 3. Signed URLs

Documents are accessed via **temporary signed URLs** that:
- Are valid for 1 hour
- Are generated on-demand when a user clicks "View"
- Cannot be shared or bookmarked (they expire)
- Respect RLS policies (unauthorized users get access denied)

### 4. Database Storage

The `employee_competencies` table stores:
- `document_url`: File path in storage (NOT a public URL)
- `document_name`: Original filename for display

When documents need to be viewed, the application:
1. Checks user permissions (via RLS)
2. Generates a signed URL from the stored path
3. Returns the temporary URL to the user

## Implementation Details

### Service Layer (`competency-service.js`)

```javascript
// Upload - stores path, not URL
async uploadDocument(file, userId, competencyName) {
    const filePath = `competency-documents/${userId}/...`;
    await supabase.storage.from('documents').upload(filePath, file);
    return { url: filePath }; // Store path
}

// View - generates signed URL on-demand
async getDocumentUrl(filePath) {
    const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600); // 1 hour
    return data.signedUrl;
}
```

### UI Layer (`profile.js`)

```javascript
// When user clicks "View Document"
const signedUrl = await competencyService.getDocumentUrl(documentPath);
window.open(signedUrl, '_blank');
```

## Deployment Steps

1. **Create Private Bucket**
   ```
   Dashboard → Storage → Create Bucket
   Name: documents
   Visibility: Private ✓
   ```

2. **Apply RLS Policies**
   ```sql
   -- Run: database/storage-policies.sql
   -- This creates all necessary access control policies
   ```

3. **Verify Security**
   ```sql
   -- Check bucket is private
   SELECT * FROM storage.buckets WHERE name = 'documents';
   -- Should show: public = false

   -- Check RLS is enabled
   SELECT * FROM storage.objects WHERE bucket_id = 'documents' LIMIT 1;
   -- Should require authentication
   ```

## Security Testing

### Test 1: Own Documents
1. Log in as User A
2. Upload a competency document
3. View the document ✓ Should work
4. Document should open in new tab with signed URL

### Test 2: Other User's Documents
1. Log in as User B (different user, same org)
2. Try to access User A's document directly
3. ✗ Should be denied (unless User B is org admin)

### Test 3: Expired URLs
1. Generate a signed URL
2. Wait 1 hour
3. Try to access the URL
4. ✗ Should show "expired" error

### Test 4: Org Admin Access
1. Log in as Org Admin
2. Should be able to view documents from users in same org ✓
3. Should NOT be able to view documents from other orgs ✗

### Test 5: System Admin Access
1. Log in as System Admin
2. Should be able to view ALL documents ✓

## Compliance Features

### GDPR Compliance
- ✅ Data minimization (only store necessary info)
- ✅ Access control (role-based permissions)
- ✅ Audit trail (competency_history table)
- ✅ Right to erasure (delete document function)

### Data Protection
- ✅ Encrypted at rest (Supabase default)
- ✅ Encrypted in transit (HTTPS)
- ✅ Time-limited access (1-hour signed URLs)
- ✅ No public exposure

### Audit Logging
All document operations are logged:
- Upload: Logged in `competency_history` as 'created'
- Update: Logged as 'updated'
- Delete: Logged as 'deleted'
- Includes: timestamp, user ID, document path

## Troubleshooting

### Issue: "Access Denied" when viewing own document
**Cause**: RLS policies not applied or bucket is public
**Fix**:
1. Check bucket is set to Private
2. Re-run `storage-policies.sql`
3. Verify user is authenticated

### Issue: "URL Expired"
**Cause**: Signed URL is older than 1 hour
**Fix**: Click "View" again to generate a new signed URL

### Issue: Can't upload documents
**Cause**: Folder structure or permissions issue
**Fix**:
1. Check upload path: `competency-documents/{user_id}/...`
2. Verify RLS upload policy allows current user
3. Check file size limits

### Issue: Org admin can't see employee documents
**Cause**: RLS policy not matching organization_id correctly
**Fix**: Verify both users have same `organization_id` in profiles table

## Best Practices

1. **Never store public URLs** in the database
2. **Always generate signed URLs** on-demand
3. **Keep signed URL expiry short** (1 hour is good)
4. **Log all document access** for compliance
5. **Regularly audit permissions** to ensure proper access
6. **Test RLS policies** after any schema changes

## Migration from Public URLs

If you previously stored public URLs, migrate them:

```sql
-- Backup old URLs
ALTER TABLE employee_competencies ADD COLUMN old_document_url TEXT;
UPDATE employee_competencies
SET old_document_url = document_url
WHERE document_url IS NOT NULL;

-- Convert public URLs to paths
UPDATE employee_competencies
SET document_url =
    REPLACE(document_url, 'https://your-project.supabase.co/storage/v1/object/public/documents/', '')
WHERE document_url LIKE 'https://your-project.supabase.co/storage/v1/object/public/documents/%';

-- Verify conversion
SELECT document_url FROM employee_competencies WHERE document_url IS NOT NULL LIMIT 5;
-- Should show: competency-documents/{user_id}/filename.pdf
```

## Future Enhancements

### Phase 2
- Document version control (keep history of certificate renewals)
- Bulk download for admins (all certs for an employee)
- OCR for automatic cert data extraction
- Expiry notifications before signed URLs expire

### Phase 3
- Integration with external certificate verification services
- Blockchain-based certificate validation
- Advanced document analytics

## Support

For security issues or questions:
1. Review this document first
2. Check Supabase RLS documentation
3. Test with different user roles
4. Contact system administrator

**Remember**: Security is everyone's responsibility. Always verify permissions before implementing changes.
