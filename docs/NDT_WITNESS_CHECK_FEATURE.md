# NDT Competency Witness Check Feature

## Overview
This feature adds the ability to track Matrix Competency Witness Inspections for NDT (Non-Destructive Testing) certifications. Each NDT certification can now have an associated witness check record including who witnessed it, when, and any notes from the inspection.

## Database Changes

### New Fields in `employee_competencies` Table
```sql
witness_checked      BOOLEAN DEFAULT FALSE
witnessed_by         UUID REFERENCES profiles(id)
witnessed_at         TIMESTAMP WITH TIME ZONE
witness_notes        TEXT
```

### Migration Script
Location: `database/add-witness-check-fields.sql`

To apply the migration:
```sql
-- Run this SQL script in your Supabase SQL editor
\i database/add-witness-check-fields.sql
```

## Code Changes

### 1. Helper Functions (`src/utils/competency-field-utils.js`)

#### `isNDTCertification(competency)`
Determines if a competency is an NDT certification.
- Checks if category is "NDT Certifications"
- Falls back to pattern matching for NDT-related names

#### `requiresWitnessCheck(competency)`
Determines if an NDT cert requires a witness check.
- Returns `true` for expiry_date type NDT certs
- Excludes informational fields like "PCN Number"

#### `getWitnessCheckSummary(competencies)`
Returns statistics about witness checks:
```javascript
{
  total: 10,        // Total NDT certs requiring witness checks
  witnessed: 7,     // Number witnessed
  percentage: 70    // Percentage witnessed
}
```

### 2. Service Layer Updates

#### `competency-service.js`
Updated `upsertCompetency()` to accept witness fields:
```javascript
{
  witnessChecked: boolean,
  witnessedBy: string (user_id),
  witnessedAt: string (ISO date),
  witnessNotes: string
}
```

#### `personnel-service.js`
- Updated queries to fetch witness fields
- Added witness fields to competency insert operations

### 3. UI Components

#### Personnel Management Page (`src/pages/PersonnelManagementPage.jsx`)

**Inline Edit Form Enhancement:**
When editing an NDT certification, a new "Competency Witness Check" section appears with:
- ✅ Checkbox to mark as witnessed
- 👤 Dropdown to select witness (from active personnel)
- 📅 Date picker for witness date (auto-fills to today)
- 📝 Text area for witness notes

**Read-Only Display:**
- Green checkmark icon (✓) next to NDT cert names that have been witnessed
- Witness status section showing:
  - ✓ "Witnessed (date)" in green for witnessed certs
  - ○ "Not witnessed" in gray for unwitnessed certs
  - Witness notes if present

**Smart Behavior:**
- Witness section only appears for NDT certifications
- Checking the box auto-fills current date and current user
- Can change witness to another user if needed
- Unchecking removes witness data

## User Workflow

### Recording a Witness Check

1. Navigate to Personnel Management → Personnel Directory
2. Click on a person to expand their competencies
3. Find an NDT certification (e.g., "EN 9712 PAUT L2")
4. Click the edit (pencil) icon
5. Scroll to "Competency Witness Check" section
6. Check the "Competency Witness Check" box
7. Verify/change the witness (defaults to you)
8. Verify/change the date (defaults to today)
9. Optionally add witness notes
10. Click Save

### Viewing Witness Status

**Quick View:**
- Look for the green checkmark (✓) next to NDT certification names
- Hover over the checkmark to see witness date

**Detailed View:**
- Expand the certification card
- Scroll to the bottom to see full witness details
- View witness notes if present

## Visual Indicators

### Icons
- ✓ Green checkmark = Witnessed
- ○ Gray circle with X = Not witnessed

### Colors
- **Green (#10b981)**: Witnessed successfully
- **Gray (#6b7280)**: Not yet witnessed

## NDT Certifications Requiring Witness Checks

The following NDT certifications automatically show the witness check feature:

### EN 9712 Certifications
- EN 9712 PAUT L3
- EN 9712 PAUT L2
- EN 9712 TOFD L3
- EN 9712 TOFD L2
- EN 9712 RAD L2
- EN 9712 MUT L3
- EN 9712 MUT L2 3.8/3.9
- EN 9712 MUT L2 3.1/3.2
- EN 9712 ECI L2
- EN 9712 MPI L2
- EN 9712 LPI L2
- EN 9712 VIS L2

### Other NDT Certifications
- Basic Radiation Safety
- PEC L2 Training

**Note:** PCN Number is excluded as it's an informational field, not a certification requiring witness.

## Future Enhancements

### Planned Features
1. **Witness Check History** - Track multiple witness checks over time
2. **Witness Check Reminders** - Alert when NDT cert added but not witnessed within X days
3. **Dashboard Statistics** - Show % of NDT certs witnessed across organization
4. **Bulk Witness Operations** - Witness multiple certs at once for site visits
5. **Signature Capture** - Digital signature from witness
6. **Email Notifications** - Alert personnel when their cert has been witnessed
7. **Witness Qualifications** - Require L3 certified users to witness certain certs
8. **Export to Reports** - Include witness data in compliance reports

### Possible Improvements
- Add witness expiry (re-witness required every X months)
- Add witness check status filter in Personnel Directory
- Show witness completion percentage in personnel stats
- Add "Requires Re-witness" status for certs approaching witness expiry

## API Reference

### Updating a Competency with Witness Check

```javascript
await supabase
  .from('employee_competencies')
  .update({
    witness_checked: true,
    witnessed_by: 'user-uuid-here',
    witnessed_at: '2024-03-20T10:30:00Z',
    witness_notes: 'Demonstrated proficiency on site inspection'
  })
  .eq('id', competencyId);
```

### Querying Witnessed Certifications

```javascript
const { data } = await supabase
  .from('employee_competencies')
  .select(`
    *,
    competency_definitions(name, category:competency_categories(name))
  `)
  .eq('witness_checked', true)
  .not('witnessed_by', 'is', null);
```

### Getting NDT Witness Statistics

```javascript
import { getWitnessCheckSummary } from '../utils/competency-field-utils.js';

const personnelWithCompetencies = await personnelService.getAllPersonnelWithCompetencies();
const person = personnelWithCompetencies.find(p => p.id === userId);
const stats = getWitnessCheckSummary(person.competencies);

console.log(`${stats.witnessed}/${stats.total} NDT certs witnessed (${stats.percentage}%)`);
```

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Witness section appears for NDT certifications only
- [ ] Witness section does NOT appear for non-NDT certifications
- [ ] Checking witness box auto-fills date and current user
- [ ] Can change witness to another user
- [ ] Can change witness date
- [ ] Witness notes save correctly
- [ ] Green checkmark appears next to witnessed NDT certs
- [ ] Hover tooltip shows witness date
- [ ] Witness status displays correctly in read-only view
- [ ] Witness notes display when present
- [ ] Unchecking witness box clears witness data
- [ ] Saving witness data persists across page refresh
- [ ] All NDT cert types show witness feature
- [ ] PCN Number does NOT show witness feature

## Troubleshooting

### Witness section not appearing
- Verify the certification is in the "NDT Certifications" category
- Check that the certification name matches NDT patterns
- Ensure the field type is `expiry_date` (not just `text` or `boolean`)

### Can't save witness data
- Check user has admin or org_admin role
- Verify database migration was applied
- Check browser console for errors
- Ensure witness user ID is valid

### Checkmark not showing
- Verify `witness_checked` is `true` in database
- Check that `requiresWitnessCheck()` returns `true` for the cert
- Clear browser cache and refresh

## Support

For issues or questions about the NDT Witness Check feature:
1. Check the troubleshooting section above
2. Review the code changes in the related files
3. Check database records to verify data integrity
4. Review browser console for JavaScript errors

## Technical Notes

### Why Extend `employee_competencies` Table?
Rather than creating a separate `witness_checks` table, we extended the existing `employee_competencies` table because:
- Each competency has one current witness check (not historical tracking yet)
- Simpler queries (no joins needed)
- Easier to maintain
- Better performance
- Natural fit with existing data model

### Why Not Use the Old Boolean Fields?
The seed data already had boolean fields like "EN 9712 PAUT L2 - Matrix competency witness inspection", but these only stored yes/no. The new system stores:
- Who witnessed (accountability)
- When witnessed (audit trail)
- Notes from witness (quality assurance)

The old boolean fields are kept for backward compatibility but are not actively used by the new system.
