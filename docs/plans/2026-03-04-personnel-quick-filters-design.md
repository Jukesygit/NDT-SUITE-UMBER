# Personnel Quick Filters + IRATA Level Field

## Objective
Add quick filter buttons to the personnel directory for common cert lookups: IRATA L1/L2/L3, PAUT L2, TOFD L2. Requires adding a `level` column to `employee_competencies` for structured IRATA level data.

## Data Model

### New column on `employee_competencies`
```sql
ALTER TABLE employee_competencies ADD COLUMN level TEXT;
```

- Stores certification level (e.g., "L1", "L2", "L3") for competencies that have levels
- Currently only used by IRATA; extensible for future competencies
- No constraints — optional free text field

### PAUT L2 / TOFD L2
Already exist as separate `competency_definitions` entries (`EN 9712 PAUT L2`, `EN 9712 TOFD L2`) with `expiry_date` field type. No data model changes needed.

## Quick Filter UI

### Placement
New row of pill/chip buttons below the existing filter bar in PersonnelPage.tsx.

### Buttons
- IRATA L1, IRATA L2, IRATA L3
- PAUT L2, TOFD L2

### Behavior
- Toggle buttons — click to activate/deactivate
- Multiple can be active at once (OR logic between quick filters)
- Quick filters combine with existing dropdown/search filters via AND logic
- "Clear" link appears when any quick filter is active

### Filter Logic
| Button | Condition |
|--------|-----------|
| IRATA L1 | Has competency where name='IRATA Expiry Date' AND level='L1' AND expiry_date > today |
| IRATA L2 | Has competency where name='IRATA Expiry Date' AND level='L2' AND expiry_date > today |
| IRATA L3 | Has competency where name='IRATA Expiry Date' AND level='L3' AND expiry_date > today |
| PAUT L2 | Has competency where name='EN 9712 PAUT L2' AND expiry_date > today |
| TOFD L2 | Has competency where name='EN 9712 TOFD L2' AND expiry_date > today |

## Level Input on Competency Forms

### EditCompetencyModal.tsx changes
- Add `level` to `CompetencyFormData` interface
- Show a "Level" dropdown (L1, L2, L3) when competency name contains "IRATA"
- Pass `level` through mutation hooks to service layer

### Service/Hook changes
- `useCompetencyMutations.ts` — pass `level` field to `competencyService.upsertCompetency()`
- `competency-service.js` — include `level` in upsert/update calls to Supabase

## Files to Modify

1. **Database**: New migration SQL (`database/add-level-field.sql`)
2. **Types**: `usePersonnel.ts` — add `level` to `PersonCompetency`
3. **Form**: `EditCompetencyModal.tsx` — add level dropdown + form data
4. **Mutations**: `useCompetencyMutations.ts` — pass level to service
5. **Service**: `competency-service.js` — include level in DB operations
6. **Personnel page**: `PersonnelPage.tsx` — add quick filter state + filter logic
7. **Filters UI**: `PersonnelFilters.tsx` or new `QuickFilters` component — render buttons
8. **Styles**: `personnel.css` — quick filter button styles
