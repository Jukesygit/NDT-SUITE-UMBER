# NDT-SUITE-UMBER Rebuild & Enhancement - Strategic Implementation Plan

**Project**: Enterprise-Grade NDT Suite Rebuild  
**Scope**: Transform existing NDT tool suite into comprehensive project management and quality management platform  
**Duration**: 12-14 months (5 phases)  
**Complexity**: High - Enterprise architecture with compliance requirements  
**Last Updated**: 2025-11-08

---

## Executive Summary

### Current State
- **Codebase**: ~50k LOC vanilla JavaScript application
- **Architecture**: Modular tool-based structure with basic auth
- **Backend**: Supabase (PostgreSQL) with cloud sync
- **Frontend**: Vanilla JS with component-based structure
- **Current Tools**: TOFD Calculator, C-Scan Visualizer, PEC Visualizer, 3D Viewer, NII Coverage Calculator, Report Generator

### Target State
- **Enterprise Platform**: Comprehensive NDT project and quality management system
- **Architecture**: Modern TypeScript microservices with React 19 frontend
- **Features**: 10 major modules (Project Management, Personnel, QMS, Equipment, CRM, etc.)
- **Compliance**: ASNT SNT-TC-1A, ISO 9712, EN 473, ASME, AWS, API standards
- **Scale**: Support for multi-tenant organizations with thousands of projects

### Strategic Approach
This is **NOT a greenfield project** - it's a systematic rebuild and enhancement:
1. **Preserve**: Core NDT calculation engines and data structures
2. **Modernize**: Technology stack to industry best practices
3. **Expand**: Add enterprise features for project and quality management
4. **Scale**: Architecture for multi-org, multi-user enterprise deployment

---

## Risk Assessment

### Critical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Data Migration Complexity** | Critical | High | Create comprehensive migration scripts with rollback capability, run parallel systems during transition |
| **Performance with Large Datasets** | High | Medium | Implement pagination, indexing strategy, caching layer from day 1 |
| **Compliance Requirements** | Critical | Medium | Involve compliance expert in design phase, review against standards documentation |
| **Feature Scope Creep** | High | High | Strict phase gates, each module complete before moving forward |
| **User Adoption** | High | Medium | Involve actual NDT technicians in design, comprehensive training program |
| **Technology Learning Curve** | Medium | Medium | Incremental adoption, extensive documentation, pair programming |

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Supabase scaling limitations | Design with database abstraction layer for potential migration to dedicated PostgreSQL |
| Real-time sync complexity | Implement conflict resolution strategy, queue-based sync with retry logic |
| Mobile offline mode | Use IndexedDB with sync queue, comprehensive testing of offline scenarios |
| Report generation performance | Asynchronous job queue with progress tracking, template caching |

---

## Technology Stack Decisions

### Frontend Architecture
**Selected**: React 19 + TypeScript + TanStack Router + TanStack Query

**Rationale**:
- React 19: Latest features (Server Components, Actions), massive ecosystem
- TypeScript: Type safety critical for domain complexity (NDT calculations)
- TanStack Router: File-based routing, type-safe, excellent DX
- TanStack Query: Server state management, caching, optimistic updates
- MUI v7: Comprehensive component library with accessibility

**Alternative Considered**: Vue 3 + Pinia (rejected: smaller ecosystem for complex data grids)

### Backend Architecture
**Selected**: Node.js + Express + TypeScript + Prisma ORM

**Rationale**:
- Node.js: Single language across stack, excellent for I/O operations
- Express: Mature, well-understood, extensive middleware ecosystem
- Prisma: Type-safe ORM, excellent migrations, introspection
- TypeScript: Shared types between frontend/backend

**Microservices Structure**:
```
backend/
├── auth-service/        # Authentication, user management
├── project-service/     # Projects, work orders, tasks
├── personnel-service/   # Employees, certifications, scheduling
├── quality-service/     # QMS, procedures, NCRs, audits
├── equipment-service/   # Equipment, calibration
├── client-service/      # CRM, contracts
├── notification-service/ # Email, SMS, in-app notifications
├── report-service/      # Report generation (async jobs)
└── api-gateway/         # Central API gateway with routing
```

### Database Architecture
**Selected**: PostgreSQL (via Supabase) + Redis

**Rationale**:
- PostgreSQL: ACID compliance, JSON support, excellent for complex queries
- Supabase: Managed PostgreSQL, real-time, auth, storage, good for MVP
- Redis: Session management, caching, job queue (BullMQ)
- Migration Path: Can transition to dedicated RDS if Supabase limiting

**Schema Strategy**: Domain-driven design with clear boundaries between services

### Infrastructure
**Selected**: Vercel (Frontend) + Railway/Render (Backend Services) + Supabase (Database)

**Rationale**:
- Cost-effective for startup phase
- Easy CI/CD integration
- Scalable as product grows
- Migration path to AWS/Azure if needed

---

## System Architecture

### High-Level Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  Web App (React)  │  Mobile App (React Native)  │  API CLI  │
└────────────┬────────────────────────┬────────────────┬──────┘
             │                        │                │
┌────────────▼────────────────────────▼────────────────▼──────┐
│                    API GATEWAY (Express)                     │
│  - Authentication middleware                                 │
│  - Rate limiting                                             │
│  - Request routing                                           │
│  - Response normalization                                    │
└────────────┬────────────────────────────────────────────────┘
             │
      ┌──────┴──────┐
      │   Services   │
      └──────┬───────┘
      ┌──────▼────────────────────────────────────────┐
      │  Microservices (Express + TypeScript)         │
      ├───────────────────────────────────────────────┤
      │ Auth │ Project │ Personnel │ Quality │ etc.   │
      └──────┬────────────────────────────────────────┘
             │
      ┌──────▼──────┐
      │  Data Layer  │
      ├─────────────┤
      │ PostgreSQL  │  ← Primary data store
      │ Redis       │  ← Cache + Session + Queue
      │ S3 Storage  │  ← Files + Documents
      └─────────────┘
```

### Data Flow Patterns

**1. Synchronous API Requests** (Standard CRUD)
```
Client → API Gateway → Service → Database → Service → Gateway → Client
```

**2. Asynchronous Jobs** (Report Generation, Bulk Operations)
```
Client → API Gateway → Service → Job Queue (Redis/BullMQ)
                                     ↓
                              Worker Process
                                     ↓
                            Generate Artifact → S3
                                     ↓
                            Notification Service → Client
```

**3. Real-time Updates** (Collaborative Features)
```
Client ← WebSocket ← Notification Service ← Database Change (Supabase Realtime)
```

---

## Database Schema Design

### Core Design Principles
1. **Multi-tenancy**: All tables have `organization_id` for data isolation
2. **Soft Deletes**: `deleted_at` timestamp for audit trail
3. **Audit Trail**: `created_at`, `updated_at`, `created_by`, `updated_by` on all tables
4. **Normalization**: 3NF for transactional data, denormalization for reporting
5. **Versioning**: Temporal tables for procedures, reports requiring version history

### Schema Overview (30+ Core Tables)

#### **Organizations & Users Domain**
```sql
organizations
├── id (uuid, PK)
├── name (text)
├── settings (jsonb)
├── subscription_tier (enum)
└── timestamps

users
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── email (text, unique)
├── role (enum: admin, manager, inspector, viewer)
├── status (enum: active, inactive, suspended)
└── timestamps

user_profiles
├── user_id (uuid, PK, FK)
├── first_name, last_name
├── phone, emergency_contact
├── hire_date, termination_date
└── timestamps
```

#### **Project Management Domain**
```sql
projects
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── project_number (text, unique per org)
├── name (text)
├── client_id (uuid, FK → clients)
├── status (enum: planning, active, on_hold, completed, cancelled)
├── start_date, end_date
├── budget_amount, actual_cost
├── scope (jsonb)
└── timestamps

work_orders
├── id (uuid, PK)
├── project_id (uuid, FK)
├── wo_number (text)
├── assigned_to (uuid, FK → users)
├── status (enum: pending, in_progress, on_hold, completed, cancelled)
├── priority (enum: low, medium, high, critical)
├── scheduled_start, scheduled_end
├── actual_start, actual_end
├── instructions (text)
└── timestamps

assets
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── asset_number (text)
├── name (text)
├── parent_asset_id (uuid, FK → assets) -- hierarchical
├── asset_type (enum: facility, system, component, weld)
├── criticality (enum: low, medium, high, critical)
├── location (jsonb)
├── specifications (jsonb)
└── timestamps

inspections
├── id (uuid, PK)
├── work_order_id (uuid, FK)
├── asset_id (uuid, FK)
├── inspector_id (uuid, FK → users)
├── inspection_type (enum: RT, UT, MT, PT, VT, ET, TOFD)
├── procedure_id (uuid, FK → procedures)
├── status (enum: planned, in_progress, completed, failed)
├── inspection_date
├── results (jsonb) -- stores NDT calculation results
├── acceptance_status (enum: accept, repair, reject)
└── timestamps
```

#### **Personnel Management Domain**
```sql
certifications
├── id (uuid, PK)
├── user_id (uuid, FK)
├── method (enum: RT, UT, MT, PT, VT, ET, TOFD)
├── level (enum: I, II, III)
├── standard (enum: ASNT_SNT_TC_1A, ISO_9712, EN_473)
├── certification_number (text)
├── issue_date, expiration_date
├── issuing_body (text)
├── document_url (text) -- S3 link
└── timestamps

training_records
├── id (uuid, PK)
├── user_id (uuid, FK)
├── training_type (text)
├── training_date
├── hours (numeric)
├── instructor (text)
├── certificate_url (text)
└── timestamps

schedules
├── id (uuid, PK)
├── user_id (uuid, FK)
├── work_order_id (uuid, FK, nullable)
├── start_datetime, end_datetime
├── type (enum: work, training, leave, unavailable)
├── status (enum: planned, confirmed, completed, cancelled)
└── timestamps

timesheets
├── id (uuid, PK)
├── user_id (uuid, FK)
├── work_order_id (uuid, FK, nullable)
├── date
├── hours_worked (numeric)
├── hourly_rate (numeric)
├── status (enum: draft, submitted, approved, rejected)
└── timestamps
```

#### **Quality Management Domain**
```sql
procedures
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── procedure_number (text)
├── title (text)
├── type (enum: WPS, PQR, NDT_procedure, inspection_procedure)
├── version (integer)
├── status (enum: draft, under_review, approved, obsolete)
├── content (text) -- markdown/rich text
├── approved_by (uuid, FK → users)
├── approval_date
├── effective_date, expiration_date
└── timestamps

non_conformance_reports (ncrs)
├── id (uuid, PK)
├── ncr_number (text)
├── inspection_id (uuid, FK)
├── reported_by (uuid, FK → users)
├── severity (enum: minor, major, critical)
├── description (text)
├── root_cause (text)
├── corrective_action (text)
├── preventive_action (text)
├── disposition (enum: accept, repair, reject, use_as_is)
├── status (enum: open, under_investigation, resolved, closed)
└── timestamps

audits
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── audit_number (text)
├── audit_type (enum: internal, external, certification)
├── standard (text) -- ISO 9001, ASME, etc.
├── auditor_id (uuid, FK → users)
├── audit_date
├── findings (jsonb)
├── status (enum: planned, in_progress, completed)
└── timestamps

audit_findings
├── id (uuid, PK)
├── audit_id (uuid, FK)
├── finding_type (enum: non_conformance, observation, opportunity)
├── severity (enum: minor, major, critical)
├── description (text)
├── corrective_action (text)
├── responsible_party (uuid, FK → users)
├── due_date
├── status (enum: open, in_progress, resolved, verified)
└── timestamps
```

#### **Equipment & Calibration Domain**
```sql
equipment
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── equipment_number (text)
├── name (text)
├── type (enum: UT_device, RT_device, thickness_gauge, etc.)
├── manufacturer, model, serial_number
├── purchase_date, purchase_cost
├── status (enum: available, in_use, maintenance, out_of_service)
├── calibration_frequency_days (integer)
└── timestamps

calibration_records
├── id (uuid, PK)
├── equipment_id (uuid, FK)
├── calibration_date
├── next_due_date
├── performed_by (text) -- external calibration lab
├── certificate_number (text)
├── certificate_url (text)
├── status (enum: valid, expired, due_soon)
└── timestamps

equipment_assignments
├── id (uuid, PK)
├── equipment_id (uuid, FK)
├── assigned_to (uuid, FK → users)
├── work_order_id (uuid, FK, nullable)
├── checkout_date, expected_return_date, actual_return_date
├── condition_at_checkout, condition_at_return (text)
└── timestamps
```

#### **Client Management Domain**
```sql
clients
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── name (text)
├── type (enum: direct, contractor, government)
├── primary_contact (jsonb)
├── billing_address (jsonb)
├── status (enum: active, inactive)
└── timestamps

contracts
├── id (uuid, PK)
├── client_id (uuid, FK)
├── contract_number (text)
├── start_date, end_date
├── value (numeric)
├── payment_terms (text)
├── sla_terms (jsonb)
├── status (enum: draft, active, expired, terminated)
├── document_url (text)
└── timestamps

invoices
├── id (uuid, PK)
├── contract_id (uuid, FK)
├── invoice_number (text)
├── issue_date, due_date
├── subtotal, tax_amount, total_amount
├── status (enum: draft, sent, paid, overdue, cancelled)
├── line_items (jsonb)
└── timestamps
```

#### **Notification & System Domain**
```sql
notifications
├── id (uuid, PK)
├── user_id (uuid, FK)
├── type (enum: certification_expiring, calibration_due, task_assigned, etc.)
├── title (text)
├── message (text)
├── priority (enum: low, medium, high)
├── read (boolean)
├── action_url (text)
└── timestamps

system_logs
├── id (bigserial, PK)
├── user_id (uuid, FK, nullable)
├── action (text)
├── entity_type (text)
├── entity_id (uuid)
├── changes (jsonb) -- before/after values
├── ip_address (inet)
└── timestamp

documents
├── id (uuid, PK)
├── organization_id (uuid, FK)
├── name (text)
├── type (text)
├── file_url (text)
├── file_size (bigint)
├── mime_type (text)
├── folder_path (text)
├── uploaded_by (uuid, FK → users)
├── related_entity_type (text) -- polymorphic
├── related_entity_id (uuid)
└── timestamps
```

### Indexing Strategy
```sql
-- Performance-critical indexes
CREATE INDEX idx_projects_org_status ON projects(organization_id, status);
CREATE INDEX idx_work_orders_project_status ON work_orders(project_id, status);
CREATE INDEX idx_inspections_asset ON inspections(asset_id);
CREATE INDEX idx_certifications_user_expiration ON certifications(user_id, expiration_date);
CREATE INDEX idx_calibration_next_due ON calibration_records(next_due_date) WHERE status != 'expired';
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;

-- Full-text search indexes
CREATE INDEX idx_assets_search ON assets USING GIN(to_tsvector('english', name || ' ' || asset_number));
CREATE INDEX idx_procedures_search ON procedures USING GIN(to_tsvector('english', title || ' ' || content));
```

---

## API Architecture

### RESTful API Design Principles
1. **Resource-based URLs**: `/api/v1/projects/{id}` not `/api/v1/getProject`
2. **HTTP Methods**: GET (read), POST (create), PUT (update full), PATCH (update partial), DELETE
3. **Status Codes**: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Server Error)
4. **Pagination**: Query params `?page=1&limit=20`, response includes `total`, `page`, `totalPages`
5. **Filtering**: Query params `?status=active&sort=-created_at`
6. **Versioning**: URL-based `/api/v1/`, `/api/v2/`

### API Gateway Routes
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/register

GET    /api/v1/projects              # List projects (paginated, filtered)
POST   /api/v1/projects              # Create project
GET    /api/v1/projects/{id}         # Get single project
PATCH  /api/v1/projects/{id}         # Update project
DELETE /api/v1/projects/{id}         # Delete (soft) project
GET    /api/v1/projects/{id}/work-orders  # Nested resource

GET    /api/v1/work-orders
POST   /api/v1/work-orders
GET    /api/v1/work-orders/{id}
PATCH  /api/v1/work-orders/{id}
POST   /api/v1/work-orders/{id}/assign     # Action endpoint

GET    /api/v1/users
GET    /api/v1/users/{id}
GET    /api/v1/users/{id}/certifications
POST   /api/v1/certifications
GET    /api/v1/certifications/expiring     # Custom query endpoint

GET    /api/v1/equipment
POST   /api/v1/equipment/{id}/checkout     # Action endpoint
POST   /api/v1/equipment/{id}/return

POST   /api/v1/reports/generate            # Async job
GET    /api/v1/reports/{jobId}/status      # Job status
GET    /api/v1/reports/{jobId}/download    # Download result

GET    /api/v1/analytics/dashboard         # Aggregated data
GET    /api/v1/analytics/projects/kpi
```

### Authentication Flow
```
1. User submits credentials → POST /api/v1/auth/login
2. Server validates → Returns JWT access token (15 min) + refresh token (7 days)
3. Client stores tokens (httpOnly cookies preferred, or localStorage)
4. Every API request includes: Authorization: Bearer {access_token}
5. Access token expires → Use refresh token → POST /api/v1/auth/refresh
6. Refresh token expires → Force re-login
```

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "timestamp": "2025-11-08T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

---

## Implementation Phases (Detailed)

### Phase 1: Foundation & Core Infrastructure (2-3 months)

**Goals**: 
- Modern tech stack migration
- Core authentication and authorization
- Database schema foundation
- Basic project management

**Deliverables**:
1. New repository structure with monorepo setup (Turborepo or Nx)
2. React 19 + TypeScript frontend scaffold
3. Express + TypeScript backend services (auth, project)
4. PostgreSQL database with initial schema (15 core tables)
5. JWT-based authentication with refresh tokens
6. Role-based access control (RBAC) implementation
7. API Gateway with routing
8. Basic CRUD for Projects and Work Orders
9. Data migration scripts from old system
10. CI/CD pipeline (GitHub Actions)

**Claude Code Skills Needed**:
- `backend-dev-guidelines`: Node.js/Express patterns
- `frontend-dev-guidelines`: React 19/TypeScript patterns
- `database-design`: Schema design and migrations
- `auth-security`: Authentication and RBAC implementation

**Agents to Use**:
- `strategic-plan-architect`: Break down phase into detailed tasks
- `database-schema-designer`: Design normalized schema
- `code-architecture-reviewer`: Review architecture decisions

**Success Criteria**:
- [ ] Users can log in with JWT authentication
- [ ] Users can create, view, update projects
- [ ] Users can create and assign work orders
- [ ] Old data successfully migrated
- [ ] API latency < 200ms for standard requests
- [ ] 100% test coverage on auth module

**Key Tasks**:
```
Phase 1 Breakdown:
├── Week 1-2: Project Setup & Tooling
│   ├── Initialize monorepo (Turborepo)
│   ├── Configure TypeScript, ESLint, Prettier
│   ├── Set up React 19 with Vite
│   ├── Configure TanStack Router and Query
│   └── Set up test framework (Vitest + React Testing Library)
├── Week 3-4: Database & Auth
│   ├── Design core schema (organizations, users, projects, work_orders)
│   ├── Set up Prisma ORM
│   ├── Implement auth-service (JWT, refresh tokens)
│   ├── Implement RBAC middleware
│   └── Write auth tests
├── Week 5-6: API Gateway & Project Service
│   ├── Build API gateway with Express
│   ├── Implement project-service CRUD
│   ├── Implement work-order-service CRUD
│   ├── Add pagination and filtering
│   └── API documentation with Swagger
├── Week 7-8: Frontend Core
│   ├── Build authentication flow (login, logout, token refresh)
│   ├── Create main layout and navigation
│   ├── Build projects list and detail pages
│   ├── Build work orders management UI
│   └── Integrate with backend APIs
├── Week 9-10: Data Migration & Testing
│   ├── Write migration scripts for old NDT data
│   ├── Test migration with production data copy
│   ├── End-to-end testing
│   ├── Performance testing
│   └── Security audit
├── Week 11-12: Deployment & Documentation
│   ├── Set up staging environment
│   ├── Configure CI/CD pipeline
│   ├── Write deployment documentation
│   ├── Conduct user acceptance testing
│   └── Deploy to production
```

---

### Phase 2: Personnel & Equipment Management (2-3 months)

**Goals**:
- Complete personnel management system
- Certification tracking with expiration alerts
- Equipment and calibration management
- Resource scheduling

**Deliverables**:
1. Employee profiles and skill matrix
2. Certification management with document storage
3. Training records system
4. Equipment registry and calibration tracking
5. Resource scheduling with calendar integration
6. Automated expiration notifications (30/60/90 days)
7. Equipment checkout/return system
8. Dashboard for certifications and calibrations due

**Claude Code Skills Needed**:
- `notification-system`: Email/SMS integration
- `scheduling-logic`: Calendar and availability algorithms
- `file-storage`: S3 integration for certificates

**Agents to Use**:
- `notification-architect`: Design notification system
- `scheduler-algorithm-designer`: Resource scheduling logic

**Success Criteria**:
- [ ] All employee data migrated with certifications
- [ ] Notifications sent 90/60/30 days before expiration
- [ ] Equipment can be checked out and tracked
- [ ] Calendar shows resource availability
- [ ] Certification expiration dashboard functional

---

### Phase 3: Quality Management System (2-3 months)

**Goals**:
- Standards-compliant QMS
- Procedure management with version control
- Non-conformance reporting
- Audit management

**Deliverables**:
1. Procedure repository with versioning
2. WPS/PQR management
3. NCR creation and tracking
4. Root cause analysis and CAPA
5. Audit scheduling and findings management
6. Compliance checklists (ASME, AWS, API)
7. Document control system
8. Digital signature capture

**Claude Code Skills Needed**:
- `qms-compliance`: QMS standards and requirements
- `version-control-logic`: Document versioning
- `digital-signatures`: Electronic signature implementation

**Agents to Use**:
- `compliance-reviewer`: Review against standards
- `documentation-architect`: Structure QMS documentation

**Success Criteria**:
- [ ] Procedures have version history and approval workflow
- [ ] NCRs link to inspections and track CAPA
- [ ] Audits generate findings with resolution tracking
- [ ] Digital signatures legally compliant
- [ ] Document control maintains revision history

---

### Phase 4: Reporting & Analytics (2-3 months)

**Goals**:
- Professional report generation
- Advanced analytics and dashboards
- Client portal
- Workflow automation

**Deliverables**:
1. Report template library
2. Async report generation with PDF export
3. Analytics dashboard with KPIs
4. Heat maps for inspection coverage
5. Trend analysis for defect types
6. Project Gantt charts
7. Client portal for report access
8. Automated workflow triggers
9. Email/SMS notifications for critical events

**Claude Code Skills Needed**:
- `report-generation`: PDF generation with templates
- `data-visualization`: Charts and graphs
- `async-job-processing`: Queue-based processing
- `analytics-design`: Dashboard design patterns

**Agents to Use**:
- `report-template-designer`: Create professional templates
- `analytics-dashboard-architect`: Design dashboard layouts
- `workflow-automation-designer`: Design automation rules

**Success Criteria**:
- [ ] Reports generated in <30 seconds for standard size
- [ ] Dashboard loads in <2 seconds with cached data
- [ ] Client portal accessible with unique links
- [ ] Workflow automations execute within 1 minute
- [ ] Notifications delivered within 2 minutes

---

### Phase 5: Mobile & Advanced Features (2-3 months)

**Goals**:
- Mobile application for field inspectors
- Advanced integrations
- Performance optimization
- Polish and user feedback

**Deliverables**:
1. React Native mobile app (iOS + Android)
2. Offline-capable data collection
3. Photo capture with GPS tagging
4. Barcode/QR code scanning
5. Voice-to-text notes
6. REST API for third-party integrations
7. ERP integration hooks
8. Performance optimizations (CDN, caching, lazy loading)
9. Advanced analytics features
10. User feedback implementation

**Claude Code Skills Needed**:
- `mobile-development`: React Native patterns
- `offline-sync`: Offline-first architecture
- `api-integration`: External system integration
- `performance-optimization`: Caching, CDN, lazy loading

**Agents to Use**:
- `mobile-architect`: Design mobile app architecture
- `performance-optimizer`: Identify and fix bottlenecks
- `integration-specialist`: Design API integration patterns

**Success Criteria**:
- [ ] Mobile app works offline with sync queue
- [ ] Photos uploaded with geolocation
- [ ] Barcode scanning identifies assets
- [ ] API integration with at least one ERP system
- [ ] Page load time < 1 second (cached)
- [ ] Lighthouse score > 90

---

## Skills Configuration for Claude Code

### Required Skills to Create

**1. backend-dev-guidelines**
```markdown
# Backend Development Guidelines

## Architecture Pattern
Routes → Controllers → Services → Repositories

## Code Organization
- `routes/`: Express route definitions
- `controllers/`: Request/response handling
- `services/`: Business logic
- `repositories/`: Database access layer
- `middleware/`: Express middleware
- `utils/`: Helper functions

## Error Handling
- All errors captured to Sentry
- Use standardized error classes
- Controllers extend BaseController
- Services throw domain-specific errors

## Testing
- Unit tests for services and repositories
- Integration tests for controllers
- E2E tests for critical paths
- Minimum 80% coverage

## Resources
- routing-patterns.md
- controller-patterns.md
- service-layer-design.md
- repository-pattern.md
- error-handling.md
- testing-strategies.md
```

**2. frontend-dev-guidelines**
```markdown
# Frontend Development Guidelines

## Tech Stack
- React 19 with TypeScript
- TanStack Router (file-based routing)
- TanStack Query (server state)
- Zustand (client state if needed)
- MUI v7 (component library)

## Component Structure
- Functional components with hooks
- Typed props with TypeScript
- Colocation of styles and logic
- Atomic design principles

## State Management
- Server state: TanStack Query
- Client state: Zustand or useState
- Form state: React Hook Form
- Never mix server and client state

## Performance
- Lazy load routes
- Memoize expensive computations
- Virtual scrolling for large lists
- Image optimization

## Resources
- component-patterns.md
- state-management.md
- routing-patterns.md
- performance-optimization.md
- testing-components.md
```

**3. ndt-domain-knowledge**
```markdown
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

## Compliance Standards
- ASME Section V
- AWS D1.1
- API 570, 653, 510

## Key Calculations
- TOFD coverage and dead zones
- UT beam angles and path
- NII coverage calculations

## Resources
- inspection-methods.md
- certification-requirements.md
- acceptance-criteria.md
- calculation-formulas.md
```

**4. database-design**
```markdown
# Database Design Guidelines

## Principles
- Multi-tenancy with organization_id
- Soft deletes with deleted_at
- Audit trail on all tables
- 3NF for transactional, denormalize for reports

## Naming Conventions
- Tables: plural, lowercase, underscores (users, work_orders)
- Columns: snake_case
- Foreign keys: {table}_id (user_id, project_id)
- Indexes: idx_{table}_{column}

## Performance
- Index foreign keys
- Index query filter columns
- Use partial indexes for status checks
- Full-text search with GIN indexes

## Resources
- schema-patterns.md
- indexing-strategies.md
- migration-best-practices.md
```

**5. api-design**
```markdown
# API Design Guidelines

## RESTful Principles
- Resource-based URLs
- HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Proper status codes
- Pagination for collections

## Request/Response Format
- JSON content type
- camelCase for API, snake_case for database
- Consistent error format
- Include request ID for tracing

## Security
- JWT authentication
- Rate limiting
- Input validation
- SQL injection prevention

## Resources
- rest-api-patterns.md
- authentication-flow.md
- error-handling.md
- pagination-filtering.md
```

### skill-rules.json Configuration
```json
{
  "backend-dev-guidelines": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["backend", "controller", "service", "API", "endpoint", "route"],
      "intentPatterns": [
        "(create|add|build).*?(route|endpoint|controller|service)",
        "(how to|best practice).*?(backend|API)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": [
        "backend/**/*.ts",
        "services/**/*.ts"
      ],
      "contentPatterns": ["router\\.", "export.*Controller", "export.*Service"]
    }
  },
  "frontend-dev-guidelines": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["frontend", "react", "component", "hook", "UI"],
      "intentPatterns": [
        "(create|build).*?(component|page|feature)",
        "(how to|best practice).*?(react|frontend)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": [
        "frontend/src/**/*.tsx",
        "frontend/src/**/*.ts"
      ],
      "contentPatterns": ["import.*React", "export.*Component", "useState"]
    }
  },
  "ndt-domain-knowledge": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": ["NDT", "inspection", "TOFD", "ultrasonic", "RT", "UT", "certification", "ASME", "AWS"],
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
      "keywords": ["schema", "migration", "database", "table", "index", "query"],
      "intentPatterns": [
        "(create|design).*?(schema|table|migration)",
        "(optimize|improve).*?(query|database)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": [
        "prisma/**/*.prisma",
        "migrations/**/*.sql"
      ]
    }
  }
}
```

---

## Agents Configuration

### Essential Agents for This Project

**1. strategic-plan-architect**
- Use for breaking down each phase into weekly tasks
- Creates structured plans with dependencies
- Identifies risks and blockers

**2. database-schema-designer**
- Designs normalized schemas
- Creates migration scripts
- Optimizes indexes
- Reviews for performance

**3. api-architect**
- Designs RESTful endpoints
- Creates OpenAPI specifications
- Plans authentication flow
- Reviews API consistency

**4. code-architecture-reviewer**
- Reviews code for pattern adherence
- Checks for security issues
- Validates error handling
- Ensures test coverage

**5. frontend-ux-designer**
- Designs user interfaces
- Creates component hierarchy
- Plans user flows
- Reviews accessibility

**6. migration-specialist**
- Designs data migration strategy
- Creates migration scripts
- Plans rollback procedures
- Validates data integrity

**7. compliance-validator**
- Reviews against NDT standards
- Validates certification requirements
- Checks QMS compliance
- Reviews audit trail implementation

---

## Claude Code Hooks Required

### Essential Hooks to Implement

**1. skill-activation-prompt** (UserPromptSubmit)
```typescript
// Automatically activates relevant skills based on:
// - Keywords in prompt
// - Files being edited
// - Project context
```

**2. post-tool-use-tracker** (PostToolUse)
```typescript
// Tracks all file edits
// Logs which services modified
// Feeds into build checker
```

**3. typescript-checker** (Stop)
```typescript
// Runs tsc --noEmit on modified services
// Reports compilation errors
// Blocks if > 5 errors
```

**4. prettier-formatter** (Stop)
```typescript
// Auto-formats edited files
// Uses project .prettierrc
// Maintains consistent style
```

**5. test-runner** (Stop)
```typescript
// Runs tests for modified modules
// Reports failures immediately
// Enforces coverage thresholds
```

**6. error-handling-reminder** (Stop)
```typescript
// Checks for try-catch blocks
// Validates error logging
// Reminds about Sentry capture
```

---

## Success Metrics & KPIs

### Project Delivery Metrics
- On-time delivery: >95% of milestones
- Budget variance: <10%
- Code quality: >80% test coverage
- Bug density: <5 bugs per 1000 LOC

### System Performance Metrics
- API response time: <200ms (p95)
- Page load time: <1s (cached), <3s (cold)
- Database query time: <50ms (p95)
- Uptime: >99.5%

### User Adoption Metrics
- User onboarding completion: >90%
- Feature adoption: >70% within 3 months
- User satisfaction: >4.5/5
- Support ticket reduction: >50% vs old system

### Code Quality Metrics
- Test coverage: >80%
- TypeScript strict mode: 100%
- Linting errors: 0
- Security vulnerabilities: 0 (high/critical)

---

## Risk Mitigation Strategies

### Technical Risks

**1. Supabase Scaling Limitations**
- Mitigation: Design with database abstraction layer
- Fallback: Migration path to AWS RDS documented
- Monitoring: Track connection pool usage, query performance

**2. Data Migration Complexity**
- Mitigation: Parallel systems during transition period
- Fallback: Rollback scripts for each migration
- Testing: Test migrations on production data copy

**3. Real-time Sync Complexity**
- Mitigation: Queue-based sync with retry logic
- Fallback: Batch sync option if real-time fails
- Monitoring: Track sync failures and latency

### Business Risks

**1. Feature Scope Creep**
- Mitigation: Strict phase gates, each module complete before next
- Escalation: Weekly steering committee review

**2. User Adoption Challenges**
- Mitigation: Involve actual NDT technicians in design phase
- Training: Comprehensive training program before rollout
- Support: Dedicated support team for first 3 months

**3. Compliance Gaps**
- Mitigation: Compliance expert review each phase
- Validation: Third-party audit before production

---

## Definition of Done (DoD)

For each feature/module to be considered complete:

### Code Quality
- [ ] Code follows style guide (Prettier, ESLint)
- [ ] TypeScript strict mode enabled, no errors
- [ ] No console.logs or debug code
- [ ] Proper error handling with monitoring integration
- [ ] All functions have JSDoc comments
- [ ] Complex logic has inline comments

### Testing
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests for critical paths
- [ ] E2E tests for user workflows
- [ ] Manual testing completed
- [ ] Performance testing completed
- [ ] Security testing completed

### Documentation
- [ ] API endpoints documented in Swagger
- [ ] README updated for new features
- [ ] User documentation written
- [ ] Technical documentation updated
- [ ] Migration guide if breaking changes

### Review
- [ ] Code review completed by 2+ reviewers
- [ ] Architecture review by lead architect
- [ ] Security review by security lead
- [ ] Compliance review if QMS-related
- [ ] UX review by design lead

### Deployment
- [ ] Merged to main branch
- [ ] Deployed to staging environment
- [ ] Staging tests passed
- [ ] Production deployment completed
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

---

## Next Steps for Claude Code

### Immediate Actions

1. **Read This Plan**: Use `/dev-docs` to absorb this strategic plan

2. **Create Dev Docs Structure**:
```bash
mkdir -p dev/active/ndt-suite-rebuild
cp strategic-plan.md dev/active/ndt-suite-rebuild/plan.md
# Create context.md and tasks.md
```

3. **Set Up Skills**:
```bash
mkdir -p .claude/skills/{backend-dev-guidelines,frontend-dev-guidelines,ndt-domain-knowledge,database-design,api-design}
# Create SKILL.md and resources/ for each
```

4. **Configure Hooks**:
```bash
mkdir -p .claude/hooks
# Copy skill-activation-prompt and post-tool-use-tracker
# Create skill-rules.json
```

5. **Initialize Agents**:
```bash
mkdir -p .claude/agents
# Create agent definitions for all 7 agents listed above
```

6. **Phase 1 Kickoff**:
- Use `strategic-plan-architect` agent to break down Phase 1 into detailed weekly tasks
- Create tasks.md with all Phase 1 tasks
- Start with project setup and tooling

7. **Continuous Process**:
- Update context.md after each session
- Mark tasks complete in tasks.md immediately
- Run `/dev-docs-update` before context resets
- Use code-architecture-reviewer after each major feature
- Run build checks and tests via hooks

---

## Critical Reminders for Claude Code

1. **NEVER skip planning** - Use planning mode or strategic-plan-architect for every feature
2. **ALWAYS read dev docs** before continuing work - plan.md, context.md, tasks.md
3. **IMPLEMENT incrementally** - 1-2 sections at a time, review, continue
4. **USE skills** - They auto-activate, but reference them explicitly when needed
5. **REVIEW constantly** - Self-review and agent review before marking complete
6. **ZERO errors policy** - Hooks enforce, but manually check if needed
7. **UPDATE dev docs continuously** - Not just at end of session
8. **TEST comprehensively** - Unit, integration, E2E before done
9. **DOCUMENT thoroughly** - Code comments, API docs, user docs
10. **COMPLIANCE first** - Review against NDT standards at every step

---

## Conclusion

This plan provides a complete roadmap for transforming NDT-SUITE-UMBER from a basic tool suite into an enterprise-grade project and quality management platform. Success depends on:

1. **Disciplined execution** of the phase plan
2. **Continuous quality** through hooks and reviews
3. **User involvement** in design and testing
4. **Standards compliance** at every step
5. **Incremental delivery** with phase gates

The system described in the Reddit post (skills, hooks, agents, dev docs) is designed for exactly this type of complex, long-term project. Follow the workflow rigorously, and the result will be a production-ready, scalable, compliant NDT management platform.

**Estimated Timeline**: 12-14 months  
**Estimated Effort**: 2-3 full-time developers (or 1 developer with Claude Code)  
**Estimated Cost**: $150k-$200k (traditional) vs $50k-$75k (with Claude Code)

---

**Last Updated**: 2025-11-08  
**Next Review**: After Phase 1 Week 2  
**Document Owner**: Project Lead  
**Status**: APPROVED - Ready for Implementation
