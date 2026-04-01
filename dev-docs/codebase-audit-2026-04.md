# NDT Suite - Performance & Tech Debt Audit (April 2026)
**Date:** April 2026
**Builds on:** February 2026 audit (dev-docs/codebase-audit-2026-02.md)
**Branch:** claude/audit-performance-debt-R4xgN

## Summary of Changes

### Phase 1: Quick Wins
- Removed 5 phantom dependencies (jspdf, pdfmake, html2canvas, docx, dotenv) - ~8MB savings
- Updated Vite vendor chunk configuration (removed papaparse from static chunk)
- Fixed ESLint max-lines rule (500 -> 300)

### Phase 2: Performance Fixes
- Added debounce to personnel hover prefetch
- Cached Date.now() outside filter loops
- Added useMemo to OverviewTab computed values
- Added loading="lazy" to inspection images

### Phase 3: Type Safety
- Fixed `as any` type casts with proper types across admin modals, C-scan visualizer, and supabase client

### Phase 4: File Splitting
- Split PersonnelExpandedRow.tsx (1,417 -> smaller components)
- Split competency-service.js (1,286 -> domain modules)
- Split UniversalImportModal.jsx (807 -> wizard components)
- Split admin-service.ts (741 -> domain modules)

## Completed (This Session)
- ~~Upgrade Vite 5 -> 6~~ — upgraded to Vite 6.4.1
- ~~Deprecate local auth fallback (bcryptjs/crypto-js/indexed-db)~~ — Supabase is now sole auth provider

## Remaining Recommendations
- Evaluate React 19 upgrade
- Consider React Three Fiber migration for VesselModeler
- Add comprehensive test suite (currently 1 test file)
- Convert remaining .js files to .ts
- Consolidate themes.js into Tailwind
