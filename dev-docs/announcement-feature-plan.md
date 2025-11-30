# Feature: System Announcements

## Objective
Create a global announcement/message section visible to all users that only the admin can edit. This provides a way for the admin to communicate important information, updates, or notices to all users.

## Approach
Simple single-announcement system with:
- One active announcement at a time
- Displayed prominently below the header for all logged-in users
- Admin can edit via the Configuration tab
- Optional dismissible feature (per-session or persistent)

## Implementation Steps

### 1. Database Schema
Create `system_announcements` table with RLS policies:
- All authenticated users can SELECT
- Only admin can INSERT/UPDATE/DELETE

### 2. Service Layer
Add announcement functions to `admin-service.ts`:
- `getActiveAnnouncement()` - fetch current announcement
- `updateAnnouncement(data)` - admin-only update

### 3. React Query Hooks
- `useAnnouncement()` - query hook for all users
- `useUpdateAnnouncement()` - mutation hook for admin

### 4. UI Components
- `AnnouncementBanner` - displayed in LayoutNew below header
- `AnnouncementSection` - editor in admin ConfigurationTab

## Database Design

```sql
CREATE TABLE system_announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    message text NOT NULL,
    type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
    is_active boolean DEFAULT true,
    is_dismissible boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);

-- RLS Policies
-- All users can read active announcements
CREATE POLICY "Anyone can view active announcements"
    ON system_announcements FOR SELECT
    USING (is_active = true);

-- Only admin can manage
CREATE POLICY "Only admin can insert announcements"
    ON system_announcements FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admin can update announcements"
    ON system_announcements FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admin can delete announcements"
    ON system_announcements FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

## Component Design

### AnnouncementBanner (for LayoutNew)
- Fetch active announcement with useAnnouncement()
- Display colored banner based on type (info=blue, warning=yellow, etc.)
- Optional dismiss button (stores in localStorage)
- Minimal height impact when no announcement

### AnnouncementSection (for ConfigurationTab)
- Text input for title (optional)
- Textarea for message (required)
- Dropdown for type (info/warning/success/error)
- Toggle for is_dismissible
- Toggle for is_active
- Save button with loading state

## File Structure
```
src/
├── components/
│   └── AnnouncementBanner.tsx      # Global banner display
├── hooks/
│   ├── queries/
│   │   └── useAnnouncement.ts      # Query hook
│   └── mutations/
│       └── useAnnouncementMutations.ts  # Mutation hook
├── services/
│   └── admin-service.ts            # Add announcement functions
└── pages/admin/tabs/
    └── ConfigurationTab.tsx        # Add announcement editor section
```

## User Decisions
- **Dismissibility**: Yes, per-session only (reappears after logout)
- **Position**: Below the header
- **History**: Just current announcement (no history)
- **Styles**: All four types selectable (info, warning, success, error)

## Risks & Mitigation
- **Risk**: Announcement takes up too much screen space
  - **Mitigation**: Compact design, dismissible option
- **Risk**: Admin accidentally clears announcement
  - **Mitigation**: Confirmation dialog before clearing
