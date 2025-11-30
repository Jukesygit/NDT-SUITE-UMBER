# Profiles Table Schema

Complete schema documentation for the `profiles` table in the NDT Suite database.

## Table Overview

The `profiles` table extends Supabase's `auth.users` table and stores employee/user profile information. It serves as the primary user data table for the application.

## Base Schema

Based on: `database/supabase-schema.sql`

### Core Columns

| Column Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, REFERENCES auth.users(id) ON DELETE CASCADE | User ID (linked to Supabase auth) |
| `username` | TEXT | UNIQUE NOT NULL | Unique username |
| `email` | TEXT | NOT NULL | User email address |
| `role` | TEXT | NOT NULL, CHECK (role IN ('admin', 'org_admin', 'editor', 'viewer')) | User role/permission level |
| `organization_id` | UUID | REFERENCES organizations(id) ON DELETE CASCADE | Organization the user belongs to |
| `is_active` | BOOLEAN | DEFAULT true | Whether the user account is active |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Account creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

## Personal Detail Fields

Added by migration: `supabase/migrations/20250105100000_add_profile_personal_fields.sql`

### Additional Columns

| Column Name | Data Type | Nullable | Description |
|------------|-----------|----------|-------------|
| `mobile_number` | TEXT | YES | User mobile phone number |
| `email_address` | TEXT | YES | User email address (may differ from auth email) |
| `home_address` | TEXT | YES | User home address |
| `nearest_uk_train_station` | TEXT | YES | Nearest UK train station for travel purposes |
| `next_of_kin` | TEXT | YES | Emergency contact name |
| `next_of_kin_emergency_contact_number` | TEXT | YES | Emergency contact phone number |
| `date_of_birth` | DATE | YES | User date of birth |
| `avatar_url` | TEXT | YES | URL to user profile picture |

## Complete Column List

For database operations, here's the complete list of all columns:

```sql
id,
username,
email,
role,
organization_id,
is_active,
created_at,
updated_at,
mobile_number,
email_address,
home_address,
nearest_uk_train_station,
next_of_kin,
next_of_kin_emergency_contact_number,
date_of_birth,
avatar_url
```

## Indexes

- `idx_profiles_organization` - ON profiles(organization_id)
- `idx_profiles_username` - ON profiles(username)

## Row Level Security (RLS)

The table has RLS enabled with the following policies:

### SELECT Policy
**"Users can view profiles"**
- Users can view their own profile
- Admins can view all profiles
- Org admins can view profiles in their organization

### INSERT Policy
**"Admins can create users"**
- Admins can create users
- Org admins can create users in their organization

### UPDATE Policy
**"Users can update own profile"**
- Users can update their own profile
- Role changes require admin privileges (enforced at application level)

### DELETE Policy
**"Admins can delete users"**
- Admins can delete users (except themselves)
- Org admins can delete users in their organization (except themselves)

## Triggers

### Auto Profile Creation
- **Trigger**: `on_auth_user_created`
- **Function**: `public.handle_new_user()`
- **Purpose**: Automatically creates a profile when a new user signs up
- **Default Values**:
  - username: Extracted from email or provided in metadata
  - role: 'viewer' (default)
  - organization_id: From user metadata if provided

### Updated Timestamp
- **Trigger**: `update_profiles_updated_at`
- **Function**: `update_updated_at_column()`
- **Purpose**: Automatically updates the `updated_at` field on row updates

## Data Insertion Guidelines

### Insert New Employee (Manual)

```sql
INSERT INTO profiles (
    id,
    username,
    email,
    role,
    organization_id,
    is_active,
    mobile_number,
    email_address,
    home_address,
    nearest_uk_train_station,
    next_of_kin,
    next_of_kin_emergency_contact_number,
    date_of_birth,
    avatar_url
) VALUES (
    'uuid-from-auth-users',          -- Must exist in auth.users
    'jdoe',                           -- Unique username
    'john.doe@example.com',           -- Email
    'viewer',                         -- Role: admin, org_admin, editor, viewer
    'org-uuid',                       -- Organization UUID
    true,                             -- Active status
    '+44 7700 900000',               -- Mobile number
    'john.doe@personal.com',         -- Personal email
    '123 Main St, London, UK',       -- Home address
    'King''s Cross',                 -- Nearest train station
    'Jane Doe',                      -- Next of kin name
    '+44 7700 900001',               -- Emergency contact number
    '1990-01-15',                    -- Date of birth
    'https://example.com/avatar.jpg' -- Avatar URL
);
```

### Insert via Supabase Client (JavaScript)

```javascript
const { data, error } = await supabase
  .from('profiles')
  .insert({
    id: userId,  // Must match auth.users id
    username: 'jdoe',
    email: 'john.doe@example.com',
    role: 'viewer',
    organization_id: orgId,
    is_active: true,
    mobile_number: '+44 7700 900000',
    email_address: 'john.doe@personal.com',
    home_address: '123 Main St, London, UK',
    nearest_uk_train_station: "King's Cross",
    next_of_kin: 'Jane Doe',
    next_of_kin_emergency_contact_number: '+44 7700 900001',
    date_of_birth: '1990-01-15',
    avatar_url: 'https://example.com/avatar.jpg'
  });
```

### Update Existing Profile

```javascript
const { data, error } = await supabase
  .from('profiles')
  .update({
    mobile_number: '+44 7700 900000',
    home_address: '456 New Street, Manchester, UK',
    nearest_uk_train_station: 'Manchester Piccadilly',
    // ... other fields
  })
  .eq('id', userId);
```

## Important Notes

### For Employee Data Import

1. **User ID Requirement**: The `id` field MUST reference an existing user in `auth.users`. You cannot insert a profile without first creating the auth user.

2. **Required Fields**: Only these fields are NOT NULL:
   - `id` (must be valid auth user UUID)
   - `username` (must be unique)
   - `email`
   - `role` (must be one of: 'admin', 'org_admin', 'editor', 'viewer')

3. **Optional Fields**: All personal detail fields are nullable and can be omitted or set to NULL.

4. **Role Constraints**: The role field must be exactly one of:
   - `'admin'` - Full system access
   - `'org_admin'` - Organization-level admin
   - `'editor'` - Can edit data
   - `'viewer'` - Read-only access

5. **Organization Link**: If `organization_id` is provided, it must reference an existing organization UUID.

6. **Timestamps**: `created_at` and `updated_at` are automatically managed by the database.

## Related Tables

### Employee Competencies
Employee certifications and training records are stored in a separate table: `employee_competencies`

See `database/competency-schema.sql` for the competency management system structure.

#### Key Relationships:
- `employee_competencies.user_id` → `profiles.id`
- Competencies are linked via `competency_definitions`
- Categories are organized in `competency_categories`

## Avatar Storage

Avatars are stored in Supabase Storage bucket: `avatars`

### Storage Structure:
```
avatars/
  ├── {user_id}/
  │   └── avatar.jpg
```

### Storage Policies:
- Users can upload/update/delete their own avatars
- All avatars are publicly viewable
- Path structure: `avatars/{user_id}/filename`

## Validation Rules (Application Level)

While the database enforces basic constraints, your application should validate:

1. **Email Format**: Valid email address format
2. **Phone Numbers**: Valid phone number format (international recommended)
3. **Date of Birth**: Reasonable date range (e.g., employee must be 18+)
4. **Username**: Alphanumeric, 3-30 characters, no spaces
5. **URLs**: Valid URL format for avatar_url

## Example Queries

### Get All Employees with Personal Details
```sql
SELECT
    id,
    username,
    email,
    role,
    mobile_number,
    email_address,
    home_address,
    date_of_birth,
    is_active,
    created_at
FROM profiles
WHERE is_active = true
ORDER BY username;
```

### Get Employees in Specific Organization
```sql
SELECT p.*, o.name as organization_name
FROM profiles p
JOIN organizations o ON p.organization_id = o.id
WHERE o.id = 'your-org-uuid'
ORDER BY p.username;
```

### Get Employee with Emergency Contact Info
```sql
SELECT
    username,
    email,
    mobile_number,
    next_of_kin,
    next_of_kin_emergency_contact_number
FROM profiles
WHERE id = 'user-uuid';
```

## Migration History

1. **Initial Schema**: `database/supabase-schema.sql`
   - Created base profiles table with core fields

2. **Personal Fields Addition**: `supabase/migrations/20250105100000_add_profile_personal_fields.sql`
   - Added 8 personal detail fields
   - Added avatar storage bucket and policies

## Database File Locations

- **Main Schema**: `C:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\database\supabase-schema.sql`
- **Personal Fields Migration**: `C:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\supabase\migrations\20250105100000_add_profile_personal_fields.sql`
- **Competency Schema**: `C:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\database\competency-schema.sql`
