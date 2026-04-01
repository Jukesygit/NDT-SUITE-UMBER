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

## Remaining Recommendations
- ~~Upgrade Vite 5 -> 6~~ **Done** (upgraded to Vite 6.4.1)
- Evaluate React 19 upgrade
- Consider React Three Fiber migration for VesselModeler
- ~~Deprecate local auth fallback (bcryptjs/crypto-js/indexed-db)~~ **Done** (Supabase is now sole auth provider)
- Add comprehensive test suite (currently 1 test file)
- Convert remaining .js files to .ts
- Consolidate themes.js into Tailwind

## Suggested Features
- **Offline-capable read mode** — Cache recent inspections/reports in localStorage or a service worker so field engineers can view data without connectivity, even though auth now requires Supabase
- **Role-based dashboard** — Tailor the landing page per role (Admin sees org stats, Inspectors see assigned jobs, Viewers see recent reports) instead of a single overview for all users
- **Inspection report PDF export** — Generate professional PDF reports directly from inspection data (the phantom jspdf/pdfmake deps were removed but the underlying need likely remains)
- **Notification system with email alerts** — Extend the existing NotificationsTab with email/push notifications for expiring certifications, overdue inspections, and pending account requests
- **Audit trail export** — Allow admins to export the activity log as CSV/PDF for compliance audits and UKAS evidence packages
- **Bulk inspection import** — Extend the existing import system to support batch uploading of historical inspection records with validation
- **Dark mode** — The codebase already has a themes.js file; consolidating into Tailwind (per remaining recommendations) would make adding a dark theme straightforward
- **API key management** — Allow organizations to generate API keys for integrating NDT Suite data with external systems (ERP, CMMS, asset management)
- **Multi-language support (i18n)** — Internationalise the UI for field teams operating across regions (common in offshore/oil & gas NDT work)
- **Vessel 3D annotation sharing** — Allow inspectors to share annotated VesselModeler views via shareable links or embedded snapshots in reports
