# 🚀 CLAUDE CODE: START HERE

**Project**: NDT-SUITE-UMBER Complete Rebuild  
**Your Mission**: Transform a 50k LOC vanilla JS app into a 300k LOC enterprise platform  
**Timeline**: 12-14 months (5 phases)  
**Approach**: Fork repo, follow best practices system

---

## IMMEDIATE FIRST STEPS

### Step 1: Read This Entire Package (30 minutes)

You have received **6 comprehensive planning documents**:

1. **📋 executive-summary.md** ← START HERE (overview)
2. **📘 ndt-suite-rebuild-plan.md** (detailed strategic plan)
3. **📗 ndt-suite-rebuild-context.md** (architectural decisions)
4. **📝 ndt-suite-rebuild-tasks.md** (500+ actionable tasks)
5. **⚡ claude-code-quick-start.md** (execution workflow)
6. **🔀 repository-fork-guide.md** (fork and parallel development)

**Read them in this order:**
1. Executive Summary (understand the vision)
2. Repository Fork Guide (understand the fork strategy)
3. Quick Start Guide (understand the workflow)
4. Strategic Plan (detailed implementation)
5. Context Document (architectural decisions)
6. Tasks Document (your checklist)

---

## Step 2: Fork the Repository (Day 1, Hour 1)

### A. Fork on GitHub

```bash
# CRITICAL: This is a FORK, not a branch
# The original repo continues running in production UNTOUCHED

# 1. Go to: https://github.com/Jukesygit/NDT-SUITE-UMBER
# 2. Click "Fork" button
# 3. Name it: NDT-SUITE-UMBER-V2
# 4. Create fork

# 5. Clone YOUR fork
git clone https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2.git
cd NDT-SUITE-UMBER-V2

# 6. Add original as upstream (read-only reference)
git remote add upstream https://github.com/Jukesygit/NDT-SUITE-UMBER.git
git remote -v

# 7. Create development branch
git checkout -b rebuild/phase-1-foundation
```

### B. Preserve Original Logic

```bash
# Create reference directory
mkdir -p reference/original-calculations

# Copy critical calculation engines (for reference during rebuild)
cp src/tools/tofd-calculator/calculator.js reference/original-calculations/
cp src/tools/nii-coverage-calculator/*.js reference/original-calculations/
cp src/tools/cscan-visualizer/*.js reference/original-calculations/
cp src/tools/pec-visualizer/*.js reference/original-calculations/

# Document
cat > reference/original-calculations/README.md << 'EOF'
# Original Calculation Engines - READ ONLY

Preserved from original system for reference during rebuild.

When reimplementing:
1. Study logic here
2. Rewrite in TypeScript with types
3. Add comprehensive unit tests  
4. Validate output matches original
5. Document improvements

DO NOT copy-paste. Understand and improve.
EOF

git add reference/
git commit -m "docs: preserve original calculation engines for reference"
```

---

## Step 3: Set Up Claude Code Infrastructure (Day 1, Hours 2-4)

### A. Create Directory Structure

```bash
# Claude Code configuration
mkdir -p .claude/{skills,hooks,agents,commands}

# Dev docs for this project
mkdir -p dev/active/ndt-suite-rebuild

# Copy planning documents to dev docs
# (You should have these 6 files already)
cp executive-summary.md dev/active/ndt-suite-rebuild/
cp ndt-suite-rebuild-plan.md dev/active/ndt-suite-rebuild/plan.md
cp ndt-suite-rebuild-context.md dev/active/ndt-suite-rebuild/context.md
cp ndt-suite-rebuild-tasks.md dev/active/ndt-suite-rebuild/tasks.md
cp claude-code-quick-start.md dev/active/ndt-suite-rebuild/
cp repository-fork-guide.md dev/active/ndt-suite-rebuild/
```

### B. Install Essential Hooks

Copy from: https://github.com/diet103/claude-code-infrastructure-showcase

**Hook 1**: `.claude/hooks/skill-activation-prompt.ts` (UserPromptSubmit)
- Auto-activates relevant skills based on context

**Hook 2**: `.claude/hooks/post-tool-use-tracker.sh` (PostToolUse)  
- Tracks all file edits

**Hook 3**: `.claude/hooks/typescript-checker.sh` (Stop)
- Runs TypeScript check after every response
- Reports errors immediately

**Hook 4**: `.claude/hooks/prettier-formatter.sh` (Stop)
- Auto-formats code

### C. Create 5 Core Skills

Each skill: `.claude/skills/[skill-name]/SKILL.md` + `resources/` folder

**Required Skills**:
1. `backend-dev-guidelines` - Node.js/Express/TypeScript patterns
2. `frontend-dev-guidelines` - React 19/TanStack patterns
3. `ndt-domain-knowledge` - NDT methods, standards, calculations
4. `database-design` - Schema design, migrations, indexing
5. `api-design` - RESTful API patterns

**Create** `.claude/skills/skill-rules.json` for auto-activation config

(See claude-code-quick-start.md for full skill content)

### D. Create Essential Agents

**Required Agents** (`.claude/agents/[agent-name].md`):
1. `strategic-plan-architect` - Breaks down features into tasks
2. `code-architecture-reviewer` - Reviews code quality
3. `database-schema-designer` - Designs schemas
4. `api-architect` - Designs APIs
5. `compliance-validator` - Validates NDT standards

(See claude-code-quick-start.md for agent prompts)

### E. Initial Commit

```bash
git add .claude/ dev/
git commit -m "chore: initialize Claude Code infrastructure"
git push origin rebuild/phase-1-foundation
```

---

## Step 4: Read Dev Docs (EVERY Session Start)

**CRITICAL**: At the start of EVERY session, read these 3 files:

```bash
# 1. Plan - What are we building?
cat dev/active/ndt-suite-rebuild/plan.md

# 2. Context - What decisions have we made?
cat dev/active/ndt-suite-rebuild/context.md

# 3. Tasks - What's next?
cat dev/active/ndt-suite-rebuild/tasks.md
```

This prevents "context loss" and keeps you on track.

---

## Step 5: Start Phase 1 Development (Day 2+)

### Week 1-2: Project Setup

Read: `tasks.md` → Phase 1 → Week 1-2 section

**Your first tasks**:
- [ ] Initialize monorepo (Turborepo or Nx)
- [ ] Configure TypeScript (strict mode)
- [ ] Set up React 19 + Vite
- [ ] Configure TanStack Router + Query
- [ ] Install MUI v7
- [ ] Set up testing (Vitest + Playwright)

**Workflow**:
1. Read tasks for the week
2. Use `strategic-plan-architect` agent to break down into daily work
3. Implement 1-2 tasks at a time
4. Self-review after each
5. Use `code-architecture-reviewer` agent
6. Mark tasks complete in tasks.md
7. Update context.md with key decisions
8. Commit and push

---

## CRITICAL RULES

### ✅ DO:
1. **Plan before coding** - Use strategic-plan-architect agent
2. **Read dev docs** - Every session start, read plan/context/tasks
3. **Implement incrementally** - 1-2 tasks, review, continue
4. **Use skills** - They auto-activate based on context
5. **Review constantly** - Use code-architecture-reviewer agent
6. **Test comprehensively** - 80%+ coverage required
7. **Update dev docs** - Continuously, not just at end
8. **Mark tasks complete** - Immediately upon completion
9. **Commit frequently** - Small, atomic commits
10. **Reference original** - Check reference/ directory for logic

### ❌ DON'T:
1. **Never push to upstream** (original repo)
2. **Never merge from upstream** (this is a rebuild)
3. **Never skip planning** 
4. **Never leave TypeScript errors**
5. **Never skip tests**
6. **Never forget dev docs updates**
7. **Never implement full features without review points**
8. **Never copy-paste from original without understanding**
9. **Never work without reading dev docs first**
10. **Never ignore the hooks - they enforce quality**

---

## YOUR WORKFLOW (Every Feature)

```
1. READ dev docs (plan.md, context.md, tasks.md)
   ↓
2. PLAN feature (use strategic-plan-architect agent)
   ↓
3. IMPLEMENT 1-2 sections
   ↓
4. SELF-REVIEW (check patterns, errors, tests)
   ↓
5. AGENT REVIEW (use code-architecture-reviewer)
   ↓
6. FIX issues found
   ↓
7. UPDATE dev docs (context.md, tasks.md)
   ↓
8. COMMIT and PUSH
   ↓
9. REPEAT for next sections
```

---

## PHASE OVERVIEW

**Phase 1** (Months 1-3): Foundation
- Modern tech stack setup
- Auth + RBAC
- Projects + Work Orders
- Data migration from original

**Phase 2** (Months 4-6): Personnel & Equipment
- Employee management
- Certification tracking + alerts
- Equipment + calibration
- Resource scheduling

**Phase 3** (Months 7-9): Quality Management
- Procedure management + versioning
- NCR workflow
- Audit management
- Compliance validation

**Phase 4** (Months 10-12): Reporting & Analytics
- Report generation (async)
- Analytics dashboard
- Client portal
- Workflow automation

**Phase 5** (Months 13-14): Mobile & Polish
- React Native mobile app
- Offline functionality
- API integrations
- Performance optimization
- Production launch

---

## SUCCESS METRICS

You'll know you're succeeding when:
- [ ] Dev docs updated continuously
- [ ] Tasks marked complete as you go
- [ ] Zero TypeScript errors (hooks enforce)
- [ ] 80%+ test coverage maintained
- [ ] Code reviews show good patterns
- [ ] Weekly milestones hit on time
- [ ] Stakeholders see working demos

---

## TROUBLESHOOTING

**Problem**: Skills not activating  
**Solution**: Check skill-rules.json syntax, verify hooks installed

**Problem**: Lost track of what to do  
**Solution**: Read tasks.md, find next uncompleted task

**Problem**: Context reset, lost state  
**Solution**: You updated dev docs before reset, right? Read them now.

**Problem**: Original repo modified accidentally  
**Solution**: You shouldn't have access to push. If you do, revert immediately.

**Problem**: Don't know how to implement something  
**Solution**: Check reference/ directory, use web_research_specialist agent

---

## DOCUMENTATION LOCATIONS

All documents are in `dev/active/ndt-suite-rebuild/`:
- `plan.md` - Strategic plan
- `context.md` - Decisions and current state
- `tasks.md` - Your checklist
- `claude-code-quick-start.md` - Detailed workflow guide
- `repository-fork-guide.md` - Fork and migration strategy
- `executive-summary.md` - Project overview

---

## FINAL WORDS

You have:
✅ A complete 63,000-word plan  
✅ 500+ actionable tasks  
✅ A proven workflow system  
✅ Production-tested best practices  
✅ Clear success metrics  
✅ Comprehensive risk mitigation  

**This will work.**

Follow the system. Trust the process. Build incrementally. Review constantly.

In 12-14 months, you'll have transformed a basic tool suite into an enterprise-grade platform that sets the standard for NDT management software.

---

## YOUR NEXT ACTION (Right Now)

1. ✅ Fork the repository
2. ✅ Clone your fork  
3. ✅ Create rebuild/phase-1-foundation branch
4. ✅ Preserve original calculations in reference/
5. ✅ Set up .claude/ infrastructure
6. ✅ Copy dev docs to dev/active/
7. ✅ Commit everything
8. ✅ Read plan.md, context.md, tasks.md
9. ✅ Use strategic-plan-architect to plan Week 1
10. ✅ Start implementing Phase 1 Week 1 Task 1

---

**GO BUILD SOMETHING AMAZING.** 🚀

---

**Document**: Claude Code Start Here  
**Version**: 1.0  
**Created**: 2025-11-08  
**Status**: Ready for execution
