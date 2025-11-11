# Feature Tasks: [Feature Name]

> **Purpose**: Track all tasks for this feature implementation
> **Status**: [Not Started / In Progress / Testing / Completed]
> **Progress**: [X/Y tasks completed]

---

## Quick Stats

- **Total Tasks**: [Y]
- **Completed**: [X]
- **In Progress**: [Z]
- **Blocked**: [B]
- **Estimated Time**: [Hours/Days]
- **Actual Time**: [Hours/Days]

---

## Phase 1: Planning & Setup

### Planning
- [ ] Read existing documentation
- [ ] Understand requirements
- [ ] Create feature plan document
- [ ] Create feature context document
- [ ] Get user approval on plan

### Database Setup
- [ ] Design database schema
- [ ] Write SQL migration script
- [ ] Create RLS policies
- [ ] Create database functions/triggers
- [ ] Test RLS policies with different roles
- [ ] Add indexes for performance
- [ ] Run migration in Supabase

### Environment Setup
- [ ] Add environment variables (if needed)
- [ ] Install new dependencies
- [ ] Configure build tools (if needed)

---

## Phase 2: Backend Implementation

### Data Layer
- [ ] Create Supabase client functions
  - [ ] `fetchRecords()` - Read data
  - [ ] `createRecord()` - Create data
  - [ ] `updateRecord()` - Update data
  - [ ] `deleteRecord()` - Delete data
- [ ] Add error handling
- [ ] Add validation
- [ ] Test with real data

### API Functions (if needed)
- [ ] Create Supabase function: `function_name_1`
- [ ] Create Supabase function: `function_name_2`
- [ ] Test functions with different inputs
- [ ] Add error handling to functions

### File Upload (if needed)
- [ ] Create storage bucket
- [ ] Set up storage policies
- [ ] Implement file upload function
- [ ] Implement file deletion function
- [ ] Add file validation (type, size)

---

## Phase 3: Frontend Implementation

### Components
- [ ] Create `ComponentName1.jsx`
  - [ ] Basic structure
  - [ ] Props interface
  - [ ] State management
  - [ ] Event handlers
  - [ ] Styling
- [ ] Create `ComponentName2.jsx`
  - [ ] Basic structure
  - [ ] Props interface
  - [ ] State management
  - [ ] Event handlers
  - [ ] Styling
- [ ] Create `ComponentName3.jsx`
  - [ ] Basic structure
  - [ ] Props interface
  - [ ] State management
  - [ ] Event handlers
  - [ ] Styling

### Pages (if new page)
- [ ] Create page file `PageName.jsx`
- [ ] Add route in `App.jsx`
- [ ] Add lazy loading
- [ ] Add error boundary
- [ ] Add to navigation menu

### Forms
- [ ] Create form component
- [ ] Add form fields
- [ ] Add client-side validation
- [ ] Add error messages
- [ ] Add loading states
- [ ] Add success feedback
- [ ] Test form submission

### Data Display
- [ ] Create table/list component
- [ ] Add sorting
- [ ] Add filtering
- [ ] Add search
- [ ] Add pagination
- [ ] Add empty state
- [ ] Add loading skeleton

---

## Phase 4: Integration

### Connect Components
- [ ] Wire up data fetching
- [ ] Connect event handlers
- [ ] Implement state management
- [ ] Add error handling
- [ ] Add loading states

### Authentication & Authorization
- [ ] Add login requirement (if needed)
- [ ] Add role-based access control
- [ ] Test with different user roles
  - [ ] Test as admin
  - [ ] Test as org_admin
  - [ ] Test as editor
  - [ ] Test as viewer

### Realtime (if needed)
- [ ] Set up realtime subscription
- [ ] Handle realtime events
- [ ] Update UI on changes
- [ ] Test with multiple clients

---

## Phase 5: Polish & UX

### UI Polish
- [ ] Add animations/transitions
- [ ] Add icons
- [ ] Ensure responsive design
  - [ ] Test on mobile
  - [ ] Test on tablet
  - [ ] Test on desktop
- [ ] Fix styling inconsistencies
- [ ] Add tooltips/help text
- [ ] Improve accessibility
  - [ ] Add ARIA labels
  - [ ] Test keyboard navigation
  - [ ] Test screen reader

### Error Handling
- [ ] Add error boundaries
- [ ] Add user-friendly error messages
- [ ] Add retry mechanisms
- [ ] Log errors appropriately

### Loading States
- [ ] Add loading spinners
- [ ] Add skeleton screens
- [ ] Add progress indicators
- [ ] Optimize perceived performance

---

## Phase 6: Testing

### Unit Tests
- [ ] Test validation functions
- [ ] Test helper utilities
- [ ] Test data transformations
- [ ] Test error handling

### Integration Tests
- [ ] Test full CRUD flow
- [ ] Test permission checks
- [ ] Test error scenarios
- [ ] Test with edge cases

### Manual Testing
- [ ] Test happy path
- [ ] Test error paths
- [ ] Test edge cases
  - [ ] Empty data
  - [ ] Maximum data
  - [ ] Invalid inputs
  - [ ] Expired session
- [ ] Test on different browsers
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Edge
- [ ] Test on different devices
  - [ ] Desktop
  - [ ] Tablet
  - [ ] Mobile
- [ ] Test role-based access
  - [ ] Admin can do X
  - [ ] Org admin can do Y
  - [ ] Editor can do Z
  - [ ] Viewer cannot do W

### Security Testing
- [ ] Test SQL injection prevention
- [ ] Test XSS prevention
- [ ] Test authentication bypass attempts
- [ ] Test authorization bypass attempts
- [ ] Test input validation
- [ ] Review RLS policies
- [ ] Check for exposed secrets

---

## Phase 7: Documentation

### Code Documentation
- [ ] Add JSDoc comments to functions
- [ ] Add inline comments for complex logic
- [ ] Document component props
- [ ] Document API functions

### User Documentation
- [ ] Update user guide (if exists)
- [ ] Create tutorial/walkthrough
- [ ] Add screenshots
- [ ] Document new features

### Developer Documentation
- [ ] Update PROJECT_KNOWLEDGE.md
- [ ] Update TROUBLESHOOTING.md (if needed)
- [ ] Document new patterns
- [ ] Add to architecture diagram

---

## Phase 8: Deployment

### Pre-deployment
- [ ] Run `/build-and-fix` - ensure build succeeds
- [ ] Run `/code-review` - code quality check
- [ ] Run `/review-security` - security audit
- [ ] Run all tests
- [ ] Check TypeScript compilation
- [ ] Check linting
- [ ] Check formatting

### Database Deployment
- [ ] Backup existing data
- [ ] Run migration script
- [ ] Verify migration success
- [ ] Test with production data

### Code Deployment
- [ ] Create pull request
- [ ] Get code review
- [ ] Address review comments
- [ ] Merge to main branch
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production
- [ ] Monitor for errors

### Post-deployment
- [ ] Verify feature works in production
- [ ] Monitor error logs
- [ ] Monitor performance metrics
- [ ] Gather user feedback

---

## Blockers & Issues

### Current Blockers
- [ ] Blocker 1: [Description]
  - **Reason**: [Why blocked]
  - **Resolution**: [How to unblock]
  - **Status**: [Open/Resolved]

### Known Issues
- [ ] Issue 1: [Description]
  - **Impact**: [Low/Medium/High]
  - **Workaround**: [If available]
  - **Resolution**: [Plan to fix]

---

## Questions & Decisions

### Outstanding Questions
- [ ] Question 1: [Question]
  - **Asked**: [Date]
  - **Answered**: [Date / Pending]
  - **Answer**: [Answer]

### Key Decisions Made
- **Decision 1**: [What was decided]
  - **Date**: [Date]
  - **Rationale**: [Why]
  - **Alternatives considered**: [Options]

---

## Time Tracking

### Time Estimates
| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Phase 1: Planning | 2h | - | |
| Phase 2: Backend | 4h | - | |
| Phase 3: Frontend | 6h | - | |
| Phase 4: Integration | 2h | - | |
| Phase 5: Polish | 3h | - | |
| Phase 6: Testing | 4h | - | |
| Phase 7: Documentation | 2h | - | |
| Phase 8: Deployment | 1h | - | |
| **Total** | **24h** | - | |

### Time Log
- [Date]: [X hours] - [What was accomplished]
- [Date]: [Y hours] - [What was accomplished]

---

## Notes

### Lessons Learned
- [Learning 1]
- [Learning 2]

### Things to Remember
- [Note 1]
- [Note 2]

### Future Improvements
- [ ] Enhancement 1
- [ ] Enhancement 2

---

## Checklist Before Marking Complete

Final verification before closing this feature:

- [ ] All tasks completed
- [ ] All tests passing
- [ ] Build succeeds without warnings
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployed to production
- [ ] Feature verified in production
- [ ] No critical bugs reported
- [ ] User acceptance received

---

**Last Updated**: [Date]
**Task Owner**: [Name/Claude]
**Current Phase**: [Phase X]
