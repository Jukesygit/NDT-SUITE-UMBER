# Dev Docs Directory

> **Purpose**: Organize complex feature development with structured documentation

---

## What is Dev Docs?

The Dev Docs system helps you manage complex features by creating three documents per feature:

1. **[feature]-plan.md** - Strategic implementation plan
2. **[feature]-context.md** - Code snippets, architecture, relevant info
3. **[feature]-tasks.md** - Detailed task checklist with progress tracking

---

## When to Use Dev Docs

Create dev docs when:
- Feature will take **>2 hours** to implement
- Feature spans **multiple sessions**
- Feature involves **multiple files/components**
- Feature has **complex business logic**
- You want to **preserve context** across sessions

---

## How to Use

### 1. Start a New Feature

Copy templates and rename:

```bash
# Copy templates
cp templates/feature-plan-template.md my-feature-plan.md
cp templates/feature-context-template.md my-feature-context.md
cp templates/feature-tasks-template.md my-feature-tasks.md

# Or use the slash command
/dev-docs
```

### 2. Fill Out the Plan

Before implementing:
- Define objective and success criteria
- Outline implementation steps
- Identify risks and dependencies
- Get user approval

### 3. Document Context

As you work:
- Add relevant code snippets
- Document database schemas
- Note architecture decisions
- Link to related files

### 4. Track Tasks

Throughout implementation:
- Check off completed tasks
- Add new tasks as discovered
- Note blockers and issues
- Update time estimates

### 5. Update Before Context Compaction

**Important**: Before context gets compacted (long sessions):

```bash
/dev-docs-update
```

This ensures you don't lose progress when context resets.

---

## Directory Structure

```
dev-docs/
├── README.md                          # This file
├── templates/                         # Reusable templates
│   ├── feature-plan-template.md
│   ├── feature-context-template.md
│   └── feature-tasks-template.md
├── [feature-name]-plan.md             # Your feature docs
├── [feature-name]-context.md
├── [feature-name]-tasks.md
└── archive/                           # Completed features
    ├── old-feature-plan.md
    ├── old-feature-context.md
    └── old-feature-tasks.md
```

---

## Example: Personnel Management Feature

If you were building the personnel management feature:

```
dev-docs/
├── personnel-management-plan.md
├── personnel-management-context.md
└── personnel-management-tasks.md
```

**plan.md** would contain:
- Objective: Build personnel certification tracking
- Approach: Supabase tables + React UI
- Implementation steps: Database → API → Components → Testing

**context.md** would contain:
- Competency schema snippets
- RLS policies for employee_competencies
- Component hierarchy diagram
- Related files with line numbers

**tasks.md** would contain:
- [x] Create competency_definitions table
- [x] Create employee_competencies table
- [x] Add RLS policies
- [x] Create PersonnelManagementPage component
- [ ] Add witness check feature
- [ ] Add expiry date notifications

---

## Best Practices

### Do:
- ✅ Update docs as you work
- ✅ Link to actual files with line numbers
- ✅ Mark tasks complete immediately
- ✅ Note decisions and rationale
- ✅ Keep context fresh and relevant
- ✅ Archive completed features

### Don't:
- ❌ Create dev docs for simple 1-file changes
- ❌ Let docs go stale
- ❌ Skip the planning phase
- ❌ Forget to update before context compaction
- ❌ Delete dev docs (archive instead)

---

## Slash Commands

**Create dev docs**: `/dev-docs`
- Generates all three files from templates
- Prompts for feature name
- Opens in editor

**Update dev docs**: `/dev-docs-update`
- Reviews current progress
- Updates task completion
- Adds new learnings
- Use before context compaction!

---

## Archiving Completed Features

When a feature is complete and deployed:

1. Move files to archive:
   ```bash
   mkdir -p archive
   mv feature-*.md archive/
   ```

2. Add completion note:
   ```markdown
   # Archived: [Date]
   Feature completed and deployed to production.
   See git commit: [hash]
   ```

3. Keep for reference and lessons learned

---

## Templates

### Plan Template
- Objective & success criteria
- Implementation strategy
- Database & API changes
- Testing & deployment plan

### Context Template
- Database schemas
- Code snippets
- Architecture diagrams
- Integration points

### Tasks Template
- Phased task breakdown
- Time tracking
- Blocker management
- Completion checklist

---

## Tips for Success

1. **Plan First**: Don't skip the planning document. It saves time later.

2. **Update Context Early**: Add code snippets as you find them, not at the end.

3. **Break Down Tasks**: Smaller tasks = better progress tracking.

4. **Review Regularly**: Re-read context when returning to work.

5. **Capture Decisions**: Document why you chose approach X over Y.

6. **Use Links**: Link to actual files so you can navigate quickly.

7. **Be Honest**: Mark tasks incomplete if not fully done.

---

## Real-World Workflow

**Day 1**:
1. User requests new feature
2. Create dev docs: `/dev-docs`
3. Fill out plan document
4. Get user approval
5. Start implementing
6. Update tasks as you go

**Day 2** (new session):
1. Read plan and context documents
2. Review task checklist
3. Continue where you left off
4. Update context with new code
5. Check off completed tasks

**Before Context Compaction**:
1. Run `/dev-docs-update`
2. Save all learnings and progress
3. Context can reset without losing work

**After Feature Complete**:
1. Verify all tasks checked
2. Deploy to production
3. Archive dev docs
4. Apply learnings to next feature

---

## Integration with Claude Code

Claude Code automatically reads:
- `.claude/CLAUDE.md` - Rules and workflows
- `PROJECT_KNOWLEDGE.md` - Architecture
- `TROUBLESHOOTING.md` - Common issues

Dev Docs complement these by:
- Tracking feature-specific context
- Managing implementation progress
- Preserving decisions across sessions

---

## Questions?

- Check [CLAUDE.md](../.claude/CLAUDE.md) for dev docs workflow rules
- Check [PROJECT_KNOWLEDGE.md](../PROJECT_KNOWLEDGE.md) for architecture
- Ask: "How do I use dev docs for [feature]?"

---

**Created**: 2025-11-11
**Last Updated**: 2025-11-11
