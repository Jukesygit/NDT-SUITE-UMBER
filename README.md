# Matrix Portal

A web-based Non-Destructive Testing (NDT) platform for managing personnel competencies, certifications, inspection data, document management, and 3D vessel modelling.

## Features

- **Profile Management** - Personal details, certifications, and competency tracking
- **Personnel Management** - Organization-wide view of staff competencies and expiry tracking
- **Admin Dashboard** - User management, organizations, configuration, UKAS compliance, and activity logs
- **C-Scan Visualizer** - Ultrasonic C-scan data visualization and analysis
- **Vessel Modeler** - 3D vessel modelling with Three.js
- **Document Management** - Upload, organize, and share documents
- **Report Generator** - Export reports to Word and Excel
- **Downloads** - Downloadable resources and templates
- **Two-Factor Auth** - Optional 2FA for enhanced security

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS 4
- **Build:** Vite 6
- **Data:** Supabase (PostgreSQL + Auth + RLS)
- **State:** React Query (TanStack Query v5)
- **Routing:** React Router v6
- **Auth:** Magic link (passwordless) via Supabase, optional 2FA
- **3D:** Three.js (vessel modelling)
- **Charting:** Plotly.js
- **Export:** docx (Word), ExcelJS (spreadsheets), pdfjs-dist (PDF rendering)
- **Icons:** Lucide React
- **Testing:** Vitest, Testing Library
- **Quality:** ESLint, Prettier, Husky + lint-staged

## Prerequisites

- Node.js >= 18
- npm

## Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd matrix-portal

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase URL and anon key

# Start development server
npm run dev
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run typecheck` | TypeScript validation (`tsc --noEmit`) |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Run tests with Vitest UI |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:ci` | CI test run with coverage |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting |
| `npm run clean` | Remove dist/node_modules and reinstall |
| `npm run precommit` | Lint + format check + typecheck |

## Project Structure

```
src/
├── auth/                    # Auth subsystem (manager, core, supabase, types, users)
├── components/
│   ├── ui/                  # Shared reusable components (Modal, DataTable, ErrorDisplay, etc.)
│   ├── CscanVisualizer/     # C-Scan visualization components
│   ├── VesselModeler/       # 3D vessel modelling components
│   ├── auth/                # Auth UI components
│   ├── two-factor/          # 2FA components
│   ├── features/            # Feature-specific components
│   ├── import/              # Data import components
│   └── ...                  # ErrorBoundary, ProtectedRoute, NotificationBell, etc.
├── pages/
│   ├── profile/             # Profile page (competencies, certifications)
│   ├── personnel/           # Personnel management page
│   ├── admin/               # Admin dashboard (tabs, modals, components)
│   ├── documents/           # Document management
│   ├── legal/               # Privacy policy
│   ├── LoginPageNew.tsx     # Authentication page
│   ├── CscanVisualizerPage.tsx
│   ├── VesselModelerPage.tsx
│   └── DownloadsPage.tsx
├── hooks/
│   ├── queries/             # React Query data-fetching hooks
│   └── mutations/           # React Query mutation hooks
├── services/                # API layer (Supabase client calls)
├── contexts/                # React contexts (AuthContext)
├── lib/                     # Shared config (query-client, supabase)
├── config/                  # App configuration
├── types/                   # TypeScript type definitions
├── styles/                  # CSS stylesheets
├── utils/                   # Helper functions
└── test/                    # Test setup, utilities, mocks
database/                    # SQL schema and migration files
supabase/                    # Supabase config, edge functions, and migrations
demos/                       # UI theme demos (HTML)
docs/                        # Project documentation
dev-docs/                    # Developer notes and audits
email-templates/             # Email templates
```

## Architecture

```
Component → React Query Hook → Service → Supabase Client (with RLS)
```

- **Pages** are small containers that orchestrate data and render child components
- **React Query hooks** (`src/hooks/queries/` and `src/hooks/mutations/`) handle all data fetching and caching
- **Services** (`src/services/`) contain Supabase client calls
- **Row-Level Security (RLS)** enforces data access at the database level

## Auth & Roles

Authentication uses magic links via Supabase with optional two-factor authentication. User roles:

| Role | Access |
|------|--------|
| `super_admin` | Full cross-organization access, all permissions |
| `admin` | Full system access within organization, user management |
| `org_admin` | Organization-scoped admin, user management within own org |
| `manager` | Personnel management, elevated access |
| `editor` | Edit own profile and competencies |
| `viewer` | Read-only access |

Organizations isolate users so they can only see personnel from their own org. `super_admin` can access all organizations.

## Documentation

### Setup & Deployment
- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Cloud-First Migration](docs/CLOUD_FIRST_MIGRATION.md)
- [Routing Migration](docs/ROUTING_MIGRATION.md)

### Design
- [Design System](docs/DESIGN_SYSTEM.md)
- [Design Tokens Reference](docs/DESIGN_TOKENS_REFERENCE.md)

### Features
- [Report Generator](docs/REPORT_GENERATOR_README.md)
- [NDT Witness Check](docs/NDT_WITNESS_CHECK_FEATURE.md)
- [Competency Comments](docs/COMPETENCY_COMMENTS_FEATURE.md)
- [Profile Feature](docs/PROFILE_FEATURE_README.md)

### Security & Schema
- [Security Improvements](docs/SECURITY_IMPROVEMENTS.md)
- [Profiles Table Schema](docs/PROFILES_TABLE_SCHEMA.md)

### Audits
- [Codebase Audit (Apr 2026)](dev-docs/codebase-audit-2026-04.md)
- [Codebase Audit (Feb 2026)](dev-docs/codebase-audit-2026-02.md)
- [C-Scan & Vessel Audit Handover](dev-docs/cscan-vessel-audit-handover.md)

## License

Copyright 2024-2026. All rights reserved.
