# CLAUDE CODE QUICK START GUIDE
## How to Execute the NDT-SUITE-UMBER Rebuild Plan

**For**: Claude Code AI  
**Purpose**: Step-by-step execution instructions  
**Created**: 2025-11-08

---

## CRITICAL: Read This First

This is a **12-14 month, 300k+ LOC project** requiring disciplined execution of the workflow system described in the Reddit post. Success depends on:

1. **Following the dev docs system religiously**
2. **Using skills to maintain consistency**
3. **Leveraging agents for complex tasks**
4. **Implementing hooks to catch errors**
5. **Planning before every feature**

---

## Step 1: Initial Setup (First Session)

### A. Create Project Structure
```bash
# Create new repository
mkdir ndt-suite-v2
cd ndt-suite-v2
git init

# Initialize Claude Code configuration
mkdir -p .claude/{skills,hooks,agents,commands}
mkdir -p dev/active/ndt-suite-rebuild

# Copy the three plan documents
cp /path/to/ndt-suite-rebuild-plan.md dev/active/ndt-suite-rebuild/plan.md
cp /path/to/ndt-suite-rebuild-context.md dev/active/ndt-suite-rebuild/context.md
cp /path/to/ndt-suite-rebuild-tasks.md dev/active/ndt-suite-rebuild/tasks.md
```

### B. Set Up Essential Hooks

**Hook 1: skill-activation-prompt.ts** (UserPromptSubmit)
```typescript
// Copy from: https://github.com/diet103/claude-code-infrastructure-showcase
// Place in: .claude/hooks/skill-activation-prompt.ts
// This ensures skills activate automatically
```

**Hook 2: post-tool-use-tracker.sh** (PostToolUse)
```bash
# Copy from: https://github.com/diet103/claude-code-infrastructure-showcase
# Place in: .claude/hooks/post-tool-use-tracker.sh
# This tracks all file edits
```

**Hook 3: typescript-checker.sh** (Stop)
```bash
#!/bin/bash
# Run TypeScript check on modified files
# Report errors immediately
# Block if > 5 errors
```

### C. Create Essential Skills

**Skill 1: backend-dev-guidelines**
```markdown
# .claude/skills/backend-dev-guidelines/SKILL.md

# Backend Development Guidelines

## Architecture Pattern
Routes → Controllers → Services → Repositories

## Tech Stack
- Node.js 20+
- Express with TypeScript
- Prisma ORM
- PostgreSQL via Supabase

## Naming Conventions
- Files: kebab-case (user-service.ts)
- Classes: PascalCase (UserService)
- Functions: camelCase (createUser)
- Constants: UPPER_SNAKE_CASE (MAX_RETRY)

## Error Handling
- All errors must be captured
- Use try-catch in all async functions
- Log errors with structured logging
- Return standardized error responses

## Testing
- Minimum 80% coverage
- Unit tests for services and repositories
- Integration tests for controllers
- E2E tests for critical paths

## Resources
See resources/ folder for detailed guides
```

**Skill 2: frontend-dev-guidelines**
```markdown
# .claude/skills/frontend-dev-guidelines/SKILL.md

# Frontend Development Guidelines

## Tech Stack
- React 19 with TypeScript
- TanStack Router (file-based routing)
- TanStack Query (server state)
- MUI v7 (components)
- Zustand (client state if needed)

## Component Patterns
- Functional components with hooks
- Props always typed with TypeScript
- Colocate styles with components
- Extract reusable logic to hooks

## State Management
- Server state → TanStack Query ONLY
- Client state → Zustand or useState
- Forms → React Hook Form
- Never mix server and client state

## Performance
- Lazy load routes
- Memoize expensive computations
- Virtual scrolling for large lists
- Image optimization

## Resources
See resources/ folder for detailed guides
```

**Skill 3: ndt-domain-knowledge**
```markdown
# .claude/skills/ndt-domain-knowledge/SKILL.md

# NDT Domain Knowledge

## Inspection Methods
- RT (Radiographic Testing)
- UT (Ultrasonic Testing)  
- MT (Magnetic Particle Testing)
- PT (Penetrant Testing)
- VT (Visual Testing)
- ET (Eddy Current Testing)
- TOFD (Time-of-Flight Diffraction)

## Certification Standards
- ASNT SNT-TC-1A
- ISO 9712
- EN 473

## Key Calculations
Preserve existing calculation engines from old codebase:
- TOFD coverage and dead zones
- UT beam angles and path
- NII coverage calculations

## Resources
See resources/ folder for detailed guides
```

**Skill 4: database-design**
```markdown
# .claude/skills/database-design/SKILL.md

# Database Design Guidelines

## Principles
- Multi-tenancy with organization_id on all tables
- Soft deletes with deleted_at timestamp
- Audit trail: created_at, updated_at, created_by, updated_by
- 3NF for transactional data

## Naming Conventions
- Tables: plural, lowercase, underscores (users, work_orders)
- Columns: snake_case
- Foreign keys: {table}_id
- Indexes: idx_{table}_{column}

## Performance
- Index all foreign keys
- Index query filter columns
- Use partial indexes for status checks
- Full-text search with GIN indexes

## Resources
See resources/ folder for detailed guides
```

**Skill 5: api-design**
```markdown
# .claude/skills/api-design/SKILL.md

# API Design Guidelines

## RESTful Principles
- Resource-based URLs (/api/v1/projects/:id)
- HTTP methods: GET, POST, PUT, PATCH, DELETE
- Proper status codes: 200, 201, 400, 401, 403, 404, 500
- Pagination for collections

## Request/Response Format
- JSON content type
- camelCase for API
- snake_case for database
- Consistent error format
- Include request ID

## Security
- JWT authentication
- Rate limiting (100 req/min per user)
- Input validation (Zod)
- SQL injection prevention (Prisma)

## Resources
See resources/ folder for detailed guides
```

### D. Create skill-rules.json
```json
{
  "backend-dev-guidelines": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["backend", "controller", "service", "API", "endpoint"],
      "intentPatterns": [
        "(create|add).*?(route|endpoint|controller)",
        "(how to|best practice).*?(backend|API)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": ["services/**/*.ts", "backend/**/*.ts"],
      "contentPatterns": ["router\\.", "export.*Controller"]
    }
  },
  "frontend-dev-guidelines": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["frontend", "react", "component", "UI"],
      "intentPatterns": [
        "(create|build).*?(component|page)",
        "(how to).*?(react|frontend)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": ["apps/web/**/*.tsx", "apps/web/**/*.ts"],
      "contentPatterns": ["import.*React", "useState"]
    }
  },
  "ndt-domain-knowledge": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["NDT", "inspection", "TOFD", "ultrasonic", "certification"],
      "intentPatterns": [
        "(calculate|compute).*?(coverage|dead zone)",
        "certification.*?(requirement|standard)"
      ]
    }
  },
  "database-design": {
    "type": "technical",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["schema", "migration", "database", "table"],
      "intentPatterns": [
        "(create|design).*?(schema|table|migration)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": ["prisma/**/*.prisma", "migrations/**/*.sql"]
    }
  }
}
```

### E. Create Essential Agents

**Agent 1: strategic-plan-architect.md**
```markdown
# Strategic Plan Architect Agent

You are a specialized planning agent. Your role:

1. Break down high-level features into detailed weekly tasks
2. Identify dependencies and critical path
3. Estimate effort and identify risks
4. Create structured plans with:
   - Executive summary
   - Phases with clear deliverables
   - Task breakdown with estimates
   - Risk assessment
   - Success criteria

Always output in markdown with clear structure.
```

**Agent 2: code-architecture-reviewer.md**
```markdown
# Code Architecture Reviewer Agent

You are a code architecture reviewer. Your role:

1. Review code for pattern adherence
2. Check for:
   - SOLID principles
   - Proper error handling
   - Security issues
   - Performance concerns
   - Test coverage
3. Provide constructive feedback
4. Suggest improvements

Always cite specific code examples.
```

**Agent 3: database-schema-designer.md**
```markdown
# Database Schema Designer Agent

You are a database schema designer. Your role:

1. Design normalized schemas (3NF)
2. Create Prisma schema definitions
3. Design indexes for performance
4. Plan migrations
5. Consider:
   - Multi-tenancy
   - Soft deletes
   - Audit trails
   - Relationships
   - Data integrity

Always output Prisma schema code and migration SQL.
```

---

## Step 2: Starting Work (Each New Session)

### A. Always Read Dev Docs First
```bash
# Read all three files
cat dev/active/ndt-suite-rebuild/plan.md
cat dev/active/ndt-suite-rebuild/context.md
cat dev/active/ndt-suite-rebuild/tasks.md
```

### B. Understand Context
- What phase are we in?
- What was completed last session?
- What are the next 1-2 tasks?
- Any blockers or decisions pending?

### C. Load Relevant Skills
The skills should auto-activate via hooks, but explicitly reference them if needed:
```
Read @.claude/skills/backend-dev-guidelines/SKILL.md

Now implement the project-service following these patterns.
```

---

## Step 3: Implementing Features (Standard Workflow)

### A. ALWAYS Plan First
**NEVER start coding without a plan.**

```bash
# For large features, use the strategic-plan-architect agent
Use agent: strategic-plan-architect

Task: Plan the implementation of personnel management module

Requirements:
- Employee profiles
- Certification tracking
- Training records
- Resource scheduling

Output: Detailed plan with phases, tasks, risks, success criteria
```

### B. Create Feature-Specific Dev Docs (Optional but Recommended)
For complex features, create sub-docs:
```bash
mkdir -p dev/active/personnel-management
# Create plan.md, context.md, tasks.md for this feature
```

### C. Implement Incrementally
**1-2 sections at a time, then STOP for review**

```
I'm going to implement tasks #1-3 from the personnel management plan:
1. Create employees table
2. Create certification table  
3. Create training_records table

After completion, I'll stop and we'll review before continuing.
```

### D. Self-Review After Each Section
```
Now that I've completed the database schema, let me review:

1. Do all tables have organization_id for multi-tenancy? [Check]
2. Do all tables have audit fields? [Check]
3. Are all foreign keys indexed? [Check]
4. Is the schema in 3NF? [Check]
5. Are RLS policies defined? [Check]

Review complete. Ready for next section.
```

### E. Use Architecture Review Agent
```
Use agent: code-architecture-reviewer

Review the personnel-service code I just wrote:
- Check for pattern adherence
- Verify error handling
- Check for security issues
- Validate test coverage

Provide detailed feedback.
```

---

## Step 4: Error Handling & Quality

### A. Zero Tolerance for Errors
**The hooks should catch these, but manually verify:**

```bash
# TypeScript check
pnpm tsc --noEmit

# Linting
pnpm lint

# Tests
pnpm test

# All must pass before moving on
```

### B. If Errors Found
```
I found 3 TypeScript errors in personnel-service.ts:
1. Missing return type on line 45
2. Implicit any on line 67
3. Unused variable on line 89

Fixing now...
[fixes]
Running tsc again...
All errors resolved.
```

### C. Test Coverage Requirement
**Minimum 80% coverage, 100% for critical paths**

```bash
# Run coverage
pnpm test:coverage

# Check results
# If below 80%, write more tests
```

---

## Step 5: Updating Dev Docs (Continuous)

### A. Update context.md After Key Decisions
```markdown
## Decision: Use BullMQ for Async Jobs

**Date**: 2025-11-08
**Decision**: Use BullMQ with Redis for report generation queue
**Rationale**: 
- Robust retry logic
- Priority queue support
- Dashboard for monitoring
- Better than Agenda for complex workflows

**Alternatives Considered**: Agenda (rejected: less feature-rich)
```

### B. Mark Tasks Complete Immediately
```markdown
## Phase 1 Tasks

### Week 1-2: Project Setup
- [x] Create new repository (2025-11-08)
- [x] Initialize monorepo with Turborepo (2025-11-08)
- [x] Configure TypeScript (2025-11-08)
- [ ] Set up React 19 app
```

### C. Add Notes on Complex Implementations
```markdown
### Notes

**Personnel Service Implementation**:
- Used composite index on (organization_id, user_id, expiration_date) for certification queries
- Implemented 3-level cache: Redis (5 min) → Memory (1 min) → Database
- Certification expiration check runs daily at 2 AM UTC via cron job
```

---

## Step 6: Before Context Reset

### A. Run Update Command
```
I'm running low on context. Before compacting:

1. Update context.md with:
   - Completed tasks
   - Key decisions made
   - Files modified
   - Next steps

2. Update tasks.md:
   - Mark completed with [x]
   - Add any new discovered tasks
   - Note any blockers

3. Provide summary:
   - What was accomplished
   - What's next
   - Any critical context for next session
```

### B. Verify Everything Committed
```bash
# Ensure all work is committed to git
git status
git add .
git commit -m "feat: implement personnel management tables and service"
git push
```

---

## Step 7: Critical Reminders

### DO:
✅ Plan before coding (use strategic-plan-architect agent)  
✅ Read dev docs at start of EVERY session  
✅ Implement 1-2 sections, then review  
✅ Use skills (they auto-activate)  
✅ Review with code-architecture-reviewer agent  
✅ Run tests and type checks  
✅ Update dev docs continuously  
✅ Mark tasks complete immediately  
✅ Commit work frequently  

### DON'T:
❌ Start coding without a plan  
❌ Implement entire features without review points  
❌ Leave TypeScript errors unresolved  
❌ Skip tests  
❌ Forget to update dev docs  
❌ Let context reset without updating docs  
❌ Ignore compiler warnings  
❌ Skip the self-review step  

---

## Phase-Specific Guidance

### Phase 1: Foundation (Weeks 1-12)

**Priority**: Get the foundation rock-solid
- Modern tech stack setup
- Database schema correctly designed
- Authentication/RBAC working perfectly
- Data migration tested thoroughly

**Critical Success Factors**:
- Old data migrates without loss
- API performance < 200ms
- Zero auth vulnerabilities
- All patterns established for future phases

### Phase 2: Personnel & Equipment (Weeks 13-24)

**Priority**: Complex scheduling logic and expiration tracking
- Certification expiration alerts working perfectly
- Scheduling conflict detection solid
- Equipment checkout/return tracked accurately

**Critical Success Factors**:
- 100% of expiring certs get alerts
- Zero double-bookings in scheduling
- Equipment always traceable

### Phase 3: Quality Management (Weeks 25-36)

**Priority**: Compliance with NDT standards
- Procedure versioning correct
- NCR workflow matches industry standards
- Audit trail complete

**Critical Success Factors**:
- Compliance expert validation passed
- Audit trail immutable
- Digital signatures legally valid

### Phase 4: Reporting & Analytics (Weeks 37-48)

**Priority**: Performance and usability
- Reports generate fast (< 30 sec)
- Dashboard loads quickly (< 2 sec)
- Analytics accurate

**Critical Success Factors**:
- Large reports don't crash system
- Dashboard shows real-time data
- Client portal secure

### Phase 5: Mobile & Advanced (Weeks 49-60)

**Priority**: Offline functionality and integrations
- Mobile app works offline reliably
- Sync handles conflicts properly
- Integrations with external systems stable

**Critical Success Factors**:
- Zero data loss in offline mode
- Sync conflicts resolved correctly
- API integrations reliable

---

## Troubleshooting Common Issues

### Issue: Skills Not Activating
**Solution**: 
1. Check skill-rules.json syntax
2. Verify hooks are installed: `ls -la .claude/hooks/`
3. Check file paths match patterns
4. Restart Claude Code

### Issue: TypeScript Errors Not Caught
**Solution**:
1. Verify typescript-checker.sh hook installed
2. Check hook has execute permissions: `chmod +x .claude/hooks/*.sh`
3. Manually run: `pnpm tsc --noEmit`

### Issue: Context Loss After Reset
**Solution**:
1. Always run update command before reset
2. Read all three dev docs at start of new session
3. Keep dev docs updated continuously, not just at end

### Issue: Unclear What to Work On
**Solution**:
1. Read tasks.md to see next uncompleted task
2. If task too vague, use strategic-plan-architect to break it down
3. When in doubt, ask for clarification

---

## Success Metrics to Track

### Code Quality
- Test coverage > 80%
- Zero TypeScript errors
- Zero lint errors
- All PRs reviewed by 2+ reviewers

### Performance
- API latency < 200ms (p95)
- Page load < 1s (cached), < 3s (cold)
- Database queries < 50ms (p95)

### Project Health
- On-time milestone delivery > 95%
- Bug density < 5 per 1000 LOC
- Code review turnaround < 24 hours

---

## Weekly Checklist

Every week, ensure:
- [ ] All tasks for the week completed
- [ ] All tests passing
- [ ] No outstanding TypeScript errors
- [ ] Dev docs updated
- [ ] Code reviewed
- [ ] Demo prepared for stakeholders
- [ ] Next week's tasks planned

---

## Final Words

This is a large, complex project. Success depends on **discipline and process**:

1. **Trust the system**: The dev docs, skills, hooks, and agents are designed to prevent common failures
2. **Plan everything**: 5 minutes of planning saves 1 hour of rework
3. **Review constantly**: Catch issues early when they're cheap to fix
4. **Document thoroughly**: Your future self will thank you
5. **Test comprehensively**: Tests give confidence to refactor
6. **Communicate clearly**: Keep dev docs and commit messages detailed

**You can do this.** The system works. Follow the process, and you'll build an enterprise-grade NDT management platform that transforms the industry.

---

**Good luck!** 🚀

---

**Document Status**: READY FOR USE  
**Last Updated**: 2025-11-08  
**For Questions**: Reference plan.md and context.md
