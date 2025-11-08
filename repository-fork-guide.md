# REPOSITORY FORK & PARALLEL DEVELOPMENT GUIDE

**Project**: NDT-SUITE-UMBER Rebuild  
**Purpose**: Maintain old system while building new platform  
**Strategy**: Fork → Rebuild → Parallel Run → Migrate → Sunset  
**Created**: 2025-11-08

---

## Overview

This guide ensures Claude Code rebuilds the NDT suite in a **separate repository** without affecting your production system. The old system continues running while the new platform is built, tested, and validated.

---

## Step 1: Fork the Repository (Claude Code Instructions)

### A. Fork on GitHub

**Claude Code should execute:**

```bash
# Navigate to GitHub and fork the repository
# Manual step: Go to https://github.com/Jukesygit/NDT-SUITE-UMBER
# Click "Fork" button
# Create fork under your account or organization
# Name it: NDT-SUITE-UMBER-V2 or similar

# Once forked, clone the new repository
git clone https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2.git
cd NDT-SUITE-UMBER-V2

# Add original repository as upstream (for reference)
git remote add upstream https://github.com/Jukesygit/NDT-SUITE-UMBER.git
git remote -v

# Output should show:
# origin    https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2.git (fetch)
# origin    https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2.git (push)
# upstream  https://github.com/Jukesygit/NDT-SUITE-UMBER.git (fetch)
# upstream  https://github.com/Jukesygit/NDT-SUITE-UMBER.git (push)
```

### B. Create Development Branch

```bash
# Create a rebuild branch
git checkout -b rebuild/phase-1-foundation

# This branch will be the main development branch
# Keep 'main' branch as a snapshot of the original for reference
```

### C. Document the Fork

Create a `FORK_INFO.md` file:

```markdown
# Fork Information

**Original Repository**: https://github.com/Jukesygit/NDT-SUITE-UMBER  
**Forked Repository**: https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2  
**Fork Date**: 2025-11-08  
**Purpose**: Complete rebuild with modern tech stack

## Relationship to Original

This is a FORK, not a branch. Changes here do NOT affect the original repository.

## Original Repository Status
- Continues running in production
- No changes will be made to original during rebuild
- Original serves as reference for business logic and data structures

## New Repository Status
- Complete rebuild from ground up
- Modern tech stack (React 19, TypeScript, microservices)
- Independent development and deployment
- Will eventually replace original

## Synchronization
- We do NOT sync code changes from original (it's a rebuild, not a refactor)
- We DO reference original for:
  - Business logic understanding
  - Data structure patterns
  - NDT calculation algorithms
  - User workflows

## Migration Plan
Once new platform is complete and validated:
1. Parallel run both systems (30-60 days)
2. Migrate data from old to new
3. Redirect users to new platform
4. Keep old system read-only for 30 days
5. Archive old repository
```

---

## Step 2: Set Up New Repository Structure

### A. Create Branch Protection

**In GitHub Settings → Branches:**

```yaml
Branch protection rules for 'main':
  ✅ Require pull request before merging
  ✅ Require approvals (2)
  ✅ Require status checks to pass
  ✅ Require branches to be up to date
  ✅ Require conversation resolution
  ✅ Include administrators
```

### B. Initialize Claude Code Infrastructure

```bash
# Create Claude Code structure
mkdir -p .claude/{skills,hooks,agents,commands}
mkdir -p dev/active/ndt-suite-rebuild

# Copy planning documents
cp /path/to/ndt-suite-rebuild-plan.md dev/active/ndt-suite-rebuild/plan.md
cp /path/to/ndt-suite-rebuild-context.md dev/active/ndt-suite-rebuild/context.md
cp /path/to/ndt-suite-rebuild-tasks.md dev/active/ndt-suite-rebuild/tasks.md

# Create .gitignore for new structure
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output/

# Production
dist/
build/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Temporary
tmp/
temp/
.cache/

# Claude Code (keep tracking)
!.claude/
EOF

git add .gitignore
git commit -m "chore: initialize new repository structure"
```

### C. Document Original System

Create `docs/ORIGINAL_SYSTEM_REFERENCE.md`:

```markdown
# Original System Reference

This document tracks what we're preserving from the original NDT-SUITE-UMBER.

## Business Logic to Preserve

### TOFD Calculator
**Location**: `src/tools/tofd-calculator/calculator.js`
**Preserve**: All calculation formulas and algorithms
**Reason**: Physics-based calculations are domain-specific and tested

### C-Scan Visualizer
**Location**: `src/tools/cscan-visualizer/renderer.js`
**Preserve**: Rendering logic and data interpretation
**Reason**: Visualization algorithms are complex and correct

### PEC Visualizer
**Location**: `src/tools/pec-visualizer/`
**Preserve**: Eddy current data processing
**Reason**: Domain-specific signal processing

### 3D Viewer
**Location**: `src/tools/3d-viewer/`
**Preserve**: Asset visualization concepts
**Reason**: 3D rendering pipeline is functional

### NII Coverage Calculator
**Location**: `src/tools/nii-coverage-calculator/`
**Preserve**: Coverage calculation formulas
**Reason**: Inspection coverage math is critical

## Data Structures to Reference

### Asset Hierarchy
**Concept**: Facility → System → Component → Weld
**Preserve**: This hierarchical model works for NDT

### Inspection Data Format
**Structure**: Asset + Method + Results + Acceptance
**Preserve**: Core structure is sound

### User Roles
**Current**: Basic role system
**Evolve**: Expand to full RBAC

## What We're NOT Preserving

- ❌ Vanilla JavaScript (→ TypeScript)
- ❌ Manual component system (→ React)
- ❌ Local storage (→ PostgreSQL)
- ❌ Basic auth (→ JWT + RBAC)
- ❌ Monolithic structure (→ Microservices)

## Migration Notes

When migrating calculation logic:
1. Extract pure functions
2. Add TypeScript types
3. Add comprehensive unit tests
4. Validate against original output
5. Document any changes made

## Reference Commands

# View original calculation logic
cat upstream/main:src/tools/tofd-calculator/calculator.js

# Compare data structures
git diff upstream/main:database/schema.sql prisma/schema.prisma
```

---

## Step 3: Preserve Critical Assets

### A. Extract Calculation Engines

**Claude Code should:**

```bash
# Create a reference directory for original logic
mkdir -p reference/original-calculations

# Copy calculation engines for reference
cp src/tools/tofd-calculator/calculator.js reference/original-calculations/tofd-calculator.js
cp src/tools/nii-coverage-calculator/*.js reference/original-calculations/

# Add README
cat > reference/original-calculations/README.md << 'EOF'
# Original Calculation Engines

These are preserved from the original system for reference during rebuild.

**DO NOT MODIFY** - These are read-only references.

When reimplementing:
1. Study the logic here
2. Rewrite in TypeScript with proper types
3. Add comprehensive unit tests
4. Validate output matches original
5. Document any improvements made

## Critical Calculations

- `tofd-calculator.js` - TOFD coverage and dead zones
- `nii-coverage-calculator.js` - NII coverage calculations
- Other inspection-specific formulas

All formulas are physics-based and MUST produce identical results.
EOF

git add reference/
git commit -m "docs: preserve original calculation engines for reference"
```

### B. Document Original Database Schema

```bash
# Copy original schema for reference
mkdir -p reference/original-schema
cp database/*.sql reference/original-schema/

# Document the schema
cat > reference/original-schema/SCHEMA_NOTES.md << 'EOF'
# Original Database Schema Notes

## Tables in Original System

[Document existing tables, their purpose, and relationships]

## Data We Must Migrate

- Users and authentication data
- Assets and hierarchies
- Inspection records
- Reports
- Settings and configurations

## Migration Mapping

Original → New Schema:
- [Document table mappings]

## Data Transformation Rules

- [Document any transformations needed]
EOF

git add reference/original-schema/
git commit -m "docs: preserve original database schema for reference"
```

---

## Step 4: Parallel Development Strategy

### A. Repository Organization

```
NDT-SUITE-UMBER (Original - ACTIVE IN PRODUCTION)
└── Keep untouched, production continues

NDT-SUITE-UMBER-V2 (Fork - ACTIVE DEVELOPMENT)
├── main branch (snapshot of original at fork time)
├── rebuild/phase-1-foundation (active development)
├── reference/ (preserved logic from original)
└── [new structure being built]
```

### B. Development Workflow

```bash
# All development happens in the forked repo
cd NDT-SUITE-UMBER-V2

# Work on feature branches
git checkout rebuild/phase-1-foundation
git checkout -b feature/auth-service
# ... make changes ...
git add .
git commit -m "feat(auth): implement JWT authentication"
git push origin feature/auth-service

# Create PR to rebuild/phase-1-foundation
# After review and approval, merge

# Never push to upstream (original repo)
```

### C. Referencing Original Code

When Claude Code needs to reference original logic:

```bash
# Fetch latest from original (read-only)
git fetch upstream

# View original file without checking it out
git show upstream/main:src/tools/tofd-calculator/calculator.js

# Or check the reference/ directory we created
cat reference/original-calculations/tofd-calculator.js

# Never merge upstream changes - this is a rebuild, not a refactor
```

---

## Step 5: Testing Against Original Data

### A. Set Up Test Data Pipeline

```bash
# Create test data directory
mkdir -p test-data/from-original

# Export data from original system (manual step)
# Copy to test-data/from-original/

# Document data source
cat > test-data/from-original/README.md << 'EOF'
# Test Data from Original System

**Source**: Production database export (anonymized)  
**Date**: 2025-11-08  
**Purpose**: Validate new system against real data

## Files

- `users.json` - User data (passwords removed)
- `assets.json` - Asset hierarchy
- `inspections.json` - Inspection records
- `reports.json` - Generated reports

## Usage

Use this data to:
1. Test data migration scripts
2. Validate calculation outputs match original
3. Performance testing with realistic data volumes
4. UAT with real-world scenarios

**NEVER** commit actual production data. This should be anonymized.
EOF
```

### B. Create Validation Tests

```typescript
// tests/validation/calculation-parity.test.ts

import { describe, it, expect } from 'vitest';
import { calculateTOFDCoverage } from '@/services/calculations/tofd';
import originalTestCases from '@/test-data/from-original/tofd-test-cases.json';

describe('TOFD Calculator Parity', () => {
  it('should produce identical results to original system', () => {
    originalTestCases.forEach(testCase => {
      const result = calculateTOFDCoverage({
        probeSpacing: testCase.input.probeSpacing,
        frequency: testCase.input.frequency,
        thickness: testCase.input.thickness,
      });

      // Results should match within 0.01mm tolerance
      expect(result.coverage).toBeCloseTo(testCase.expected.coverage, 2);
      expect(result.deadZone).toBeCloseTo(testCase.expected.deadZone, 2);
    });
  });
});
```

---

## Step 6: Deployment Strategy (Parallel Systems)

### A. Environment Setup

```yaml
# Deployment Environments

Original System:
  Domain: ndt-suite.example.com
  Status: Production (active)
  Database: supabase-prod-1
  Users: All current users
  
New System (V2):
  Domain: ndt-suite-v2.example.com (or beta.ndt-suite.example.com)
  Status: Beta testing
  Database: supabase-prod-2 (separate instance)
  Users: Beta testers only
  
Future State:
  Domain: ndt-suite.example.com (points to new system)
  Original: ndt-suite-legacy.example.com (read-only)
```

### B. Parallel Run Period

**Timeline**: 30-60 days

**During Parallel Run**:
- ✅ Old system continues normal operation
- ✅ New system available for beta testing
- ✅ Data sync runs nightly (old → new, read-only)
- ✅ Users can access both systems
- ✅ Collect feedback and fix issues

**Success Criteria for Cutover**:
- [ ] All critical features implemented
- [ ] 100% data migration successful
- [ ] User acceptance testing passed
- [ ] Performance meets or exceeds old system
- [ ] Security audit passed
- [ ] Compliance validation complete
- [ ] Support team trained
- [ ] Documentation complete

---

## Step 7: Migration and Cutover Plan

### A. Pre-Migration Checklist

```markdown
## 1 Week Before Migration

- [ ] Announce migration to all users
- [ ] Final UAT completed
- [ ] All P0/P1 bugs fixed
- [ ] Support team trained
- [ ] Rollback plan tested
- [ ] Data migration dry-run successful
- [ ] Backups verified

## 1 Day Before Migration

- [ ] Freeze changes to old system
- [ ] Export production data
- [ ] Test migration with production data copy
- [ ] Verify all calculations match
- [ ] Performance test with production load
- [ ] Review emergency contacts

## Migration Day

- [ ] Enable maintenance mode on old system
- [ ] Final data export
- [ ] Run migration scripts
- [ ] Validate migration (automated checks)
- [ ] Smoke test critical paths
- [ ] Switch DNS to new system
- [ ] Monitor for issues (24-hour watch)
- [ ] Disable maintenance mode on old system (read-only)
```

### B. Migration Scripts

```bash
# migration-scripts/migrate-production.sh

#!/bin/bash
set -e

echo "Starting production migration..."

# 1. Export from old system
echo "Exporting data from original system..."
node scripts/export-from-original.js > data/export-$(date +%Y%m%d).json

# 2. Validate export
echo "Validating export..."
node scripts/validate-export.js data/export-$(date +%Y%m%d).json

# 3. Run migration
echo "Running migration..."
node scripts/migrate-to-new.js data/export-$(date +%Y%m%d).json

# 4. Validate migration
echo "Validating migration..."
node scripts/validate-migration.js

# 5. Run calculation parity tests
echo "Running calculation parity tests..."
npm run test:parity

echo "Migration complete!"
echo "Next steps:"
echo "1. Manual smoke testing"
echo "2. Switch DNS"
echo "3. Monitor for 24 hours"
```

### C. Rollback Procedure

```bash
# rollback-scripts/rollback.sh

#!/bin/bash
set -e

echo "ROLLING BACK TO ORIGINAL SYSTEM"

# 1. Switch DNS back
echo "Reverting DNS to original system..."
# [DNS update commands]

# 2. Restore old system from maintenance
echo "Disabling maintenance mode on original..."
# [Commands to restore original]

# 3. Preserve new system data
echo "Taking snapshot of new system..."
# [Backup commands]

# 4. Notify stakeholders
echo "Sending rollback notifications..."
# [Notification commands]

echo "Rollback complete. Original system restored."
echo "New system preserved at beta.ndt-suite.example.com for investigation"
```

---

## Step 8: Post-Migration

### A. Archive Original Repository

**30 days after successful cutover:**

```bash
# In original repository (NDT-SUITE-UMBER)
# Add archive notice to README

cat > ARCHIVED.md << 'EOF'
# ⚠️ THIS REPOSITORY IS ARCHIVED

**Archive Date**: [Date]  
**Reason**: Replaced by NDT-SUITE-UMBER-V2  
**New Repository**: https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2

## What Happened

This repository contained the original NDT Suite (vanilla JavaScript).
It has been completely rebuilt with modern technologies in V2.

## For Historical Reference

This repository is preserved for:
- Historical reference
- Calculation formula verification
- Audit trail

**DO NOT** use this code for new development.

## Migration Timeline

- Original system launch: [Date]
- Fork created: 2025-11-08
- Rebuild completed: [Date]
- Cutover to V2: [Date]
- Archive: [Date]

## Questions

For questions about the new system, see:
- Repository: https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER-V2
- Documentation: [Link]
EOF

# Mark repository as archived on GitHub
# Settings → Danger Zone → Archive this repository
```

### B. Rename New Repository (Optional)

```bash
# Once migration successful, optionally rename V2 to main name
# On GitHub: Settings → Repository name → Change to "NDT-SUITE-UMBER"
# Original becomes "NDT-SUITE-UMBER-LEGACY"

# Update local remotes
git remote set-url origin https://github.com/YOUR-USERNAME/NDT-SUITE-UMBER.git
```

---

## Step 9: Claude Code Instructions

### Initial Setup (First Session)

```markdown
Claude Code, please execute the following:

1. Fork Repository:
   - Go to https://github.com/Jukesygit/NDT-SUITE-UMBER
   - Fork to [YOUR-USERNAME]/NDT-SUITE-UMBER-V2
   - Clone the fork locally
   - Add upstream remote

2. Preserve Critical Assets:
   - Create reference/original-calculations/ directory
   - Copy TOFD calculator logic
   - Copy NII coverage calculator
   - Copy all calculation engines
   - Add README documenting preservation

3. Set Up Claude Code Infrastructure:
   - Create .claude/ directory structure
   - Install essential hooks
   - Create 5 core skills
   - Set up dev docs in dev/active/ndt-suite-rebuild/
   - Copy planning documents

4. Document the Fork:
   - Create FORK_INFO.md
   - Create docs/ORIGINAL_SYSTEM_REFERENCE.md
   - Update README with new project info

5. Initial Commit:
   - Commit all setup changes
   - Push to origin/rebuild/phase-1-foundation
   - Create PR to main for review

6. Start Phase 1:
   - Read dev/active/ndt-suite-rebuild/plan.md
   - Read dev/active/ndt-suite-rebuild/context.md
   - Read dev/active/ndt-suite-rebuild/tasks.md
   - Begin with Phase 1 Week 1 tasks
```

### During Development

```markdown
CRITICAL RULES FOR CLAUDE CODE:

1. ❌ NEVER push to upstream (original repository)
2. ❌ NEVER merge from upstream (this is a rebuild, not a refactor)
3. ✅ ALWAYS work in the forked repository
4. ✅ ALWAYS reference original code from reference/ directory
5. ✅ ALWAYS validate calculations match original output
6. ✅ ALWAYS test with data from original system

When you need to reference original logic:
- Check reference/ directory first
- Use: git show upstream/main:path/to/file.js
- Copy logic, rewrite in TypeScript, add tests
- NEVER copy-paste without understanding and improving
```

---

## Step 10: Monitoring Both Systems

### A. Health Checks

```yaml
# monitoring/health-checks.yml

Original System:
  URL: https://ndt-suite.example.com/health
  Check Every: 5 minutes
  Alert If: Down or slow (>5s response)
  
New System:
  URL: https://ndt-suite-v2.example.com/health
  Check Every: 5 minutes
  Alert If: Down or slow (>5s response)
  
During Parallel Run:
  Compare: Response times, error rates, user activity
  Alert If: V2 underperforms original by >20%
```

### B. Metrics to Track

```markdown
## System Comparison Dashboard

### Performance
- [ ] API response time: V2 vs Original
- [ ] Page load time: V2 vs Original
- [ ] Database query time: V2 vs Original

### Reliability
- [ ] Uptime: V2 vs Original
- [ ] Error rate: V2 vs Original
- [ ] Failed calculations: V2 vs Original

### User Experience
- [ ] User satisfaction: V2 vs Original
- [ ] Feature adoption: V2 new features
- [ ] Support tickets: V2 vs Original

### Business Metrics
- [ ] Daily active users: V2 vs Original
- [ ] Inspections created: V2 vs Original
- [ ] Reports generated: V2 vs Original
```

---

## Summary: Repository Strategy

### Phase 1: Fork and Setup (Week 1)
```
Original Repo (Production) ──────────────────► Continues untouched
                                               No changes made
                                               
Forked Repo (Development)  ──────────────────► Active development
                                               All changes happen here
```

### Phase 2: Parallel Development (Months 1-12)
```
Original Repo              ──────────────────► Production use continues
                                               Users on this system
                                               
Forked Repo                ──────────────────► Development + Testing
                                               Building new platform
                                               Beta testing
```

### Phase 3: Parallel Run (Month 13)
```
Original Repo              ──────────────────► Production (read-only sync to V2)
                           │                   Users still here
                           │                   
                           ├──── Data ────────►
                           │                   
Forked Repo                ──────────────────► Beta Production
                                               Beta users here
                                               Receiving nightly data sync
```

### Phase 4: Migration (Month 14)
```
Original Repo              ──────────────────► Archived (read-only)
                                               No longer primary system
                                               
Forked Repo                ──────────────────► Production
                                               All users migrated
                                               Primary system
```

---

## Emergency Contacts

### During Migration
- **Lead Developer**: [Contact]
- **Database Admin**: [Contact]
- **Infrastructure**: [Contact]
- **Business Owner**: [Contact]

### Rollback Decision Makers
- **Authority to Rollback**: [Name + Contact]
- **Escalation Path**: [Chain]

---

## Final Checklist for Claude Code

Before starting development, verify:

- [ ] Repository forked successfully
- [ ] Clone of fork completed
- [ ] Upstream remote configured
- [ ] Development branch created
- [ ] Reference/ directory created with original logic
- [ ] .claude/ structure set up
- [ ] Dev docs created and populated
- [ ] FORK_INFO.md created
- [ ] Original system documented
- [ ] No changes pushed to upstream
- [ ] Ready to start Phase 1 Week 1

---

## Questions & Answers

**Q: Can we merge fixes from the original repo?**  
A: No. This is a rebuild, not a refactor. If fixes are needed in original (for production), handle those separately. Don't merge them into the rebuild.

**Q: What if we discover a calculation bug in the original?**  
A: Fix it in the new system with proper tests. Document the fix. Update the original if it's critical for production.

**Q: How do we handle changes to original during rebuild?**  
A: We don't. The original is frozen from our perspective. We reference it, we don't sync with it.

**Q: When do we rename the fork to the main name?**  
A: After successful migration and archival of original (30 days post-cutover).

**Q: What if migration fails?**  
A: Execute rollback procedure immediately. Original system restores. Investigate V2 issues. Fix and retry when ready.

---

**Document Status**: ✅ READY FOR USE  
**Last Updated**: 2025-11-08  
**For**: Claude Code execution  
**Next**: Execute Step 1 - Fork Repository
