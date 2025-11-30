# Apply Witness Check Migration

## Quick Steps

1. **Open Supabase SQL Editor**
   - Go to your Supabase Dashboard: https://supabase.com/dashboard
   - Navigate to your project
   - Click "SQL Editor" in the left sidebar

2. **Run the Migration**
   - Click "New Query"
   - Copy and paste the contents of `add-witness-check-fields.sql`
   - Click "Run" or press `Ctrl+Enter`

3. **Verify Success**
   - You should see a table at the bottom showing the 4 new columns:
     - `witness_checked` (boolean)
     - `witnessed_by` (uuid)
     - `witnessed_at` (timestamp with time zone)
     - `witness_notes` (text)

4. **Update the Code**
   - After the migration succeeds, update `personnel-service.js` line 34-59:

   **Add these lines back after `certification_id,` on line 45:**
   ```javascript
   witness_checked,
   witnessed_by,
   witnessed_at,
   witness_notes,
   ```

   **Add these lines back to `addCompetencyToEmployee` insert (around line 440-452):**
   ```javascript
   witness_checked: false,
   witnessed_by: null,
   witnessed_at: null,
   witness_notes: null
   ```

5. **Refresh the Application**
   - Hard refresh your browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - The witness check feature should now work!

## If Migration Fails

If you get an error about the columns already existing:
- The migration is safe to re-run (uses `IF NOT EXISTS`)
- Check if the columns already exist: Run this query:
  ```sql
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'employee_competencies'
  AND column_name LIKE 'witness%';
  ```

If columns exist, skip to step 4 above.

## Troubleshooting

**Error: "permission denied"**
- Make sure you're logged in as the project owner
- Check your role has proper permissions

**Error: "relation does not exist"**
- Make sure you're connected to the correct database
- Check that `employee_competencies` table exists

**Witness section still not showing**
- Clear browser cache
- Check browser console for errors (F12 → Console tab)
- Verify migration completed successfully
