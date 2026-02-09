# NDT Suite

A web-based Non-Destructive Testing (NDT) platform for managing personnel competencies, certifications, and inspection data.

## Features

- **Profile Management** - Personal details, certifications, and competency tracking
- **Personnel Management** - Organization-wide view of staff competencies and expiry tracking
- **Admin Dashboard** - User management, organizations, configuration, UKAS compliance, and activity logs
- **C-Scan Visualizer** - Ultrasonic C-scan data visualization and analysis

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS 4
- **Build:** Vite 5
- **Data:** Supabase (PostgreSQL + Auth + RLS)
- **State:** React Query (TanStack Query v5)
- **Auth:** Magic link (passwordless) via Supabase

## Prerequisites

- Node.js >= 18
- npm

## Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd ndt-suite

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
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run typecheck` | TypeScript validation (`tsc --noEmit`) |
| `npm run test` | Run tests (Vitest) |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting |
| `npm run preview` | Preview production build |

## Project Structure

```
src/
├── components/
│   ├── ui/                  # Shared reusable components (Modal, DataTable, ErrorDisplay, etc.)
│   ├── CscanVisualizer/     # C-Scan visualization components
│   └── MatrixSpinners.tsx   # Loading spinners
├── pages/
│   ├── profile/             # Profile page (competencies, certifications)
│   ├── personnel/           # Personnel management page
│   ├── admin/               # Admin dashboard (tabs, modals, components)
│   ├── LoginPageNew.jsx     # Authentication page
│   └── CscanVisualizerPage.jsx
├── hooks/
│   ├── queries/             # React Query data-fetching hooks
│   └── mutations/           # React Query mutation hooks
├── services/                # API layer (Supabase client calls)
├── contexts/                # React contexts (AuthContext)
├── lib/                     # Shared config (query-client, supabase)
├── config/                  # App configuration
├── types/                   # TypeScript type definitions
├── styles/                  # CSS stylesheets
└── utils/                   # Helper functions
database/                    # SQL schema and migration files
docs/                        # Project documentation
```

## Architecture

```
Component → React Query Hook → Service → Supabase Client (with RLS)
```

- **Pages** are small containers (~100-150 lines) that orchestrate data and render child components
- **React Query hooks** (`src/hooks/queries/` and `src/hooks/mutations/`) handle all data fetching and caching
- **Services** (`src/services/`) contain Supabase client calls
- **Row-Level Security (RLS)** enforces data access at the database level

## Auth & Roles

Authentication uses magic links via Supabase. User roles:

| Role | Access |
|------|--------|
| `admin` | Full system access, user management |
| `manager` | Personnel management, elevated access |
| `editor` | Edit own profile and competencies |
| `viewer` | Read-only access |

Organizations isolate users so they can only see personnel from their own org.

## Documentation

- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Codebase Audit (Feb 2026)](dev-docs/codebase-audit-2026-02.md)

## License

Copyright 2024-2026. All rights reserved.
