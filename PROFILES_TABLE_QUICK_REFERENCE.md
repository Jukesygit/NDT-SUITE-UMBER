# Profiles Table - Quick Reference

## All Column Names and Types

### Core Fields (Required)
```
id                   UUID         PRIMARY KEY (from auth.users)
username             TEXT         UNIQUE NOT NULL
email                TEXT         NOT NULL
role                 TEXT         NOT NULL CHECK ('admin', 'org_admin', 'editor', 'viewer')
```

### Organization & Status (Optional)
```
organization_id      UUID         NULLABLE (references organizations.id)
is_active            BOOLEAN      DEFAULT true
```

### Personal Details (All Optional)
```
mobile_number                              TEXT    NULLABLE
email_address                              TEXT    NULLABLE
home_address                               TEXT    NULLABLE
nearest_uk_train_station                   TEXT    NULLABLE
next_of_kin                                TEXT    NULLABLE
next_of_kin_emergency_contact_number       TEXT    NULLABLE
date_of_birth                              DATE    NULLABLE
avatar_url                                 TEXT    NULLABLE
```

### System Fields (Auto-managed)
```
created_at           TIMESTAMPTZ  DEFAULT NOW()
updated_at           TIMESTAMPTZ  DEFAULT NOW()
```

## Total Columns: 16

## Insert Template (All Fields)

### SQL Insert
```sql
INSERT INTO profiles (
    -- REQUIRED FIELDS
    id,                                      -- UUID (must exist in auth.users)
    username,                                -- TEXT (unique)
    email,                                   -- TEXT
    role,                                    -- TEXT ('admin', 'org_admin', 'editor', 'viewer')

    -- OPTIONAL ORGANIZATION
    organization_id,                         -- UUID or NULL
    is_active,                               -- BOOLEAN (default: true)

    -- OPTIONAL PERSONAL DETAILS
    mobile_number,                           -- TEXT or NULL
    email_address,                           -- TEXT or NULL
    home_address,                            -- TEXT or NULL
    nearest_uk_train_station,                -- TEXT or NULL
    next_of_kin,                             -- TEXT or NULL
    next_of_kin_emergency_contact_number,    -- TEXT or NULL
    date_of_birth,                           -- DATE or NULL
    avatar_url                               -- TEXT or NULL
) VALUES (
    'auth-user-uuid-here',
    'employee_username',
    'email@example.com',
    'viewer',
    'org-uuid-or-null',
    true,
    '+44 1234 567890',
    'personal@email.com',
    '123 Street Name, City, Postcode',
    'Station Name',
    'Emergency Contact Name',
    '+44 9876 543210',
    '1985-06-15',
    'https://storage.url/avatar.jpg'
);
```

### JavaScript (Supabase Client)
```javascript
const { data, error } = await supabase
  .from('profiles')
  .insert({
    // REQUIRED
    id: authUserId,              // Must exist in auth.users
    username: 'jsmith',
    email: 'jsmith@company.com',
    role: 'viewer',              // or 'admin', 'org_admin', 'editor'

    // OPTIONAL
    organization_id: orgId,      // or null
    is_active: true,
    mobile_number: '+44 1234 567890',
    email_address: 'personal@email.com',
    home_address: '123 Street, City',
    nearest_uk_train_station: 'Station Name',
    next_of_kin: 'Contact Name',
    next_of_kin_emergency_contact_number: '+44 9876 543210',
    date_of_birth: '1985-06-15',
    avatar_url: 'https://example.com/avatar.jpg'
  });
```

## Minimal Insert (Only Required Fields)

### SQL
```sql
INSERT INTO profiles (id, username, email, role)
VALUES (
    'auth-user-uuid',
    'username',
    'email@example.com',
    'viewer'
);
```

### JavaScript
```javascript
const { data, error } = await supabase
  .from('profiles')
  .insert({
    id: authUserId,
    username: 'username',
    email: 'email@example.com',
    role: 'viewer'
  });
```

## Important Rules

1. **User ID Must Exist**: `id` must be a valid UUID from `auth.users` table
2. **Username Must Be Unique**: No two profiles can have the same username
3. **Role Must Match**: Only use: 'admin', 'org_admin', 'editor', or 'viewer'
4. **Organization ID**: If provided, must reference existing organization
5. **Timestamps Auto-Update**: Don't manually set created_at or updated_at

## Column Name List (CSV Format)

```
id,username,email,role,organization_id,is_active,created_at,updated_at,mobile_number,email_address,home_address,nearest_uk_train_station,next_of_kin,next_of_kin_emergency_contact_number,date_of_birth,avatar_url
```

## SELECT All Columns

```sql
SELECT
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
FROM profiles;
```

## Verify Schema in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

Or use the provided SQL file: `database/get-profiles-schema.sql`
