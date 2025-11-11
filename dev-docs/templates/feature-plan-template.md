# Feature: [Feature Name]

> **Created**: [Date]
> **Status**: [Planning / In Progress / Completed]
> **Estimated Time**: [X hours/days]

---

## Objective

[Clear, concise statement of what this feature aims to accomplish]

**Success Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

---

## Background

### Current State
[Describe how things currently work, or what's missing]

### Desired State
[Describe how things should work after this feature]

### User Story
As a [user role], I want to [do something], so that [achieve goal].

---

## Approach

### High-Level Strategy
[Brief overview of the implementation approach]

### Architecture Changes
[Any changes to overall architecture, data flow, or component structure]

### Technology/Libraries Used
- [Library 1] - [Purpose]
- [Library 2] - [Purpose]

---

## Implementation Steps

### Phase 1: Foundation
1. [ ] [Step 1.1]
2. [ ] [Step 1.2]
3. [ ] [Step 1.3]

### Phase 2: Core Implementation
1. [ ] [Step 2.1]
2. [ ] [Step 2.2]
3. [ ] [Step 2.3]

### Phase 3: Polish & Testing
1. [ ] [Step 3.1]
2. [ ] [Step 3.2]
3. [ ] [Step 3.3]

---

## Database Changes

### New Tables
```sql
-- Table creation SQL
CREATE TABLE IF NOT EXISTS table_name (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- columns
);
```

### Schema Modifications
```sql
-- Alterations to existing tables
ALTER TABLE existing_table ADD COLUMN new_column TEXT;
```

### RLS Policies
```sql
-- Row Level Security policies
CREATE POLICY "policy_name"
    ON table_name
    FOR SELECT
    USING (auth.uid() = user_id);
```

---

## API/Data Layer Changes

### New Functions
- `functionName(params)` - [Description]

### Modified Functions
- `existingFunction()` - [What changed]

### Data Flow
```
User Action → Component → API Call → Supabase → RLS Check → Response → UI Update
```

---

## UI/UX Changes

### New Components
- `ComponentName` - [Purpose and location]

### Modified Components
- `ExistingComponent` - [What changed]

### Wireframes/Mockups
[Include sketches, screenshots, or descriptions]

---

## Testing Plan

### Unit Tests
- [ ] Test [specific functionality]
- [ ] Test [error handling]
- [ ] Test [edge case]

### Integration Tests
- [ ] Test [end-to-end flow]
- [ ] Test [data persistence]
- [ ] Test [authentication/authorization]

### Manual Testing Checklist
- [ ] Test as admin user
- [ ] Test as org_admin user
- [ ] Test as editor user
- [ ] Test as viewer user
- [ ] Test with no data
- [ ] Test with maximum data
- [ ] Test error states
- [ ] Test loading states
- [ ] Test on mobile
- [ ] Test on different browsers

---

## Security Considerations

### Authentication
- [ ] Requires authentication?
- [ ] Checks user role?
- [ ] Validates permissions?

### Data Validation
- [ ] Input validation on client
- [ ] Input validation on server (RLS)
- [ ] SQL injection prevention
- [ ] XSS prevention

### Sensitive Data
- [ ] Handles sensitive data? [Describe]
- [ ] Encryption required?
- [ ] Audit trail needed?

---

## Performance Considerations

### Optimization Strategies
- [Strategy 1]
- [Strategy 2]

### Expected Load
- Number of users: [X]
- Data volume: [Y]
- Query frequency: [Z]

### Caching Strategy
- [What will be cached]
- [Cache invalidation strategy]

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|-------------------|
| [Risk 1] | Low/Med/High | Low/Med/High | [How to mitigate] |
| [Risk 2] | Low/Med/High | Low/Med/High | [How to mitigate] |

---

## Dependencies

### External Dependencies
- Requires [external library/service]
- Depends on [other feature]

### Blockers
- [ ] [Blocker 1]
- [ ] [Blocker 2]

---

## Rollout Plan

### Deployment Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Rollback Plan
If something goes wrong:
1. [Rollback step 1]
2. [Rollback step 2]

### Communication
- [ ] Notify users about new feature
- [ ] Update documentation
- [ ] Train support team

---

## Monitoring & Metrics

### Success Metrics
- [Metric 1]: Target [X]
- [Metric 2]: Target [Y]

### What to Monitor
- Error rates
- Performance metrics
- User adoption

---

## Future Enhancements

Things we're not doing now but might consider later:
- [Enhancement 1]
- [Enhancement 2]

---

## Notes & Learnings

### Decisions Made
- [Decision 1]: [Rationale]
- [Decision 2]: [Rationale]

### Challenges Encountered
- [Challenge 1]: [How resolved]
- [Challenge 2]: [How resolved]

### Lessons Learned
- [Learning 1]
- [Learning 2]

---

## References

- [Link to design doc]
- [Link to related issue]
- [Link to API documentation]

---

**Last Updated**: [Date]
**Updated By**: [Name/Claude]
