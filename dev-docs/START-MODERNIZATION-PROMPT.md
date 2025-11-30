# Modernization Kickoff Prompt

Copy and paste this prompt to start the modernization effort with a new Claude instance:

---

## Prompt to Copy:

```
I'm starting the NDT Suite modernization effort. Before doing anything:

1. Read `dev-docs/modernization-plan.md` - this is the strategic plan
2. Read `dev-docs/modernization-tasks.md` - this is the task checklist
3. Follow all rules in `.claude/CLAUDE.md` strictly

We are beginning Phase 1: Foundation. Complete these tasks in order:

### Task 1: Install React Query
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### Task 2: Create Query Client Configuration
Create `src/lib/query-client.js` with the configuration from the modernization plan.

### Task 3: Update App.jsx
Wrap the app with QueryClientProvider and add ReactQueryDevtools (dev only).

### Task 4: Delete Dead Code
- Delete `src/components/Layout.jsx` (unused, replaced by LayoutNew.jsx)
- Verify it's not imported anywhere first

### Task 5: Create Directory Structure
Create these directories:
- `src/hooks/queries/`
- `src/hooks/mutations/`
- `src/components/ui/`
- `src/lib/`

### Task 6: Create First Query Hooks
Create these initial hooks following the patterns in CLAUDE.md:
- `src/hooks/queries/useProfile.js`
- `src/hooks/queries/useCompetencies.js`

Use the existing services (competency-service.js, etc.) as the query functions.

### Task 7: Update modernization-tasks.md
Mark completed tasks with [x] as you finish them.

Work through each task incrementally. After each task:
- Verify it works (no build errors)
- Commit with a descriptive message
- Update the task checklist

Do NOT proceed to Phase 2 until all Phase 1 tasks are complete and verified.

Start by reading the modernization documents, then begin Task 1.
```

---

## Alternative: Resume Prompt

If Phase 1 is already started, use this:

```
I'm continuing the NDT Suite modernization effort.

1. Read `dev-docs/modernization-tasks.md` to see current progress
2. Read `dev-docs/modernization-plan.md` for context
3. Follow all rules in `.claude/CLAUDE.md`

Run `/modernization-status` to see where we are, then continue from the next incomplete task.

Remember:
- ALL data fetching must use React Query
- NO components over 300 lines
- NEVER add to src/tools/ (legacy)
- Update task checklist as you complete items
- Commit after each completed task
```

---

## Quick Start Commands

After pasting the prompt, you can use these commands:

| Command | Purpose |
|---------|---------|
| `/modernization-status` | See current progress |
| `/check-architecture` | Verify compliance before implementing |
| `/build-and-fix` | Run build and fix errors |
| `/code-review` | Review code quality |

---

## Phase Completion Checklist

Before moving to next phase, verify:

### Phase 1 Complete When:
- [ ] React Query installed and configured
- [ ] App.jsx wrapped with QueryClientProvider
- [ ] Layout.jsx deleted
- [ ] Directory structure created
- [ ] At least 2 query hooks created and working
- [ ] Build passes with no errors
- [ ] All Phase 1 tasks marked complete in modernization-tasks.md

### Phase 2 Complete When:
- [ ] LoadingSpinner component created
- [ ] ErrorDisplay component created
- [ ] DataTable component extracted
- [ ] Modal component extracted
- [ ] Form components created
- [ ] All components exported from index.js files

### Phase 3 Complete When:
- [ ] ProfilePage migrated to React Query + split components
- [ ] PersonnelPage migrated to React Query + split components
- [ ] Old monolithic files removed
- [ ] All functionality verified working

---

## Tips for Effective Sessions

1. **One phase at a time** - Don't jump ahead
2. **Commit frequently** - After each task completion
3. **Test as you go** - Run build after changes
4. **Update docs** - Mark tasks complete immediately
5. **Be explicit** - Tell Claude exactly which task you're on

---

*Last Updated: 2025-11-27*
