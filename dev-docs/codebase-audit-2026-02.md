# NDT Suite - Full Codebase Audit Report
**Date:** 2026-02-06
**Purpose:** Identify deadweight, refactoring targets, and prepare for GitLab migration
**Branch:** `dev`

---

## Executive Summary

The NDT Suite is a **React 18 + Supabase** inspection management platform with **236 source files** (72% TypeScript). The modern architecture (React Query hooks, services layer, Tailwind CSS) is **solid and well-designed**. However, the codebase carries significant legacy baggage from its "vibe coded" origins that will confuse new engineers and bloat the repo.

### Key Numbers
| Metric | Value | Assessment |
|--------|-------|------------|
| Source files | 236 | Reasonable |
| TypeScript adoption | 72% (169/236) | Good, needs completion |
| React Query hooks | 62 (42 queries + 20 mutations) | Excellent coverage |
| Legacy tool files | 7 files, 10,486 lines | **Major deadweight** |
| Dead code files | 6+ files | **Remove immediately** |
| Files over 300 lines | 32 files | **Violates own guidelines** |
| Test files | 1 | **Critical gap** |
| CI/CD pipeline | None | **Must add for GitLab** |

### Overall Health: 7/10
- Architecture: 9/10 (modern patterns properly implemented)
- Code quality: 8/10 (no anti-patterns, good security)
- Maintainability: 5/10 (legacy code, oversized files, no tests)
- Onboarding readiness: 4/10 (confusing mix of old and new)

---

## 1. DEAD CODE - Remove Immediately

These files serve no purpose and will confuse any new engineer.

### 1.1 Dead Page Components
| File | Lines | Why Dead | Action |
|------|-------|----------|--------|
| `src/pages/LoginPage.jsx` | 10 | Replaced by `LoginPageNew.jsx` | DELETE |
| `src/pages/DataHubPage.jsx` | 9 | Replaced by `src/pages/data-hub/` | DELETE |
| `src/pages/ProfilePageNew.jsx` | 1,526 | Replaced by `src/pages/profile/ProfilePage.tsx` | DELETE |
| `src/pages/LogoDemo.tsx` | ~100 | Demo only, not in nav | DELETE |
| `src/pages/LogoAnimatedDemo.tsx` | 580 | Demo only, not in nav | DELETE |
| `src/pages/admin/StyleDemo.tsx` | ~200 | Demo only, not in nav | DELETE |
| `src/pages/test-import-modal.jsx` | ~50 | Test file committed to src | DELETE |

### 1.2 Dead Legacy Tools (Data Hub confirmed not needed)
| File | Lines | Why Dead | Action |
|------|-------|----------|--------|
| `src/tools/data-hub.js` | 3,971 | Fully replaced by modern `src/pages/data-hub/` | DELETE |
| `src/tools/login.js` | 516 | Fully replaced by `LoginPageNew.jsx` | DELETE |

### 1.3 Dead Routes in App.jsx
| Route | Line | Why Dead | Action |
|-------|------|----------|--------|
| `/logo-demo` | ~184 | Demo route | REMOVE |
| `/logo-animated` | ~185 | Demo route | REMOVE |
| `/admin-style-demo` | ~186 | Demo route | REMOVE |
| `/profile-legacy` | ~221 | Legacy fallback, not in sidebar | REMOVE |
| `ProfilePageLegacy` import | ~43 | Unused lazy import | REMOVE |

### 1.4 Backup/Duplicate Files
| File | Action |
|------|--------|
| `supabase/migrations/20250104_add_certification_fields.sql.bak` | DELETE |
| `supabase/migrations/20250104_cleanup_personal_detail_dates.sql.bak` | DELETE |
| `database/supabase-sharing-schema-safe.sql` | DELETE (duplicate of primary) |
| `database/supabase-asset-access-requests-schema-safe.sql` | DELETE (duplicate of primary) |

### 1.5 Demo/Showcase Files at Root
| File | Action |
|------|--------|
| `COMPONENT_SHOWCASE.html` | DELETE |
| `color-scheme-demo.html` | DELETE |

### 1.6 Redundant Import Scripts (keep only latest)
| File | Action |
|------|--------|
| `scripts/import-competencies-detailed.js` | DELETE (superseded) |
| `scripts/import-competencies-from-excel.js` | DELETE (superseded) |
| `scripts/import-competencies-only.js` | DELETE (superseded) |
| `scripts/import-complete-data.js` | DELETE (superseded by -fixed) |
| **KEEP:** `scripts/import-competencies-final.js` | Rename to `scripts/import-competencies.js` |
| **KEEP:** `scripts/import-complete-data-fixed.js` | Rename to `scripts/import-complete-data.js` |

**Estimated removal: ~7,000+ lines of dead code**

---

## 2. LEGACY CODE - Requires Migration Strategy

### 2.1 Active Legacy Tools (Still in Production)
These 5 tools use vanilla JS DOM manipulation, string HTML templates, and global state. They work via the `ToolContainer` wrapper but are architecturally incompatible with the React codebase.

| Tool | Lines | Complexity | Modern Equivalent | Priority |
|------|-------|-----------|-------------------|----------|
| `src/tools/pec-visualizer.js` | 858 | Medium | None yet | HIGH - Small, good first target |
| `src/tools/tofd-calculator.js` | 476 | Medium | None yet | HIGH - Smallest tool |
| `src/tools/nii-coverage-calculator.js` | 907 | High | None yet | MEDIUM |
| `src/tools/cscan-visualizer.js` | 2,458 | High | `src/components/CscanVisualizer/` EXISTS | LOW - Already replaced |
| `src/tools/3d-viewer.js` | 1,840 | Very High | None yet | LOW - Complex Three.js |

**Note:** `cscan-visualizer.js` already has a full React replacement with Web Workers. The legacy version can likely be deleted after verifying the React version handles all use cases.

### 2.2 Legacy Core Modules (src/ root)
These large JS files predate the React architecture. They handle critical business logic but violate all component guidelines.

| File | Lines | Purpose | Dependency Level | Action |
|------|-------|---------|-----------------|--------|
| `src/data-manager.js` | 1,729 | IndexedDB data persistence | HIGH - used by tools | Evaluate if still needed without Data Hub |
| `src/sync-service.js` | 1,629 | Offline sync engine | HIGH - used by data-manager | Evaluate if still needed |
| `src/report-generator.js` | 1,539 | PDF/report generation | MEDIUM - used by report-dialog | Refactor to React service |
| `src/auth-manager.js` | 1,470 | Authentication state | CRITICAL - used everywhere | Gradually migrate to AuthContext |
| `src/sharing-manager.js` | 440 | Asset sharing logic | MEDIUM | Migrate to sharing-service.ts |
| `src/sync-queue.js` | 280 | Sync queue management | HIGH - used by sync-service | Evaluate if still needed |
| `src/indexed-db.js` | 150 | IndexedDB wrapper | HIGH - used by data-manager | Evaluate if still needed |
| `src/migration-tool.js` | 300 | Data migration | LOW | Likely removable |
| `src/animated-background.js` | 370 | Canvas animations | LOW | Keep for login page |
| `src/tool-layout.js` | 280 | Legacy tool container | MEDIUM - used by tools | Remove when tools migrated |
| `src/admin-config.js` | 230 | Admin configuration | LOW | Migrate to config/ |
| `src/themes.js` | 330 | Theme system | LOW | Consolidate with Tailwind |

**Key question:** With Data Hub removed, are `data-manager.js`, `sync-service.js`, `sync-queue.js`, and `indexed-db.js` still needed? If these were primarily supporting the Data Hub's offline capabilities, they may be removable — which would eliminate **~3,800 lines** of complex legacy code.

### 2.3 Legacy Support Components
| File | Lines | Purpose | Action |
|------|-------|---------|--------|
| `src/components/report-dialog.js` | 1,012 | Report generation UI (uses innerHTML) | Refactor to React |
| `src/components/sync-status.js` | 591 | Sync indicator (DOM manipulation) | Evaluate if needed |
| `src/components/modern-header.js` | 200+ | Dynamic header (createElement) | Migrate to React |
| `src/components/MatrixSpinners.tsx` | 925 | Loading animations | Split into smaller components |
| `src/components/LoadingStates.jsx` | 632 | Loading states | Split/consolidate |
| `src/utils/globalStyleEnforcer.js` | 330 | Style injection for legacy tools | Remove when tools migrated |

---

## 3. OVERSIZED FILES - Must Refactor

These files violate the project's own 300-line guidelines and will be the biggest barrier for new engineers.

### 3.1 Critical (1000+ lines, non-legacy)
| File | Lines | Should Be | Recommended Split |
|------|-------|-----------|-------------------|
| `src/pages/personnel/PersonnelExpandedRow.tsx` | 1,613 | 200 | `PersonDetail.tsx`, `CompetencyEditor.tsx`, `WitnessCheckSection.tsx`, multiple modals |
| `src/services/competency-service.js` | 1,255 | 300 | `competency-queries.ts`, `competency-mutations.ts`, `competency-definitions.ts` |
| `src/services/asset-service.js` | 1,033 | 300 | `asset-queries.ts`, `asset-mutations.ts`, `vessel-service.ts` |
| `src/services/admin-service.ts` | 949 | 300 | `admin-users.ts`, `admin-orgs.ts`, `admin-config.ts` |
| `src/components/UniversalImportModal.jsx` | 849 | 150 | `ImportWizard.tsx`, `ColumnMapper.tsx`, `ImportPreview.tsx` |

### 3.2 High Priority (500-1000 lines)
| File | Lines | Recommended Action |
|------|-------|--------------------|
| `src/pages/LoginPageNew.jsx` | 792 | Split: `MagicLinkForm`, `PasswordResetForm`, `AccountRequestForm` |
| `src/pages/admin/tabs/ConfigurationTab.tsx` | 775 | Split into section components |
| `src/components/CscanVisualizer/CscanVisualizer.tsx` | 686 | Extract toolbar, panels to sub-components |
| `src/services/personnel-service.js` | 672 | Acceptable but convert to .ts |
| `src/pages/admin/components/ExpiryRemindersSettings.tsx` | 619 | Split settings vs. preview |
| `src/pages/personnel/PersonDocumentReviewModal.tsx` | 612 | Extract review sections |
| `src/pages/data-hub/InspectionPage.tsx` | 598 | Extract section components |
| `src/components/CscanVisualizer/ExportToHubModal.tsx` | 584 | Simplify export flow |
| `src/pages/admin/components/CustomNotifications.tsx` | 573 | Split form vs. history |
| `src/pages/profile/CompetencyCard.tsx` | 548 | Extract edit form, status display |

---

## 4. ARCHITECTURE STRENGTHS (Keep These)

### 4.1 React Query Implementation - Excellent
- 62 custom hooks (42 queries, 20 mutations)
- Proper cache invalidation in all mutations
- Hierarchical query keys
- Conditional fetching with `enabled`
- No useState+useEffect data fetching anti-pattern anywhere

### 4.2 Services Layer - Well Designed
- 8 service files with clear responsibilities
- All use Supabase client with RLS
- Proper error throwing (React Query catches)
- File upload validation (MIME types, size limits, SVG rejection)

### 4.3 Security - Strong
- RLS enabled on all tables
- Role-based access control (5 tiers)
- Multi-tenant organization isolation
- Recent security patches (2026-02-05) fixing critical issues
- No hardcoded secrets anywhere
- Strong password policy (15 chars, complexity requirements)
- Rate limiting on auth attempts

### 4.4 Build & Config - Modern
- Vite 5 with optimized code splitting
- TypeScript strict mode fully enabled
- ESLint + Prettier enforced
- Security headers configured (CSP, X-Frame-Options, etc.)
- Clean dependency management (no duplicates, all actively used)

### 4.5 UI Component Library - Good Foundation
- `src/components/ui/` has DataTable, Modal, Form components
- Consistent Tailwind CSS usage
- Error boundaries properly implemented
- Lazy loading on all routes

---

## 5. GAPS FOR GITLAB READINESS

### 5.1 No CI/CD Pipeline (Critical)
There is no `.gitlab-ci.yml`, `.github/workflows/`, or any automated pipeline.

**Must create:**
```yaml
# .gitlab-ci.yml (recommended)
stages:
  - lint
  - typecheck
  - test
  - build

lint:
  script: npm run lint

typecheck:
  script: npm run typecheck

test:
  script: npm run test

build:
  script: npm run build
```

### 5.2 No Tests (Critical)
Only 1 test file exists: `src/config/security.test.js` (~30 tests).

**Priority test targets:**
1. Services (business logic)
2. React Query hooks (data layer)
3. Auth flows
4. Component rendering

### 5.3 No Containerization
No Dockerfile or docker-compose for local development. Not blocking for GitLab but recommended.

### 5.4 Documentation Gaps
| Document | Status | Action |
|----------|--------|--------|
| README.md | Exists but needs updating | Update with setup instructions |
| Contributing guide | Missing | Create CONTRIBUTING.md |
| Architecture diagram | Missing | Add to dev-docs/ |
| API documentation | Missing | Document Edge Functions |
| Environment setup | `.env.example` exists | Verify it's complete |

### 5.5 Root Directory Clutter
The project root has **15+ documentation/guide files** that belong in `docs/`:
- `DESIGN_SYSTEM.md`, `DESIGN_SYSTEM_MIGRATION_SUMMARY.md`
- `DESIGN_TOKENS_REFERENCE.md`, `IMPLEMENTATION_GUIDE.md`
- `PROFILES_TABLE_SCHEMA.md`, `PROFILES_TABLE_QUICK_REFERENCE.md`
- `SECURITY_IMPROVEMENTS.md`, `ROUTING_MIGRATION.md`
- `VISUAL_IMPROVEMENTS_GUIDE.md`, `PERSONNEL_PAGE_FIX.md`
- `NII_CALCULATOR_DISCREPANCIES.md`, `IMPORT_IMPROVEMENTS_SUMMARY.md`
- `COMPETENCY_FIELDS_REFERENCE.md`

**Action:** Move all to `docs/` directory. Root should only have README.md.

---

## 6. INCONSISTENCIES TO STANDARDIZE

### 6.1 Mixed File Extensions in Hooks
| Current | Should Be |
|---------|-----------|
| `src/hooks/queries/useAssets.js` | `useAssets.ts` |
| `src/hooks/queries/useVessels.js` | `useVessels.ts` |
| `src/hooks/queries/useScans.js` | `useScans.ts` |
| `src/hooks/mutations/useAssetMutations.js` | `useAssetMutations.ts` |

### 6.2 Inconsistent Service Exports
```javascript
// Some use both:
export const assetService = new AssetService();
export default assetService;

// Some use only default:
export default new CompetencyService();
```
**Standardize to named + default export for all.**

### 6.3 Query Key Convention
Modern hooks use exported key objects. Older hooks use inline strings. Standardize all to:
```typescript
export const competencyKeys = {
  all: ['competencies'] as const,
  list: (filters) => [...competencyKeys.all, 'list', filters],
  detail: (id) => [...competencyKeys.all, 'detail', id],
};
```

### 6.4 ESLint max-lines Too Permissive
Currently `["warn", 500]`. Should be `["warn", 300]` to match architectural guidelines.

---

## 7. DATA HUB DECISION

You mentioned Data Hub features are no longer needed. The codebase has:

### Already Removable (Data Hub is fully modernized AND disabled)
- `src/tools/data-hub.js` (3,971 lines) - Legacy, already replaced
- `src/pages/DataHubPage.jsx` (9 lines) - Dead wrapper
- Routes are already commented out in App.jsx

### Needs Decision
- `src/pages/data-hub/` (19 modern React files) - Fully modernized but disabled
- `src/hooks/queries/useDataHub.ts` - Data hub query hooks
- `src/hooks/queries/useAssets.js`, `useVessels.js`, `useScans.js` - Asset data hooks
- `src/hooks/mutations/useDataHubMutations.ts`, `useInspectionMutations.ts` - Mutation hooks
- `src/services/asset-service.js` (1,033 lines) - Asset CRUD service
- `src/components/CscanVisualizer/` (17 files) - C-Scan visualization
- Database tables: `assets`, `vessels`, `scans`, `strakes`, `inspections`, `vessel_images`
- Supabase Edge Function: `transfer-asset/`

### Legacy Modules Potentially Tied to Data Hub
- `src/data-manager.js` (1,729 lines) - IndexedDB persistence
- `src/sync-service.js` (1,629 lines) - Offline sync
- `src/sync-queue.js` (280 lines) - Sync queue
- `src/indexed-db.js` (150 lines) - IndexedDB wrapper
- `src/sharing-manager.js` (440 lines) - Asset sharing
- `src/components/sync-status.js` (591 lines) - Sync UI

**If Data Hub is fully removed:** ~25 files and ~10,000+ lines can be deleted.

**Recommendation:** Keep the database tables (data may be valuable) but remove all frontend code. The modern `src/pages/data-hub/` code is well-written — if there's any chance it returns, archive it in a separate branch rather than deleting.

---

## 8. RECOMMENDED CLEANUP ORDER

### Phase 1: Quick Wins (1-2 hours)
1. Delete all dead code files (Section 1)
2. Remove dead routes from App.jsx
3. Delete backup/duplicate SQL files
4. Move root documentation to `docs/`
5. Consolidate import scripts

### Phase 2: Data Hub Decision (1 hour)
1. Confirm Data Hub removal scope
2. Delete or archive Data Hub frontend code
3. Evaluate and remove offline sync modules if no longer needed
4. Remove `globalStyleEnforcer.js` if only used by removed tools

### Phase 3: Standardization (2-3 hours)
1. Convert remaining .js hooks to .ts
2. Standardize service exports
3. Standardize query key conventions
4. Fix ESLint max-lines setting
5. Clean up CSS files (merge `refinements.css`, `personnel-fixes.css`)

### Phase 4: Refactor Large Files (4-6 hours)
1. Split `PersonnelExpandedRow.tsx` (1,613 lines)
2. Split `competency-service.js` (1,255 lines)
3. Split `asset-service.js` (1,033 lines)
4. Split `LoginPageNew.jsx` (792 lines)
5. Split `admin-service.ts` (949 lines)

### Phase 5: GitLab Readiness (2-3 hours)
1. Create `.gitlab-ci.yml` pipeline
2. Update README.md with setup instructions
3. Create CONTRIBUTING.md
4. Verify `.env.example` is complete
5. Add architecture overview to dev-docs/

### Phase 6: Legacy Tool Migration (Ongoing)
1. Delete `cscan-visualizer.js` (React version exists)
2. Migrate `tofd-calculator.js` to React (smallest tool)
3. Migrate `pec-visualizer.js` to React
4. Migrate `nii-coverage-calculator.js` to React
5. Migrate `3d-viewer.js` to React (most complex, do last)
6. Remove `ToolContainer.jsx` wrapper when all tools migrated

### Phase 7: Testing (Ongoing)
1. Add service unit tests
2. Add hook tests
3. Add component render tests
4. Target 50% coverage minimum

---

## 9. FILE-LEVEL VERDICT

### DELETE (Dead Code)
```
src/pages/LoginPage.jsx
src/pages/DataHubPage.jsx
src/pages/ProfilePageNew.jsx
src/pages/LogoDemo.tsx
src/pages/LogoAnimatedDemo.tsx
src/pages/admin/StyleDemo.tsx
src/pages/test-import-modal.jsx
src/tools/data-hub.js
src/tools/login.js
COMPONENT_SHOWCASE.html
color-scheme-demo.html
supabase/migrations/*.bak (2 files)
database/*-safe.sql (2 files)
scripts/import-competencies-detailed.js
scripts/import-competencies-from-excel.js
scripts/import-competencies-only.js
scripts/import-complete-data.js (keep -fixed version)
```

### DELETE IF DATA HUB REMOVED
```
src/pages/data-hub/ (19 files) - or archive to branch
src/tools/cscan-visualizer.js
src/components/CscanVisualizer/ (17 files)
src/hooks/queries/useDataHub.ts
src/hooks/queries/useAssets.js
src/hooks/queries/useVessels.js
src/hooks/queries/useScans.js
src/hooks/mutations/useDataHubMutations.ts
src/hooks/mutations/useInspectionMutations.ts
src/services/asset-service.js
src/data-manager.js
src/sync-service.js
src/sync-queue.js
src/indexed-db.js
src/sharing-manager.js
src/components/sync-status.js
supabase/functions/transfer-asset/
```

### REFACTOR (Too Large)
```
src/pages/personnel/PersonnelExpandedRow.tsx (1,613 → 200)
src/services/competency-service.js (1,255 → 300 each)
src/services/asset-service.js (1,033 → 300 each)
src/services/admin-service.ts (949 → 300 each)
src/components/UniversalImportModal.jsx (849 → 150 each)
src/pages/LoginPageNew.jsx (792 → 300)
src/pages/admin/tabs/ConfigurationTab.tsx (775 → 250)
src/components/report-dialog.js (1,012 → React component)
src/components/MatrixSpinners.tsx (925 → split)
src/components/LoadingStates.jsx (632 → split)
```

### CONVERT TO TYPESCRIPT
```
src/hooks/queries/useAssets.js → .ts
src/hooks/queries/useVessels.js → .ts
src/hooks/queries/useScans.js → .ts
src/hooks/mutations/useAssetMutations.js → .ts
src/services/competency-service.js → .ts
src/services/asset-service.js → .ts
src/services/personnel-service.js → .ts
src/services/email-service.js → .ts
```

### KEEP AS-IS (Well Designed)
```
src/hooks/queries/*.ts (35 files) - Excellent React Query
src/hooks/mutations/*.ts (18 files) - Proper cache invalidation
src/components/ui/ - Good shared components
src/pages/admin/ (minus oversized tabs) - Well-structured tabs
src/pages/profile/ProfilePage.tsx - Properly split
src/pages/personnel/PersonnelPage.tsx - Good structure
src/contexts/AuthContext.tsx - Clean single context
src/lib/ - Good utilities
src/config/ - Well organized
src/types/ - Proper type definitions
```

### MIGRATE LATER (Legacy but Working)
```
src/tools/3d-viewer.js - Complex Three.js, low priority
src/tools/tofd-calculator.js - Working, migrate when time allows
src/tools/pec-visualizer.js - Working, migrate when time allows
src/tools/nii-coverage-calculator.js - Working, migrate when time allows
src/auth-manager.js - Critical, migrate gradually to AuthContext
src/report-generator.js - Working, convert to React service
```

---

## 10. SUMMARY FOR NEW ENGINEERS

When a new engineer joins, they should understand:

**What matters:**
- `src/pages/` - Page containers (React components)
- `src/hooks/queries/` - Data fetching (React Query)
- `src/hooks/mutations/` - Data modification (React Query)
- `src/services/` - Business logic (Supabase client)
- `src/components/ui/` - Shared UI components
- `src/contexts/AuthContext.tsx` - Auth state

**What to ignore:**
- `src/tools/` - Legacy, being migrated, do not modify
- `src/data-manager.js`, `sync-service.js` - Legacy offline support
- Files with `New` in the name (naming artifact from migration)
- Any `.bak` or `-safe` files

**Rules:**
- ALL data fetching uses React Query hooks
- NO useState+useEffect for data fetching
- Components max 300 lines
- Use `src/components/ui/` before creating new UI
- Security first: RLS policies, input validation, auth checks
