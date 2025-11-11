# NDT Suite - Project Knowledge Base

> **Last Updated**: 2025-11-11
> **Purpose**: Comprehensive architecture and implementation guide for NDT Suite

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Authentication & Authorization](#authentication--authorization)
6. [Routing & Navigation](#routing--navigation)
7. [State Management](#state-management)
8. [Key Features](#key-features)
9. [File Structure](#file-structure)
10. [Design System](#design-system)
11. [Common Patterns](#common-patterns)
12. [Integration Points](#integration-points)

---

## Project Overview

**NDT Suite** is a modular Non-Destructive Testing (NDT) tool suite for managing:
- **Personnel certifications** and competencies
- **NDT inspections** and test results
- **Organizational management** with role-based access
- **Data visualization** (C-Scan, 3D viewing, PEC)
- **Calculation tools** (TOFD, NII)

### Business Domain
- **Industry**: Non-Destructive Testing (NDT) / Quality Assurance
- **Users**: Inspectors, certification managers, administrators
- **Compliance**: Tracks certifications, qualifications, witness checks
- **Critical Requirements**: Data integrity, security, audit trails

---

## Technology Stack

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.0
- **Language**: JavaScript (JSX) with TypeScript support
- **Routing**: React Router DOM v6.28.0
- **Styling**: Tailwind CSS 4.1.16
- **State**: Redux Toolkit 2.10.1 + Redux Persist 6.0.0

### Backend & Infrastructure
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Authentication**: Supabase Auth with magic links (passwordless)
- **Database**: PostgreSQL via Supabase
- **Storage**: Supabase Storage (for certificates, documents)
- **Real-time**: Supabase Realtime (rate-limited to 10 events/sec)

### Key Libraries
- **3D Visualization**: Three.js 0.164.1
- **Charts**: Plotly.js (dist-min) 3.2.0
- **PDF Generation**: jsPDF 3.0.3, pdfmake 0.2.20
- **Document Export**: docx 9.5.1, xlsx 0.18.5
- **Data Processing**: Papa Parse 5.5.3 (CSV)
- **Capture**: html2canvas 1.4.1
- **Crypto**: crypto-js 4.2.0, bcryptjs 3.0.3

### Development Tools
- **Linter**: ESLint 9.39.1
- **Formatter**: Prettier 3.6.2
- **Testing**: Vitest 4.0.7 + Testing Library
- **TypeScript**: 5.9.3

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│            React SPA (Vite)                     │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Pages      │  │  Components  │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────────────────────────┐          │
│  │   Auth Manager (auth-manager.js) │          │
│  └──────────────────────────────────┘          │
│  ┌──────────────────────────────────┐          │
│  │  Supabase Client (supabase-client.js)      │
│  └──────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Supabase Backend                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │   Auth   │  │ Database │  │ Storage  │     │
│  │ (Magic   │  │  (RLS)   │  │ (Files)  │     │
│  │  Links)  │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────┘
```

### Application Flow

1. **User lands** → Login page with animated background
2. **Enters email** → Magic link sent via Supabase Auth
3. **Clicks link** → Redirected to `/auth/callback`
4. **Auth Manager** validates session + loads user profile
5. **Main App** renders with Layout + protected routes
6. **Data fetching** uses Supabase client with automatic RLS enforcement

---

## Database Schema

### Core Tables

#### 1. **organizations**
```sql
id                UUID PRIMARY KEY
name              TEXT NOT NULL
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```
**Purpose**: Multi-tenant organization management
**RLS**: Users see only their org; admins see all

#### 2. **profiles** (extends auth.users)
```sql
id                UUID PRIMARY KEY (FK to auth.users)
username          TEXT UNIQUE NOT NULL
email             TEXT NOT NULL
role              TEXT (admin|org_admin|editor|viewer)
organization_id   UUID (FK to organizations)
is_active         BOOLEAN
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```
**Purpose**: User profiles with roles and organization linkage
**RLS**: Users see own profile; admins/org_admins see their org users

#### 3. **competency_categories**
```sql
id                UUID PRIMARY KEY
name              TEXT NOT NULL
description       TEXT
display_order     INTEGER
is_active         BOOLEAN
```
**Purpose**: Organize certifications (e.g., "NDT Level I", "Safety Certs")
**RLS**: All authenticated users can view; only admins can modify

#### 4. **competency_definitions**
```sql
id                UUID PRIMARY KEY
category_id       UUID (FK to competency_categories)
name              TEXT NOT NULL
description       TEXT
field_type        TEXT (text|date|expiry_date|boolean|file|number)
requires_document BOOLEAN
requires_approval BOOLEAN
display_order     INTEGER
is_active         BOOLEAN
```
**Purpose**: Define types of certifications/qualifications
**RLS**: All authenticated users can view; only admins can modify

#### 5. **employee_competencies**
```sql
id                UUID PRIMARY KEY
user_id           UUID (FK to auth.users)
competency_id     UUID (FK to competency_definitions)
value             TEXT (actual value: date, number, text)
expiry_date       TIMESTAMPTZ
document_url      TEXT (Supabase Storage URL)
document_name     TEXT
status            TEXT (active|expired|pending_approval|rejected)
verified_by       UUID (FK to auth.users)
verified_at       TIMESTAMPTZ
notes             TEXT
comments          TEXT (NEW: added for witness checks)
witness_check     BOOLEAN (NEW: indicates if witnessed)
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```
**Purpose**: Actual competency records for employees
**RLS**: Users see own; admins/org_admins see their org's records
**Unique**: (user_id, competency_id) - one competency per user

#### 6. **competency_history**
```sql
id                     UUID PRIMARY KEY
employee_competency_id UUID (FK to employee_competencies)
user_id                UUID
competency_id          UUID
action                 TEXT (created|updated|deleted|approved|rejected|expired)
old_value              TEXT
new_value              TEXT
old_expiry_date        TIMESTAMPTZ
new_expiry_date        TIMESTAMPTZ
changed_by             UUID
change_reason          TEXT
created_at             TIMESTAMPTZ
```
**Purpose**: Audit trail for all competency changes
**RLS**: Users see own history; admins see all in org

#### 7. **permission_requests**
```sql
id                  UUID PRIMARY KEY
user_id             UUID (FK to auth.users)
requested_role      TEXT
user_current_role   TEXT
message             TEXT
status              TEXT (pending|approved|rejected)
approved_by         UUID
rejected_by         UUID
rejection_reason    TEXT
created_at          TIMESTAMPTZ
approved_at         TIMESTAMPTZ
rejected_at         TIMESTAMPTZ
```
**Purpose**: Users can request role upgrades
**RLS**: Users see own requests; admins see all pending

#### 8. **account_requests**
```sql
id                  UUID PRIMARY KEY
username            TEXT NOT NULL
email               TEXT NOT NULL
requested_role      TEXT
organization_id     UUID
message             TEXT
status              TEXT (pending|approved|rejected)
approved_by         UUID
rejected_by         UUID
rejection_reason    TEXT
created_at          TIMESTAMPTZ
approved_at         TIMESTAMPTZ
rejected_at         TIMESTAMPTZ
```
**Purpose**: New user registration requests (before auth.users created)
**RLS**: Public can insert; admins can view/update

### Database Functions

#### `handle_new_user()`
- **Trigger**: After INSERT on auth.users
- **Purpose**: Auto-create profile record when user signs up
- **Logic**: Extracts username, role, org from user metadata

#### `approve_permission_request(request_id UUID)`
- **Purpose**: Approve role upgrade request
- **Actions**:
  1. Update profiles.role
  2. Update permission_requests.status to 'approved'
  3. Set approved_by and approved_at

#### `reject_permission_request(request_id UUID, reason TEXT)`
- **Purpose**: Reject role upgrade request
- **Actions**:
  1. Update permission_requests.status to 'rejected'
  2. Set rejected_by, rejected_at, rejection_reason

### Indexes (Performance Optimized)
```sql
-- Profiles
idx_profiles_organization (organization_id)
idx_profiles_username (username)

-- Competencies
idx_competency_definitions_category (category_id)
idx_employee_competencies_user (user_id)
idx_employee_competencies_competency (competency_id)
idx_employee_competencies_status (status)
idx_employee_competencies_expiry (expiry_date)

-- History
idx_competency_history_employee (employee_competency_id)
idx_competency_history_user (user_id)

-- Requests
idx_permission_requests_user (user_id)
idx_permission_requests_status (status)
idx_account_requests_status (status)
idx_account_requests_org (organization_id)
```

---

## Authentication & Authorization

### Authentication Flow (Magic Links)

1. **User enters email** at `/login`
2. **Frontend calls** Supabase Auth `signInWithOtp()`
3. **Supabase sends** magic link email using template:
   - Template: `email-templates/magic-link.html`
   - Variable: `{{ .ConfirmationURL }}` = one-time link
4. **User clicks** link → redirected to app with token
5. **Frontend exchanges** token for session (PKCE flow)
6. **Auth Manager** loads user profile from `profiles` table
7. **Session persisted** in localStorage as `ndt-suite-auth`

### Magic Link Email Template
- **Location**: `email-templates/magic-link.html`
- **Design**: Professional NDT Suite branding, responsive
- **Security notice**: Warns link expires in 1 hour
- **Support contact**: support@matrixinspectionservices.com

### Authorization (Role-Based Access Control)

#### Roles Hierarchy
```
admin           # Super admin - all organizations
  ├─ org_admin  # Organization admin - manage own org
      ├─ editor # Can create/edit/delete data
          └─ viewer # Read-only access
```

#### Role Permissions Matrix

| Permission      | Admin | Org Admin | Editor | Viewer |
|-----------------|-------|-----------|--------|--------|
| View data       | ✓     | ✓ (org)   | ✓      | ✓      |
| Create data     | ✓     | ✓ (org)   | ✓      | ✗      |
| Edit data       | ✓     | ✓ (org)   | ✓      | ✗      |
| Delete data     | ✓     | ✓ (org)   | ✓      | ✗      |
| Export data     | ✓     | ✓         | ✓      | ✓      |
| Manage users    | ✓     | ✓ (org)   | ✗      | ✗      |
| Manage orgs     | ✓     | ✗         | ✗      | ✗      |

### Auth Manager API

**File**: [src/auth-manager.js](src/auth-manager.js)

```javascript
import authManager from './auth-manager.js';

// Get current session
const session = await authManager.getSession();

// Get current user
const user = authManager.getCurrentUser();

// Get user profile (with role, org)
const profile = authManager.getCurrentProfile();

// Check permission
const canEdit = authManager.hasPermission('edit');

// Check role
const isAdmin = authManager.hasRole('admin');

// Sign in with magic link
await authManager.signInWithMagicLink(email);

// Sign out
await authManager.signOut();

// Listen to auth state changes
const unsubscribe = authManager.onAuthStateChange((session) => {
    console.log('Auth changed:', session);
});
```

### Supabase Client Configuration

**File**: [src/supabase-client.js](src/supabase-client.js)

```javascript
import supabase from './supabase-client.js';

// Client configured with:
auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'ndt-suite-auth',
    flowType: 'pkce' // More secure for SPAs
}
```

### Row Level Security (RLS) Strategy

All tables have **RLS enabled** with policies enforcing:

1. **Organization isolation**: Users only see data from their org (unless admin)
2. **Role-based access**: Permissions checked via `profiles.role`
3. **Self-access**: Users always see their own data
4. **Admin override**: Admins bypass org restrictions

**Example RLS Policy**:
```sql
-- Users can view competencies
CREATE POLICY "Users can view competencies"
    ON employee_competencies FOR SELECT
    USING (
        user_id = auth.uid()  -- Own records
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'  -- All admins
                OR (
                    p.role = 'org_admin'
                    AND p.organization_id IN (
                        SELECT organization_id
                        FROM profiles
                        WHERE id = employee_competencies.user_id
                    )
                )  -- Org admins for same org
            )
        )
    );
```

---

## Routing & Navigation

### Router Configuration

**File**: [src/App.jsx](src/App.jsx)

Using **React Router v6** with:
- `BrowserRouter` with future flags enabled
- Protected routes via `<ProtectedRoute>` component
- Lazy-loaded pages for code splitting
- Error boundaries on all routes
- Suspense fallbacks for loading states

### Route Structure

```javascript
/login                    # Public - LoginPageNew
/                         # Protected - DataHubPage (home)
/profile                  # Protected - ProfilePageNew
/personnel                # Protected - PersonnelManagementPage
/tofd                     # Protected - TofdCalculatorPage (TOFD calculator)
/cscan                    # Protected - CscanVisualizerPage (C-Scan viz)
/pec                      # Protected - PecVisualizerPage (PEC viz)
/3d                       # Protected - Viewer3DPage (3D viewer)
/nii                      # Protected - NiiCalculatorPage (NII calc)
/admin                    # Protected - AdminDashboard (admin only)
/*                        # Catch-all - Navigate to /
```

### Protected Route Component

**File**: [src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx)

```javascript
<Route element={<ProtectedRoute isLoggedIn={isLoggedIn} />}>
    <Route element={<Layout />}>
        <Route path="/" element={<DataHubPage />} />
        {/* ... more routes */}
    </Route>
</Route>
```

**Logic**:
- If `isLoggedIn === false` → Redirect to `/login`
- If `isLoggedIn === true` → Render child routes with Layout

### Layout Component

**File**: [src/components/LayoutNew.jsx](src/components/LayoutNew.jsx)

Provides:
- Sidebar navigation
- Top navigation bar
- User profile dropdown
- Theme switcher
- Logout functionality
- Responsive mobile menu

### Page Loading Strategy

**Lazy Loading** for performance:
```javascript
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePageNew.jsx'));
// ... etc

<Suspense fallback={<PageLoader />}>
    <Routes>
        {/* routes */}
    </Routes>
</Suspense>
```

**Benefits**:
- Smaller initial bundle size
- Faster first paint
- Code splitting per page

---

## State Management

### Redux Store

**Setup**: Redux Toolkit + Redux Persist (not heavily used yet)

**File**: [src/store/](src/store/) (if exists)

### Auth State

**Managed by**: [auth-manager.js](src/auth-manager.js)
**Storage**: localStorage (`ndt-suite-auth`)
**Sync**: Supabase auth state changes → React state updates

**Flow**:
```javascript
// App.jsx
const [isLoggedIn, setIsLoggedIn] = useState(false);

useEffect(() => {
    authManager.onAuthStateChange((session) => {
        setIsLoggedIn(!!session);
    });
}, []);
```

### Local Storage Keys

- `ndt-suite-auth` - Supabase session (token, user, expires)
- `theme` - Dark/light mode preference
- `auth_data` - Fallback local auth (when Supabase offline)

---

## Key Features

### 1. Personnel Management

**Page**: [src/pages/PersonnelManagementPage.jsx](src/pages/PersonnelManagementPage.jsx)

**Capabilities**:
- View all personnel in organization
- Add/edit/delete personnel records
- Manage competencies and certifications
- Track expiry dates
- Upload supporting documents
- Witness checks for critical competencies
- Competency comments

**Recent Changes** (from git history):
- Added competency comments field
- Implemented witness check functionality
- Enhanced certification tracking

### 2. User Profile Management

**Page**: [src/pages/ProfilePageNew.jsx](src/pages/ProfilePageNew.jsx)

**Capabilities**:
- View/edit own profile
- View own competencies and certifications
- Request permission upgrades (role changes)
- Upload profile picture (if implemented)
- Password reset functionality

### 3. Magic Link Authentication

**Page**: [src/pages/LoginPageNew.jsx](src/pages/LoginPageNew.jsx)

**Features**:
- Passwordless login via email
- Professional email template
- Animated background (particles + waves)
- Security notices
- Auto-redirect on success

### 4. Data Visualization Tools

#### C-Scan Visualizer
**Page**: [src/pages/CscanVisualizerPage.jsx](src/pages/CscanVisualizerPage.jsx)
**Purpose**: Visualize ultrasonic C-scan NDT data

#### 3D Viewer
**Page**: [src/pages/Viewer3DPage.jsx](src/pages/Viewer3DPage.jsx)
**Purpose**: 3D visualization of NDT data using Three.js

#### PEC Visualizer
**Page**: [src/pages/PecVisualizerPage.jsx](src/pages/PecVisualizerPage.jsx)
**Purpose**: Pulsed Eddy Current visualization

### 5. Calculation Tools

#### TOFD Calculator
**Page**: [src/pages/TofdCalculatorPage.jsx](src/pages/TofdCalculatorPage.jsx)
**Purpose**: Time-of-Flight Diffraction calculations

#### NII Calculator
**Page**: [src/pages/NiiCalculatorPage.jsx](src/pages/NiiCalculatorPage.jsx)
**Purpose**: Normalized Image Intensity calculations

### 6. Data Hub (Home)

**Page**: [src/pages/DataHubPage.jsx](src/pages/DataHubPage.jsx)
**Purpose**: Central dashboard with navigation to all tools

### 7. Admin Dashboard

**Page**: [src/pages/AdminDashboard.jsx](src/pages/AdminDashboard.jsx)
**Capabilities**:
- Manage organizations
- Approve/reject user registrations
- Approve/reject permission requests
- View system-wide statistics
- Manage competency definitions

---

## File Structure

```
NDT SUITE UMBER/
├── .claude/
│   ├── CLAUDE.md                    # This file - mandatory rules
│   ├── commands/                    # Custom slash commands
│   │   ├── build-and-fix.md
│   │   ├── code-review.md
│   │   ├── commit-and-push.md
│   │   └── ...
│   └── settings.local.json
├── database/
│   ├── supabase-schema.sql          # Main schema (orgs, profiles)
│   ├── competency-schema.sql        # Competency system
│   ├── supabase-profile-schema.sql  # Permission requests
│   ├── supabase-storage-setup.sql   # Storage buckets
│   └── ...
├── dev-docs/                        # Complex feature documentation
│   ├── [feature]-plan.md
│   ├── [feature]-context.md
│   └── [feature]-tasks.md
├── docs/
│   ├── SUPABASE_SETUP.md
│   └── SUPABASE_SYNC_SETUP.md
├── email-templates/
│   └── magic-link.html              # Magic link email template
├── src/
│   ├── components/
│   │   ├── ErrorBoundary.tsx
│   │   ├── GlobalErrorBoundary.jsx
│   │   ├── LayoutNew.jsx            # Main layout wrapper
│   │   └── ProtectedRoute.jsx       # Route protection
│   ├── pages/
│   │   ├── AdminDashboard.jsx
│   │   ├── DataHubPage.jsx
│   │   ├── LoginPageNew.jsx
│   │   ├── PersonnelManagementPage.jsx
│   │   ├── ProfilePageNew.jsx
│   │   └── ...
│   ├── config/
│   │   └── environment.js           # Environment config
│   ├── utils/
│   │   └── globalStyleEnforcer.js
│   ├── styles/
│   │   └── main.css
│   ├── App.jsx                      # Main app component
│   ├── auth-manager.js              # Authentication manager
│   ├── supabase-client.js           # Supabase client config
│   ├── indexed-db.js                # Local storage fallback
│   ├── sync-service.js              # Data sync service
│   ├── theme.js                     # Theme system
│   └── themes.js                    # Theme definitions
├── PROJECT_KNOWLEDGE.md             # This file
├── TROUBLESHOOTING.md               # Common issues and solutions
├── package.json
├── vite.config.js                   # Build config with CSP
├── tailwind.config.js
├── tsconfig.json
└── .env.local                       # Environment variables (gitignored)
```

---

## Design System

### Color Themes

**System**: Dynamic theme switcher with multiple presets

**Themes**:
- Cyber Teal (default)
- Electric Purple
- Solar Gold
- Crimson Red
- Forest Green
- Ocean Blue
- Midnight Black

**Implementation**:
- CSS custom properties (CSS variables)
- JavaScript theme switcher in Layout
- Persisted in localStorage

### Tailwind Configuration

**Framework**: Tailwind CSS 4.1.16

**Common Classes**:
```css
/* Backgrounds */
bg-gray-900, bg-gray-800, bg-gray-700

/* Text */
text-white, text-gray-300, text-gray-400

/* Borders */
border border-gray-700, rounded-lg, rounded-xl

/* Layout */
flex, flex-col, items-center, justify-between
grid, grid-cols-1, md:grid-cols-2, lg:grid-cols-3

/* Spacing */
p-4, p-6, m-4, gap-4

/* Shadows */
shadow-lg, shadow-xl

/* Gradients */
bg-gradient-to-br from-gray-900 to-gray-800
```

### Typography

**Font Stack**:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'Helvetica Neue', Arial, sans-serif;
```

**Sizes**:
- Headings: `text-2xl`, `text-3xl`, `text-4xl`
- Body: `text-base` (16px)
- Small: `text-sm` (14px)
- Tiny: `text-xs` (12px)

### Component Patterns

#### Button
```jsx
<button className="px-4 py-2 bg-blue-500 text-white rounded-lg
                   hover:bg-blue-600 transition-colors">
    Click Me
</button>
```

#### Card
```jsx
<div className="bg-gray-800 border border-gray-700 rounded-xl p-6
                shadow-lg">
    {/* content */}
</div>
```

#### Input
```jsx
<input
    type="text"
    className="w-full px-4 py-2 bg-gray-700 border border-gray-600
               rounded-lg text-white focus:ring-2 focus:ring-blue-500"
/>
```

---

## Common Patterns

### 1. Data Fetching from Supabase

```javascript
import supabase from './supabase-client.js';

// Read data
const fetchCompetencies = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('employee_competencies')
            .select(`
                *,
                competency_definitions (
                    id,
                    name,
                    field_type
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching competencies:', error);
        return { success: false, error: error.message };
    }
};

// Insert data
const addCompetency = async (competencyData) => {
    try {
        const { data, error } = await supabase
            .from('employee_competencies')
            .insert([competencyData])
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error adding competency:', error);
        return { success: false, error: error.message };
    }
};

// Update data
const updateCompetency = async (id, updates) => {
    try {
        const { data, error } = await supabase
            .from('employee_competencies')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error updating competency:', error);
        return { success: false, error: error.message };
    }
};

// Delete data
const deleteCompetency = async (id) => {
    try {
        const { error } = await supabase
            .from('employee_competencies')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting competency:', error);
        return { success: false, error: error.message };
    }
};
```

### 2. File Upload to Supabase Storage

```javascript
// Upload file
const uploadCertificate = async (file, userId) => {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from('certificates')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('certificates')
            .getPublicUrl(fileName);

        return { success: true, url: publicUrl, path: fileName };
    } catch (error) {
        console.error('Error uploading file:', error);
        return { success: false, error: error.message };
    }
};

// Delete file
const deleteCertificate = async (filePath) => {
    try {
        const { error } = await supabase.storage
            .from('certificates')
            .remove([filePath]);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting file:', error);
        return { success: false, error: error.message };
    }
};
```

### 3. Error Boundary Usage

```javascript
import ErrorBoundary from './components/ErrorBoundary';

<ErrorBoundary>
    <SomeComponent />
</ErrorBoundary>
```

### 4. Lazy Loading Pages

```javascript
import { lazy, Suspense } from 'react';

const MyPage = lazy(() => import('./pages/MyPage'));

<Suspense fallback={<div>Loading...</div>}>
    <MyPage />
</Suspense>
```

### 5. Role-Based Rendering

```javascript
import authManager from './auth-manager.js';

const MyComponent = () => {
    const profile = authManager.getCurrentProfile();
    const canEdit = authManager.hasPermission('edit');
    const isAdmin = authManager.hasRole('admin');

    return (
        <div>
            {canEdit && <button>Edit</button>}
            {isAdmin && <button>Admin Panel</button>}
        </div>
    );
};
```

### 6. Form Handling Pattern

```javascript
import { useState } from 'react';

const MyForm = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: ''
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear error for this field
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: null
            }));
        }
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.name) newErrors.name = 'Name is required';
        if (!formData.email) newErrors.email = 'Email is required';
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = validate();
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSubmitting(true);
        try {
            // Submit logic
            const result = await submitData(formData);
            if (result.success) {
                // Success handling
            } else {
                setErrors({ submit: result.error });
            }
        } catch (error) {
            setErrors({ submit: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {/* form fields */}
            <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
        </form>
    );
};
```

---

## Integration Points

### Environment Configuration

**File**: [src/config/environment.js](src/config/environment.js)

**Required Variables** (in `.env.local`):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup

**Docs**:
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
- [docs/SUPABASE_SYNC_SETUP.md](docs/SUPABASE_SYNC_SETUP.md)

**Steps**:
1. Create Supabase project
2. Run schema files in SQL Editor (database/*.sql)
3. Configure authentication (enable magic links)
4. Set up storage buckets
5. Configure RLS policies
6. Add environment variables to .env.local

### Content Security Policy (CSP)

**File**: [vite.config.js](vite.config.js)

**Development CSP**:
- Allows Supabase connections (*.supabase.co)
- Allows inline scripts for HMR
- Allows Google Fonts

**Production CSP**:
- Stricter policies
- No inline scripts (except necessary)
- HSTS enabled
- All resources from self or approved domains

### Build Pipeline

**Build Command**: `npm run build`

**Process**:
1. TypeScript compilation (`tsc`)
2. Vite build (bundling, minification)
3. Terser minification (removes console.log)
4. Code splitting (vendor chunks)
5. Asset hashing for cache busting

**Output**: `dist/` directory

---

## Recent Changes (Git History)

Based on git log:

1. **2025-11-11** - Add competency comments and witness check features
2. **2025-11-11** - Add password reset functionality and professional email templates
3. **2025-11-11** - Add comprehensive feature updates and design system improvements
4. **Earlier** - Add user sync utility script
5. **Earlier** - Update authentication flow and UI improvements

---

## Conventions & Best Practices

### Naming Conventions

**Files**:
- Components: `PascalCase.jsx` (e.g., `ProfilePageNew.jsx`)
- Utilities: `camelCase.js` (e.g., `auth-manager.js`)
- Pages: `PascalCase.jsx` with "Page" suffix (e.g., `DataHubPage.jsx`)

**Variables**:
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `ROLES.ADMIN`)
- Functions: `camelCase` (e.g., `getUserProfile`)
- React components: `PascalCase` (e.g., `UserCard`)
- React hooks: `camelCase` starting with `use` (e.g., `useAuth`)

**Database**:
- Tables: `snake_case` plural (e.g., `employee_competencies`)
- Columns: `snake_case` (e.g., `created_at`)
- Functions: `snake_case` (e.g., `handle_new_user`)

### Code Organization

**Component Structure**:
```javascript
// 1. Imports
import React, { useState, useEffect } from 'react';
import supabase from './supabase-client.js';

// 2. Constants
const DEFAULT_LIMIT = 10;

// 3. Component
const MyComponent = ({ prop1, prop2 }) => {
    // 4. State
    const [data, setData] = useState([]);

    // 5. Effects
    useEffect(() => {
        loadData();
    }, []);

    // 6. Handlers
    const handleClick = () => {
        // logic
    };

    // 7. Helper functions
    const loadData = async () => {
        // logic
    };

    // 8. Render
    return (
        <div>
            {/* JSX */}
        </div>
    );
};

// 9. Export
export default MyComponent;
```

### Error Handling Standards

1. **Always catch errors** in async functions
2. **Return structured results**: `{ success: true/false, data/error }`
3. **Log errors** with context
4. **Don't expose sensitive info** in error messages to user
5. **Use error boundaries** for React component errors

### Security Checklist

Before merging any code:

- [ ] All user inputs validated
- [ ] Supabase queries check for errors
- [ ] No hardcoded secrets/keys
- [ ] RLS policies tested
- [ ] File uploads validated (type, size)
- [ ] Authentication required for protected routes
- [ ] Authorization checked for sensitive operations
- [ ] SQL injection risks assessed
- [ ] XSS prevention in place
- [ ] Error messages don't leak sensitive data

---

## Performance Optimization

### Current Optimizations

1. **Lazy loading** all page components
2. **Code splitting** vendor chunks (react, redux, supabase, etc.)
3. **Suspense** for loading states
4. **Terser minification** in production
5. **Source maps disabled** in production
6. **Console.log removal** in production build
7. **Rate limiting** on Supabase Realtime (10 events/sec)

### Performance Metrics to Watch

- **First Contentful Paint (FCP)**: <1.8s
- **Largest Contentful Paint (LCP)**: <2.5s
- **Time to Interactive (TTI)**: <3.9s
- **Bundle size**: <200KB initial (gzipped)

---

## Testing Strategy

### Test Framework

- **Unit tests**: Vitest
- **Component tests**: React Testing Library
- **E2E tests**: (Not configured yet)

### Test Coverage Goals

- Critical business logic: 80%+
- Authentication flows: 90%+
- Data validation: 90%+
- UI components: 60%+

### Running Tests

```bash
npm run test           # Run all tests
npm run test:ui        # Run with UI
npm run test:coverage  # Generate coverage report
npm run test:watch     # Watch mode
```

---

## Deployment

### Build for Production

```bash
npm run build
```

**Checklist before deploy**:
- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] Build succeeds without warnings
- [ ] Environment variables configured
- [ ] Supabase schema applied
- [ ] RLS policies tested
- [ ] CSP headers configured

### Environment Variables (Production)

Required in hosting platform:
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---

## Contacts & Resources

**Support Email**: support@matrixinspectionservices.com

**Documentation**:
- Supabase: https://supabase.com/docs
- React: https://react.dev
- Vite: https://vitejs.dev
- Tailwind CSS: https://tailwindcss.com

**Internal Docs**:
- [CLAUDE.md](.claude/CLAUDE.md) - Development rules
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) - Backend setup

---

**Last Updated**: 2025-11-11
**Maintainer**: Claude Code (AI Assistant)
**Version**: 1.0.0
