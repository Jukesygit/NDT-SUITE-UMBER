# Competency Comments Feature & Improvements

## Overview
This document outlines the new commenting feature for competency tracking, specifically designed to help manage expiring certifications and track renewal progress.

## Main Feature: Competency Comments

### Purpose
Enable team members and admins to leave comments on competencies, particularly useful for tracking:
- Renewal status of expiring certifications
- Documentation of why certifications are pending update
- Progress updates on renewal processes
- Communication between employees and admins

### Database Schema

A new `competency_comments` table has been created with the following features:

**Core Fields:**
- `employee_competency_id` - Links to the specific competency
- `comment_text` - The comment content
- `comment_type` - Categorizes the comment for better organization
- `is_pinned` - Allows important comments to stay at the top
- `created_by` - Tracks who wrote the comment

**Comment Types:**
1. `general` - General notes or observations
2. `expiry_update` - Updates about expiration dates
3. `renewal_in_progress` - Marks that renewal is actively being worked on
4. `renewal_completed` - Documents completion of renewal
5. `unable_to_renew` - Flags issues preventing renewal
6. `escalation` - Requires management attention

**Advanced Features:**
- `mentioned_users` - Tag users in comments for notifications (future feature)
- `attachments` - Store metadata about attached files (future feature)
- Full audit trail (created_at, updated_at)
- Row-Level Security (RLS) policies for data privacy

### API Methods Added

**In [competency-service.js](../src/services/competency-service.js):**

1. `getCompetencyComments(employeeCompetencyId)`
   - Retrieves all comments for a specific competency
   - Returns comments with author information
   - Sorted by pinned status, then by date

2. `addCompetencyComment(employeeCompetencyId, commentText, commentType, isPinned, mentionedUsers)`
   - Add a new comment to a competency
   - Automatically tracks who created it
   - Supports all comment types

3. `updateCompetencyComment(commentId, updates)`
   - Edit existing comments
   - Users can only edit their own comments (unless admin)

4. `deleteCompetencyComment(commentId)`
   - Remove a comment
   - Users can only delete their own comments (unless admin)

5. `pinCompetencyComment(commentId, isPinned)`
   - Pin/unpin important comments
   - Pinned comments appear first in the list

6. `getCompetenciesWithComments(userId, daysBack)`
   - Get all competencies that have recent comments
   - Useful for "Recent Activity" views
   - Shows comment count and latest comment

7. `getExpiringCompetencies(daysThreshold, includeComments)`
   - Enhanced version now supports comment data
   - Shows renewal status at a glance
   - Identifies which expiring certs are being actively worked on

### Database Functions

**`get_expiring_competencies_with_comments(days_threshold)`**
Returns expiring competencies with:
- Comment count
- Latest comment text and type
- Whether renewal is in progress (has `renewal_in_progress` comment)
- All standard expiring competency info

**`get_competencies_with_comments(p_user_id, p_days_back)`**
Returns competencies with recent comment activity:
- Total comment count
- Latest comment
- Whether any comments are pinned
- Useful for activity feeds

**`refresh_competency_comment_summary()`**
Refreshes a materialized view for performance optimization of comment counts.

### TypeScript Types

New types added to [database.types.ts](../src/types/database.types.ts):

```typescript
interface CompetencyComment { ... }
interface CompetencyCommentInsert { ... }
interface CompetencyCommentUpdate { ... }
interface EmployeeCompetencyWithComments { ... }
interface ExpiringCompetencyWithComments { ... }
```

### Security

Full Row-Level Security (RLS) implemented:
- Users can view comments on competencies they have access to
- Users can comment on their own competencies
- Admins and org_admins can comment on competencies in their organization
- Users can only edit/delete their own comments (admins can edit all)
- Same permission model as the underlying competency system

---

## Additional Suggested Improvements

### 1. Email Notifications for Expiring Competencies

**Why:** Proactive alerts prevent certifications from expiring unexpectedly.

**Implementation:**
- Create scheduled job (daily or weekly)
- Call `get_expiring_competencies_with_comments(30)`
- Send email to users with certifications expiring in 30 days
- Include renewal status from comments
- Escalate to admins for certifications expiring in 7 days without renewal progress

**Database Addition:**
```sql
-- Add notification preferences to profiles
ALTER TABLE profiles ADD COLUMN
  notification_preferences JSONB DEFAULT '{"expiring_competencies": true}'::jsonb;

-- Track sent notifications to avoid duplicates
CREATE TABLE competency_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  employee_competency_id UUID REFERENCES employee_competencies(id),
  notification_type TEXT, -- 'expiring_30', 'expiring_7', 'expired'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Competency Reminders & Tasks

**Why:** Convert expiring competencies into actionable tasks.

**Features:**
- Auto-create tasks/reminders when competency expires in X days
- Assign tasks to specific users (employee or admin)
- Track task completion
- Link tasks to comments for context

**Database Addition:**
```sql
CREATE TABLE competency_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_competency_id UUID REFERENCES employee_competencies(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### 3. Competency Dashboard/Overview

**Why:** Centralized view of competency health across the organization.

**Features:**
- Total competencies tracked
- Expiring soon count (7, 30, 90 days)
- Renewal in progress count
- Expired certifications requiring attention
- Filter by user, category, or organization
- Export functionality

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│  Competency Dashboard                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [📊 Active: 1,247]  [⚠️ Expiring: 43]  [❌ Expired: 5] │
│                                                          │
│  Expiring Soon:                                         │
│  ┌──────────────────────────────────────────┐          │
│  │ OPITO BOSIET - John Smith - 5 days       │ 🔄       │
│  │ "Renewal course booked for next week"    │          │
│  ├──────────────────────────────────────────┤          │
│  │ NDT Level 2 PAUT - Jane Doe - 12 days    │ ⚠️       │
│  │ No comments                               │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

### 4. Bulk Renewal Operations

**Why:** Efficiently manage multiple expiring competencies.

**Features:**
- Select multiple expiring competencies
- Bulk add "renewal in progress" comments
- Bulk extend expiry dates
- Bulk upload new certificates
- Assign bulk renewal tasks

**Service Methods:**
```javascript
async bulkUpdateCompetencies(competencyIds, updates) { ... }
async bulkAddComments(competencyIds, commentText, commentType) { ... }
async bulkExtendExpiry(competencyIds, newExpiryDate) { ... }
```

### 5. Competency Templates/Groups

**Why:** Many certifications expire together or are related.

**Features:**
- Group related competencies (e.g., "Offshore Package", "Rope Access Suite")
- Apply updates to entire groups
- Track group expiry status
- Template competency sets for new hires

**Database Addition:**
```sql
CREATE TABLE competency_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  competency_ids UUID[] NOT NULL, -- Array of competency_definition IDs
  created_by UUID REFERENCES auth.users(id),
  is_template BOOLEAN DEFAULT false
);
```

### 6. Certification Provider Integration

**Why:** Auto-update competencies from training provider APIs.

**Features:**
- Integration with major certification bodies (OPITO, BINDT, etc.)
- Auto-fetch expiry dates
- Verify certificate authenticity
- Automatic document download

**Implementation:**
- External API integrations
- Webhook support for certificate updates
- Manual verification override option

### 7. Compliance Reports

**Why:** Demonstrate compliance to clients and regulatory bodies.

**Features:**
- Generate compliance reports by date range
- Filter by competency category, user, or organization
- Export to PDF/Excel
- Audit trail of all competency changes
- Client-specific certification requirements

**Report Types:**
- Individual employee competency matrix
- Organization-wide compliance status
- Expiry forecast (next 3/6/12 months)
- Training investment analysis

### 8. Visual Expiry Timeline

**Why:** Visualize competency health over time.

**Features:**
- Calendar/Gantt-style view of expiring competencies
- Color-coded by urgency (green/yellow/red)
- Drag-and-drop to reschedule
- Filter by user, category, or renewal status
- Export view to share with team

### 9. Mobile App Notifications

**Why:** Keep employees informed on-the-go.

**Features:**
- Push notifications for expiring competencies
- Quick comment from mobile
- Document upload from mobile camera
- Approve/reject renewal submissions
- View personal competency status

### 10. Integration with Document Management

**Why:** Centralize all certification documentation.

**Features:**
- Link certificates to cloud storage (SharePoint, Google Drive)
- OCR scanning of certificates to extract expiry dates
- Automatic archival of expired certificates
- Version control for certificate renewals
- Searchable document repository

---

## Implementation Priority

**High Priority (Implement First):**
1. ✅ Competency Comments (Completed)
2. Email Notifications for Expiring Competencies
3. Competency Dashboard/Overview

**Medium Priority:**
4. Bulk Renewal Operations
5. Competency Reminders & Tasks
6. Compliance Reports

**Low Priority (Nice to Have):**
7. Visual Expiry Timeline
8. Competency Templates/Groups
9. Mobile App Notifications
10. Certification Provider Integration

---

## Setup Instructions

### 1. Run Database Migration

```bash
# From the database directory
psql -U your_user -d your_database -f database/add-competency-comments.sql

# OR using Supabase CLI
supabase db push
```

### 2. Verify Installation

```javascript
import competencyService from './services/competency-service.js';

// Test getting comments
const comments = await competencyService.getCompetencyComments('competency-id');

// Test adding a comment
const newComment = await competencyService.addCompetencyComment(
  'competency-id',
  'Renewal course booked for next week',
  'renewal_in_progress'
);

// Test getting expiring competencies with comments
const expiring = await competencyService.getExpiringCompetencies(30, true);
console.log(expiring);
```

### 3. Example Usage

```javascript
// Mark a competency as renewal in progress
await competencyService.addCompetencyComment(
  employeeCompetencyId,
  'Training course scheduled for March 15th. Certificate expected by March 20th.',
  'renewal_in_progress'
);

// Add an escalation comment
await competencyService.addCompetencyComment(
  employeeCompetencyId,
  'Employee has not responded to renewal reminders. Manager intervention needed.',
  'escalation',
  true // Pin this comment
);

// View all expiring with renewal status
const expiring = await competencyService.getExpiringCompetencies(30, true);
expiring.forEach(comp => {
  console.log(`${comp.competency_name} - ${comp.days_until_expiry} days`);
  console.log(`Status: ${comp.has_renewal_in_progress ? 'In Progress' : 'Needs Action'}`);
  if (comp.latest_comment) {
    console.log(`Latest: ${comp.latest_comment}`);
  }
});
```

---

## Benefits Summary

### For Employees:
- Clear visibility into certification status
- Document renewal progress
- Reduce administrative overhead
- Track personal compliance

### For Administrators:
- Monitor renewal progress at a glance
- Identify at-risk certifications early
- Improve team communication
- Maintain compliance records

### For the Organization:
- Reduce compliance risks
- Improve certification renewal rates
- Better resource planning
- Audit trail for regulatory compliance
- Improved client confidence

---

## Next Steps

1. ✅ Database migration completed
2. ✅ TypeScript types added
3. ✅ Service methods implemented
4. Build UI components for:
   - Comment thread display
   - Add/edit comment forms
   - Expiring competencies dashboard with comment status
   - Pin/unpin comment controls
5. Implement email notifications (Priority #2)
6. Create competency dashboard (Priority #3)

---

## Questions or Feedback?

For questions about this feature or to suggest additional improvements, please contact your development team or create an issue in the project repository.
