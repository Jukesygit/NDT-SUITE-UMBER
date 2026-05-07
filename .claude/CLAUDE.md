# NDT Suite (Matrix Portal) - Claude Code Rules

## Mandatory Memory Workflow

This repository has an Obsidian-backed memory layer. For every non-trivial coding, design, debugging, architecture, documentation, or review task:

1. Read `docs/agent-memory/Project Brief.md`.
2. Read `docs/agent-memory/Module Map.md`.
3. Read `docs/Engineering Log.md`.
4. If the task mentions an existing feature, read the latest relevant note in `docs/plans/`.
5. Use those notes to scope the smallest relevant source area before broad repository search.
6. Treat memory notes as orientation, not proof. Verify implementation details in code before editing.
7. If the task changes system shape, feature ownership, recurring constraints, or leaves unfinished context, update the relevant memory or handoff note before finishing.

Skip this workflow only for tiny mechanical requests where reading memory would add no value, such as showing `git status`, answering a direct command output question, or editing a single explicitly named line.

## Tech Stack

- **Frontend:** React 18.3 + TypeScript 5.9 (strict mode) + Vite 6.4
- **Backend:** Supabase (auth, DB, storage, 19 edge functions)
- **Data Fetching:** React Query 5 (`@tanstack/react-query`)
- **Styling:** Tailwind CSS 4 + custom design tokens + glassmorphic CSS
- **Routing:** React Router 6 (lazy-loaded, route-level error boundaries)
- **3D/Viz:** Three.js (vessel modeling), Plotly.js (charts)
- **Testing:** Vitest 4 + React Testing Library (29 test files, 50% coverage threshold)
- **CI/CD:** GitLab CI (7 stages) → Vercel (matrixportal.io)
- **Auth:** Supabase Auth + 2FA/TOTP, 6 roles (super_admin, admin, manager, org_admin, editor, viewer)
- **Node:** >=18, path aliases: `@/*`, `@components/*`, `@services/*`, `@hooks/*`, `@utils/*`, `@types/*`, `@config/*`

## Before Writing Code

1. **Read `dev-docs/design-system.md`** before writing ANY UI — it has all CSS classes, tokens, and patterns
2. **Check `src/components/ui/`** for existing components (DataTable, Modal, Form, PageHeader, EmptyState, ErrorDisplay, LoadingSpinner, InlineEditField, ConfirmDialog)
3. **Check `src/hooks/queries/` and `src/hooks/mutations/`** — there are 48 React Query hooks already
4. **Use React Query** for ALL data fetching — never useState + useEffect for loading data
5. **Keep files under 300 lines** (ESLint warns at 300)
6. For complex features: create a design doc in `docs/plans/` following existing naming pattern (`YYYY-MM-DD-feature-name-design.md`)

## Data Flow Pattern

```
Component → useQuery/useMutation hook → service function → Supabase client (with RLS)
```

**Query hook** (`src/hooks/queries/`):
```typescript
export function useProjectList() {
  return useQuery({
    queryKey: ['inspectionProjects'],
    queryFn: () => listProjects(),
    staleTime: 2 * 60 * 1000,
  });
}
```

**Mutation hook** (`src/hooks/mutations/`):
```typescript
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateProjectParams) => createProject(params),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inspectionProjects'] }); },
  });
}
```

**Service** (`src/services/`): thin Supabase wrapper, throws on error so React Query catches it.

## Auth

- **Use `useAuth()` hook** from `src/contexts/AuthContext.tsx` in components
- Auth modules: `auth-manager.ts` (orchestrator), `auth-core.ts`, `auth-supabase.ts`, `auth-users.ts`, `auth-accounts.ts`
- Role checks: `isSuperAdmin`, `isAdmin`, `isManager`, `isOrgAdmin`, `isEditor`, `hasRole()`, `hasPermission()`
- Login: email/password with rate limiting (5 attempts, 15-min lockout)
- 2FA: TOTP via Supabase, admin reset capability
- GDPR: data export + account deletion via edge functions

## Styling Rules

- **USE** existing CSS classes from `dev-docs/design-system.md` (`glass-card`, `btn btn--primary`, `badge--neutral`, etc.)
- **USE** CSS custom properties (`var(--text-secondary)`, `var(--spacing-md)`) — never raw rgba() or pixel values
- **USE** `PageHeader` component with icon prop for page headers
- **USE** Tailwind only for layout utilities (`flex`, `gap-4`, `h-full`) — not for colors or spacing that have tokens
- **NEVER** invent inline styles or new CSS classes when a token or existing class exists

## Security Rules (NON-NEGOTIABLE)

- **NEVER** bypass Supabase RLS policies
- **ALWAYS** validate user permissions before sensitive operations
- **USE** `auth.uid()` in all RLS policies, verify `organization_id` for multi-tenant isolation
- **NEVER** expose API keys, secrets, credentials, or log sensitive data
- **USE** parameterized queries (no raw SQL construction)
- **VALIDATE** all user inputs on both client and server
- **VALIDATE** file uploads (type, size, content)
- Activity logs use PII masking (`pii-sanitizer.ts`)

## Project Structure

```
src/
├── components/
│   ├── ui/                # Shared: DataTable, Modal, Form, PageHeader, etc.
│   ├── layout/            # LayoutNew, Sidebar, Header
│   ├── VesselModeler/     # 3D vessel modeling (Three.js)
│   └── projects/          # Inspection project components
├── pages/                 # Route-level page components (lazy-loaded)
├── hooks/
│   ├── queries/           # 25 React Query hooks
│   └── mutations/         # 23 mutation hooks
├── services/              # Supabase data access (26 service files)
├── contexts/              # AuthContext
├── lib/                   # query-client, supabase-client, session-manager
├── utils/                 # Helpers (errorHandler, pii-sanitizer, etc.)
├── config/                # App configuration
├── types/                 # TypeScript type definitions
├── styles/                # CSS (design-tokens, glassmorphic, animations, etc.)
└── test/                  # Test setup and utilities
database/                  # SQL schema files (47 files)
supabase/
├── migrations/            # 12 timestamped migrations
└── functions/             # 19 edge functions
docs/                      # 50+ docs (GDPR, compliance, deployment, etc.)
docs/plans/                # Feature design & implementation docs
email-templates/           # 6 branded HTML email templates
```

## Routes

| Path | Component | Access |
|------|-----------|--------|
| `/login` | LoginPageNew | Public |
| `/profile` | ProfilePage | Auth + tab:profile |
| `/documents` | DocumentsPage | Auth + tab:documents |
| `/personnel` | PersonnelPage | Auth + elevated + tab:personnel |
| `/admin` | AdminPage | Auth + admin + tab:admin |
| `/cscan` | CScanPage | Auth + tab:tools |
| `/vessel-modeler` | VesselModelerPage | Auth + tab:tools |
| `/projects` | ProjectsPage | Auth + tab:tools |
| `/projects/:id` | ProjectDetailPage | Auth + tab:tools |
| `/projects/:projectId/vessels/:vesselId` | InspectionDetailPage | Auth + tab:tools |

Route guards: `ProtectedRoute` (auth), `RequireAccess` (role), `RequireTabVisible` (feature flags).

## Key Database Tables

- `profiles` — User profiles (extends auth.users)
- `organizations` — Multi-tenant org records
- `competency_definitions` / `employee_competencies` — Certifications & qualifications
- `inspection_projects` / `vessels` / `scans` — Inspection workflow
- `documents` — Document management
- `activity_logs` — PII-masked audit trail
- `permission_requests` / `account_requests` — Approval workflows

All tables use RLS. Schema files in `database/`. Migrations in `supabase/migrations/`.

## Development Commands

```bash
npm run dev            # Vite dev server
npm run build          # TypeScript check + Vite production build
npm run typecheck      # TypeScript only
npm run lint           # ESLint
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
npm run test           # Vitest
npm run test:coverage  # With coverage report
npm run test:ci        # CI mode
npm run precommit      # lint + format:check + typecheck (also runs via Husky pre-commit hook)
```

## CI Pipeline (GitLab)

7 stages: install → security (gitleaks, semgrep, npm audit) → quality (lint, typecheck) → test (vitest + coverage) → build → deploy (Vercel, main only) → post-deploy (health checks)

## Implementation Rules

```
IF adding data fetching:
  → Create hook in src/hooks/queries/ using React Query
  → NEVER use useState + useEffect for loading data

IF adding UI:
  → Check src/components/ui/ first
  → Read dev-docs/design-system.md for tokens/classes
  → Extract reusable patterns to ui/ directory

IF adding a page:
  → Lazy-load it in App.tsx
  → Wrap with ErrorBoundary
  → Keep under 150 lines, delegate to feature components

IF modifying database:
  → Create migration in supabase/migrations/
  → Enable RLS on new tables
  → Test with multiple roles
```

## After Implementation

- Run `npm run build` to catch TypeScript/build errors
- Run `npm run test` to verify tests pass
- Check for security implications of changes

## Don't

- Add `console.log` in production code (Terser strips it in prod, but keep code clean)
- Create components over 300 lines
- Call services directly in components (use hooks)
- Use `SELECT *` in Supabase queries
- Modify schema without migration scripts
- Trust client-side validation alone
