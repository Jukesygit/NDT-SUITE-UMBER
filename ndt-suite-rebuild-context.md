# NDT-SUITE-UMBER Rebuild - Context Document

**Project**: Enterprise-Grade NDT Suite Rebuild  
**Last Updated**: 2025-11-08  
**Context Window**: Full project scope

---

## Current System Analysis

### Existing Codebase Structure
```
NDT-SUITE-UMBER/
├── src/
│   ├── components/          # Reusable UI components
│   ├── styles/              # CSS stylesheets
│   ├── tools/               # Individual NDT tool modules
│   │   ├── tofd-calculator/
│   │   ├── cscan-visualizer/
│   │   ├── pec-visualizer/
│   │   ├── 3d-viewer/
│   │   └── nii-coverage-calculator/
│   ├── main.js              # Vanilla JS entry point
│   ├── auth-manager.js      # Basic auth logic
│   ├── data-manager.js      # Local storage management
│   └── sync-service.js      # Supabase cloud sync
├── database/                # SQL schema files
├── docs/                    # Documentation
└── public/                  # Static assets
```

### What We're Preserving
1. **NDT Calculation Engines**:
   - TOFD coverage and dead zone calculations (complex physics)
   - NII coverage calculations
   - All mathematical formulas and algorithms
   - These are domain-specific and battle-tested

2. **Data Structures**:
   - Asset hierarchy concepts
   - Inspection data format
   - Report structure
   - These map well to new schema

3. **Domain Knowledge**:
   - NDT method specifics
   - Industry terminology
   - Acceptance criteria logic
   - User workflows

### What We're Replacing
1. **Technology Stack**:
   - Vanilla JS → React 19 + TypeScript
   - Manual component system → MUI component library
   - Basic auth → JWT with RBAC
   - Local storage → PostgreSQL with Supabase

2. **Architecture**:
   - Monolithic → Microservices
   - Client-heavy → API-driven architecture
   - No testing → Comprehensive test coverage
   - Manual deployment → CI/CD pipeline

---

## Critical Architectural Decisions

### Decision 1: Monorepo vs Polyrepo
**Decision**: Monorepo with Turborepo  
**Rationale**:
- Shared TypeScript types between frontend/backend
- Atomic commits across services
- Simplified dependency management
- Better developer experience
**Alternatives Considered**: Polyrepo (rejected: coordination overhead)

### Decision 2: Database Hosting
**Decision**: Continue with Supabase (PostgreSQL)  
**Rationale**:
- Already integrated and working
- Real-time subscriptions for collaborative features
- Built-in auth and storage
- Cost-effective for MVP/early stage
- Migration path to RDS if needed
**Risk Mitigation**: Design with database abstraction layer (Prisma)

### Decision 3: Authentication Strategy
**Decision**: JWT with refresh tokens + Supabase Auth  
**Rationale**:
- Stateless authentication scales horizontally
- Refresh tokens for security (short-lived access tokens)
- Supabase Auth provides social login, MFA out of box
- Industry standard, well-understood
**Implementation**: 15-minute access tokens, 7-day refresh tokens

### Decision 4: API Architecture
**Decision**: RESTful with API Gateway pattern  
**Rationale**:
- REST is well-understood by developers
- API Gateway provides centralized auth, rate limiting, routing
- Easier to integrate with third-party systems
- GraphQL considered but overkill for this domain
**Alternative Considered**: GraphQL (rejected: added complexity for minimal benefit)

### Decision 5: State Management
**Decision**: TanStack Query for server state, Zustand for client state  
**Rationale**:
- TanStack Query handles caching, invalidation, optimistic updates
- Zustand lightweight for UI state (modals, filters, etc.)
- Avoid Redux complexity
- Server state should NEVER be in client store
**Pattern**: Server data → TanStack Query, UI state → Zustand

### Decision 6: Testing Strategy
**Decision**: Vitest + React Testing Library + Playwright  
**Rationale**:
- Vitest: Fast, ESM-native, great DX
- RTL: User-centric testing, recommended by React team
- Playwright: E2E testing, cross-browser support
- Target: 80% coverage minimum, 100% for critical paths

### Decision 7: Report Generation
**Decision**: Async job queue with Puppeteer for PDF generation  
**Rationale**:
- Reports can be large (100+ pages with images)
- Don't block API requests during generation
- Queue allows retry logic and progress tracking
- Puppeteer generates pixel-perfect PDFs from HTML templates
**Implementation**: BullMQ queue, Redis for job storage

### Decision 8: File Storage
**Decision**: Supabase Storage (S3-compatible)  
**Rationale**:
- Integrated with Supabase ecosystem
- Presigned URLs for secure access
- CDN integration for fast delivery
- Migration path to AWS S3 if needed
**Use Cases**: Certificates, calibration documents, photos, generated reports

### Decision 9: Multi-tenancy Strategy
**Decision**: Shared database with organization_id row-level isolation  
**Rationale**:
- Simpler to manage than database-per-tenant
- Row-Level Security (RLS) in PostgreSQL provides strong isolation
- Cost-effective
- Can migrate to dedicated databases for enterprise clients later
**Security**: RLS policies enforce organization_id on all queries

### Decision 10: Mobile Strategy
**Decision**: React Native (Phase 5)  
**Rationale**:
- Share code/logic with web app (React knowledge reusable)
- Single codebase for iOS + Android
- Good offline capabilities with local storage
- Native performance for camera, GPS, barcode scanning
**Alternative Considered**: Progressive Web App (insufficient for offline scenarios)

---

## Integration Points

### Current Integrations
1. **Supabase**:
   - Database: PostgreSQL
   - Auth: User authentication
   - Storage: File uploads
   - Realtime: Subscriptions (minimal use currently)

### Planned Integrations (Future)
1. **Email Service**: SendGrid or AWS SES for notifications
2. **SMS Service**: Twilio for critical alerts
3. **Calendar**: Google Calendar / Outlook for scheduling
4. **Storage**: Google Drive / Dropbox for document sharing
5. **ERP Systems**: SAP, Oracle (enterprise clients)
6. **Monitoring**: Sentry for error tracking, DataDog for APM

---

## Data Migration Strategy

### Migration Challenges
1. **Schema Changes**:
   - Old: Loose schema, flexible JSON fields
   - New: Strict schema with relationships
   - Challenge: Map old data to new structure

2. **Data Volume**:
   - Estimate: 10k+ inspections, 5k+ assets
   - Time: 30-60 minutes for full migration
   - Risk: Downtime during migration

3. **Data Quality**:
   - Inconsistent formats in old system
   - Missing fields
   - Duplicate records

### Migration Approach

**Phase 1: Analysis & Mapping**
```javascript
// Analyze old data structure
const oldSchema = analyzeExistingData();
const mapping = createMigrationMapping(oldSchema, newSchema);
```

**Phase 2: Test Migration**
```bash
# Create copy of production database
# Run migration script
# Validate data integrity
# Benchmark performance
```

**Phase 3: Production Migration**
```bash
# Step 1: Enable read-only mode on old system
# Step 2: Take database snapshot
# Step 3: Run migration (30-60 min)
# Step 4: Validate migration
# Step 5: Enable new system
# Step 6: Keep old system available for 30 days (read-only)
```

**Rollback Plan**:
- If migration fails, restore from snapshot
- Revert to old system
- Analyze failures, fix scripts, retry

### Migration Scripts to Create
```
database/migrations/
├── 01-create-new-schema.sql
├── 02-migrate-organizations.sql
├── 03-migrate-users.sql
├── 04-migrate-assets.sql
├── 05-migrate-inspections.sql
├── 06-migrate-reports.sql
├── 07-create-indexes.sql
├── 08-validate-migration.sql
└── 09-cleanup-temp-tables.sql
```

---

## Performance Considerations

### Database Performance
1. **Indexing Strategy**:
   - Index all foreign keys
   - Index columns used in WHERE clauses (status, dates)
   - Partial indexes for specific queries
   - Full-text search indexes for assets, procedures

2. **Query Optimization**:
   - Use connection pooling (Prisma default: 10 connections)
   - Avoid N+1 queries (use Prisma `include` or raw SQL joins)
   - Pagination for all list endpoints (limit 100)
   - Use database views for complex reports

3. **Caching Strategy**:
   - Redis for session storage (5-minute TTL)
   - Redis for frequently accessed data (user profiles, org settings)
   - API response caching for static data (procedures, equipment specs)

### Frontend Performance
1. **Bundle Optimization**:
   - Code splitting by route
   - Lazy load heavy components (3D viewer, visualizers)
   - Tree-shaking to remove unused code
   - Target: <500KB initial bundle

2. **Rendering Optimization**:
   - Virtual scrolling for large lists (TanStack Virtual)
   - Memoization for expensive calculations
   - Debounce search inputs
   - Skeleton loaders for perceived performance

3. **Image Optimization**:
   - WebP format with fallback
   - Responsive images with srcset
   - Lazy loading below-the-fold images
   - CDN delivery

---

## Security Considerations

### Authentication & Authorization
1. **JWT Security**:
   - Short-lived access tokens (15 min)
   - Refresh tokens stored httpOnly cookies
   - Rotate refresh tokens on use
   - Revocation list in Redis

2. **RBAC Implementation**:
```typescript
enum Role {
  ADMIN = 'admin',         // Full access
  MANAGER = 'manager',     // Manage projects, users
  INSPECTOR = 'inspector', // Create/edit inspections
  VIEWER = 'viewer'        // Read-only access
}

// Permission matrix stored in database
// Check permissions on every API request
```

3. **Row-Level Security**:
```sql
-- PostgreSQL RLS policies
CREATE POLICY org_isolation ON projects
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

### Data Protection
1. **Encryption**:
   - In-transit: HTTPS/TLS 1.3
   - At-rest: Database encryption enabled
   - Sensitive fields: Additional encryption (AES-256)

2. **Input Validation**:
   - All inputs validated with Zod schemas
   - SQL injection prevention (Prisma parameterized queries)
   - XSS prevention (React auto-escapes, DOMPurify for rich text)
   - CSRF tokens on state-changing operations

3. **Audit Logging**:
   - Log all authentication attempts
   - Log all data modifications (who, what, when)
   - Log permission checks and failures
   - Retain logs for 90 days minimum

---

## Compliance Requirements

### ASNT SNT-TC-1A (Certification Standard)
- Track certification levels (I, II, III)
- Track expiration dates
- Store certification documents
- Automated expiration notifications
- Qualification test records

### ISO 9712 (Personnel Certification)
- Similar to SNT-TC-1A
- Additional training hour requirements
- Continuing professional development (CPD) tracking

### ASME Section V (NDT Methods)
- Procedure qualification records (PQR)
- Written practice requirements
- Equipment calibration records
- Personnel qualification requirements

### ISO 9001 (Quality Management)
- Document control with version history
- Non-conformance tracking
- Corrective action tracking
- Internal audit records
- Management review records

### Data Protection (GDPR, CCPA)
- User data export capability
- Right to deletion
- Consent management
- Privacy policy and terms

---

## Key File Locations

### Current System
```
NDT-SUITE-UMBER/
├── src/tools/tofd-calculator/calculator.js   # TOFD calculation logic
├── src/tools/cscan-visualizer/renderer.js    # C-Scan rendering
├── src/auth-manager.js                       # Current auth logic
├── database/schema.sql                       # Current schema
└── docs/                                     # Existing documentation
```

### New System Structure
```
ndt-suite-v2/                    # New monorepo root
├── apps/
│   ├── web/                     # React frontend
│   └── mobile/                  # React Native app (Phase 5)
├── packages/
│   ├── shared-types/            # Shared TypeScript types
│   ├── ndt-calculations/        # Calculation engine library
│   └── ui-components/           # Shared components
├── services/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── project-service/
│   ├── personnel-service/
│   ├── quality-service/
│   ├── equipment-service/
│   ├── client-service/
│   ├── notification-service/
│   └── report-service/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── .claude/
    ├── skills/
    ├── hooks/
    ├── agents/
    └── commands/
```

---

## Known Issues & Workarounds

### Issue 1: Supabase Connection Pool Limits
**Problem**: Free tier has 10 connection limit  
**Workaround**: Use connection pooling, close connections promptly  
**Long-term**: Upgrade to paid tier or migrate to dedicated PostgreSQL

### Issue 2: Large Report Generation Memory
**Problem**: Generating 100+ page reports consumes significant memory  
**Workaround**: Use streaming, generate in chunks, offload to worker process  
**Long-term**: Dedicated report generation service

### Issue 3: Real-time Sync Conflicts
**Problem**: Offline edits can conflict with online changes  
**Workaround**: Last-write-wins strategy with conflict notification  
**Long-term**: Implement CRDT-based conflict resolution

---

## Development Environment Setup

### Required Tools
```bash
# Node.js 20.x (LTS)
nvm install 20
nvm use 20

# Package manager
npm install -g pnpm

# Claude Code
npm install -g @anthropic-ai/claude-code

# Database tools
npm install -g @prisma/cli

# Testing tools
npm install -g playwright
```

### Environment Variables
```bash
# .env.local
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://..."
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
REDIS_URL="..."
SENTRY_DSN="..."
```

---

## Testing Strategy

### Test Pyramid
```
        E2E (5%)           ← Playwright
       /        \
    Integration (15%)     ← Vitest + Supertest
   /              \
  Unit Tests (80%)        ← Vitest
```

### Coverage Requirements
- **Overall**: 80% minimum
- **Critical Paths**: 100% (auth, calculations, data migrations)
- **Services**: 90% (business logic)
- **Controllers**: 80% (request handling)
- **Utilities**: 90% (helper functions)

### Test Categories
1. **Unit Tests**: Pure functions, business logic
2. **Integration Tests**: API endpoints, database operations
3. **E2E Tests**: Critical user journeys
4. **Visual Regression**: UI component screenshots
5. **Performance Tests**: API latency, load testing
6. **Security Tests**: OWASP Top 10 checks

---

## Monitoring & Observability

### Application Monitoring
1. **Error Tracking**: Sentry for exception monitoring
2. **APM**: DataDog or New Relic for performance monitoring
3. **Logging**: Structured JSON logs with correlation IDs
4. **Metrics**: Prometheus + Grafana for custom metrics

### Key Metrics to Track
```
API Performance:
- Response time (p50, p95, p99)
- Requests per second
- Error rate

Database:
- Query latency
- Connection pool usage
- Slow query log

Business Metrics:
- Active users (DAU, MAU)
- Inspections created per day
- Reports generated per day
- Average session duration
```

---

## Deployment Strategy

### Environments
1. **Local**: Developer machines
2. **Development**: Feature branches, auto-deployed
3. **Staging**: Pre-production, mirrors production config
4. **Production**: Live system

### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
on: [push]
jobs:
  test:
    - Lint
    - Type check
    - Unit tests
    - Integration tests
  
  build:
    - Build frontend
    - Build services
    - Build Docker images
  
  deploy:
    - Deploy to staging (on main)
    - Run smoke tests
    - Deploy to production (on release tag)
```

### Rollback Strategy
1. Keep previous 3 releases deployed
2. Blue-green deployment for zero-downtime
3. Feature flags for gradual rollout
4. Database migrations reversible

---

## Questions & Open Items

### Technical Questions
1. Should we implement GraphQL subscriptions for real-time updates, or stick with WebSocket + REST?
   - **Decision Needed**: Week 3 of Phase 1
   - **Owner**: Lead Architect

2. How do we handle timezone differences for international users?
   - **Decision**: Store all timestamps in UTC, display in user's timezone
   - **Status**: DECIDED

3. What's the max file size for report attachments?
   - **Decision Needed**: Phase 4
   - **Considerations**: Storage cost vs user needs

### Business Questions
1. What's the pricing model for multi-tenant SaaS?
   - **Status**: Out of scope for initial build
   - **Note**: Design for multiple tiers (free, pro, enterprise)

2. Which compliance certifications are must-haves vs nice-to-haves?
   - **Must-Have**: ASNT SNT-TC-1A, ISO 9712
   - **Nice-to-Have**: ISO 27001, SOC 2

---

## Team & Responsibilities

### Development Team
- **Lead Developer**: Full-stack, architecture decisions
- **Claude Code**: Implementation, following guidelines
- **Code Reviewers**: 2+ human reviewers per PR
- **QA**: Manual testing, UAT coordination

### Stakeholders
- **Product Owner**: Feature prioritization
- **Domain Expert**: NDT standards compliance
- **End Users**: Feedback, UAT participation

---

## Communication Plan

### Status Updates
- **Daily**: Update dev docs (context.md, tasks.md)
- **Weekly**: Phase progress review
- **Monthly**: Stakeholder demo

### Documentation
- **Technical**: Keep current in /docs
- **User**: Create in-app help system
- **API**: OpenAPI/Swagger, auto-generated

---

## Success Criteria

### Phase 1 Success
- [ ] All old data migrated successfully
- [ ] Users can authenticate and access system
- [ ] Basic project and work order CRUD functional
- [ ] Zero critical bugs
- [ ] API performance <200ms (p95)

### Overall Project Success
- [ ] All 5 phases delivered on time
- [ ] 80%+ test coverage maintained
- [ ] User satisfaction >4.5/5
- [ ] Zero high/critical security vulnerabilities
- [ ] Compliant with all required standards
- [ ] System handles 1000+ concurrent users
- [ ] Support ticket volume reduced 50% vs old system

---

**Last Updated**: 2025-11-08  
**Next Update**: After Phase 1 Week 2  
**Document Status**: LIVING DOCUMENT - Update continuously
