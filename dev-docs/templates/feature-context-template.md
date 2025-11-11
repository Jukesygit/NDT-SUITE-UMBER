# Feature Context: [Feature Name]

> **Purpose**: Preserve important context, code snippets, and architecture information
> **Last Updated**: [Date]

---

## Quick Reference

**Key Files**:
- [file1.js](../src/file1.js) - [Purpose]
- [file2.jsx](../src/file2.jsx) - [Purpose]
- [schema.sql](../database/schema.sql) - [Purpose]

**Related Features**:
- [Feature 1] - [Relationship]
- [Feature 2] - [Relationship]

---

## Database Schema (Relevant Tables)

### Table: `table_name`

```sql
CREATE TABLE IF NOT EXISTS table_name (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_table_name_user ON table_name(user_id);

-- RLS Policies
CREATE POLICY "Users can view own records"
    ON table_name FOR SELECT
    USING (user_id = auth.uid());
```

**Columns**:
- `id` - Primary key
- `user_id` - Foreign key to auth.users
- `name` - [Description]

**Relationships**:
- One-to-many with [other_table]
- Many-to-many via [junction_table]

---

## Existing Code Snippets

### Authentication Check Pattern

**File**: [src/auth-manager.js](../src/auth-manager.js)

```javascript
// Getting current user
const user = authManager.getCurrentUser();

// Checking permissions
const canEdit = authManager.hasPermission('edit');

// Checking role
const isAdmin = authManager.hasRole('admin');
```

### Data Fetching Pattern

**File**: [src/pages/ExamplePage.jsx](../src/pages/ExamplePage.jsx)

```javascript
const fetchData = async () => {
    try {
        const { data, error } = await supabase
            .from('table_name')
            .select(`
                *,
                related_table (
                    id,
                    name
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        setData(data);
    } catch (error) {
        console.error('Error:', error);
        setError(error.message);
    }
};
```

### Component Structure Pattern

**File**: [src/components/ExampleComponent.jsx](../src/components/ExampleComponent.jsx)

```javascript
import { useState, useEffect } from 'react';
import ErrorBoundary from './ErrorBoundary';

const ExampleComponent = ({ prop1, prop2 }) => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, [prop1]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Fetch logic
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <ErrorBoundary>
            {/* Component JSX */}
        </ErrorBoundary>
    );
};

export default ExampleComponent;
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│          User Interface (React)         │
│  ┌───────────────────────────────────┐  │
│  │   ExamplePage.jsx                 │  │
│  │   ├─ ExampleComponent             │  │
│  │   └─ ExampleForm                  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│       Data Layer (Supabase Client)      │
│  ┌───────────────────────────────────┐  │
│  │   CRUD Operations                 │  │
│  │   ├─ fetchData()                  │  │
│  │   ├─ createRecord()               │  │
│  │   ├─ updateRecord()               │  │
│  │   └─ deleteRecord()               │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Supabase (PostgreSQL + RLS)        │
│  ┌───────────────────────────────────┐  │
│  │   table_name                      │  │
│  │   ├─ RLS Policies                 │  │
│  │   ├─ Triggers                     │  │
│  │   └─ Functions                    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Data Flow

### Create Flow

1. User fills out form in `ExampleForm` component
2. Form validates input client-side
3. `handleSubmit()` calls `createRecord()`
4. Supabase client sends INSERT request
5. RLS policy checks permissions
6. Database validates constraints
7. Trigger updates `updated_at`
8. Response returned to client
9. UI updates with new data

### Read Flow

1. Component mounts, calls `loadData()`
2. Supabase client sends SELECT request with filters
3. RLS policy filters results by user/org
4. Database returns matching rows with JOINs
5. Client receives data
6. `setData()` triggers re-render
7. UI displays data

### Update Flow

[Similar description]

### Delete Flow

[Similar description]

---

## API Endpoints (Supabase Functions)

### Function: `function_name`

**File**: [database/function.sql](../database/function.sql)

```sql
CREATE OR REPLACE FUNCTION function_name(param1 TYPE, param2 TYPE)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Function logic
    RETURN jsonb_build_object('success', true, 'data', result);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Usage**:
```javascript
const { data, error } = await supabase.rpc('function_name', {
    param1: value1,
    param2: value2
});
```

---

## Component Hierarchy

```
ExamplePage
├── Header
│   ├── Title
│   └── Actions
│       ├── AddButton
│       └── RefreshButton
├── Filters
│   ├── SearchInput
│   └── FilterDropdown
├── DataTable
│   ├── TableHeader
│   ├── TableBody
│   │   └── TableRow (repeated)
│   │       ├── Cell
│   │       └── ActionButtons
│   └── TableFooter
│       └── Pagination
└── Modal
    └── ExampleForm
        ├── FormField (repeated)
        ├── ErrorMessage
        └── SubmitButton
```

---

## State Management

### Component State

```javascript
const [data, setData] = useState([]); // Main data array
const [filteredData, setFilteredData] = useState([]); // Filtered view
const [selectedItem, setSelectedItem] = useState(null); // Current selection
const [isModalOpen, setIsModalOpen] = useState(false); // Modal visibility
const [isLoading, setIsLoading] = useState(true); // Loading state
const [error, setError] = useState(null); // Error state
```

### Props Flow

```
ParentComponent
  ├─ prop1 → ChildComponent1
  ├─ prop2 → ChildComponent2
  └─ callback() ← ChildComponent2 (event bubbling)
```

---

## Styling Approach

### Tailwind Classes Used

**Layout**:
```css
flex flex-col gap-4
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

**Cards**:
```css
bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg
```

**Buttons**:
```css
px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors
```

**Inputs**:
```css
w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white
focus:ring-2 focus:ring-blue-500 focus:border-blue-500
```

---

## Business Logic Notes

### Validation Rules

**Client-side**:
- Field X must be [constraint]
- Field Y must match pattern [regex]
- Field Z is required if [condition]

**Server-side** (RLS/Database):
- User must own record OR be admin
- Organization_id must match user's org (for org_admin)
- Expiry date must be in future

### Edge Cases to Handle

1. **Empty state**: No data to display
2. **Loading state**: Data being fetched
3. **Error state**: Request failed
4. **Permission denied**: User lacks access
5. **Duplicate data**: Unique constraint violation
6. **Expired session**: User logged out
7. **Network offline**: No connection

---

## Integration Points

### External Services

**Supabase Auth**:
- Magic link authentication
- Session management
- Role-based access

**Supabase Storage**:
- File uploads to `bucket_name`
- Signed URLs for private files

**Supabase Realtime** (if used):
- Subscribe to table changes
- Live updates for collaborative features

---

## Related Files & Line Numbers

**Key Files**:
1. [src/pages/ExamplePage.jsx:1-200](../src/pages/ExamplePage.jsx#L1-L200) - Main page component
2. [src/components/ExampleComponent.jsx:50-100](../src/components/ExampleComponent.jsx#L50-L100) - Data display logic
3. [src/auth-manager.js:150-180](../src/auth-manager.js#L150-L180) - Permission checking
4. [database/schema.sql:100-150](../database/schema.sql#L100-L150) - Table definition
5. [database/policies.sql:20-40](../database/policies.sql#L20-L40) - RLS policies

---

## Testing Context

### What Needs Testing

**Unit Tests**:
- Validation functions
- Helper utilities
- Data transformations

**Integration Tests**:
- Full CRUD flow
- Permission checks
- Error handling

**Manual Test Cases**:
1. Create new record as admin
2. Create new record as viewer (should fail)
3. Edit own record
4. Edit other user's record (should fail unless admin)
5. Delete record with dependencies
6. Upload file >10MB (should fail)

---

## Performance Considerations

**Current Performance**:
- Query returns [X] records in [Y]ms
- Page load time: [Z]s

**Optimizations Applied**:
- Index on `user_id` column
- Pagination (10 items per page)
- Lazy loading of related data

**Known Bottlenecks**:
- [Bottleneck 1] - [Mitigation plan]
- [Bottleneck 2] - [Mitigation plan]

---

## Common Pitfalls

### Mistake 1: [Description]
**Problem**: [What goes wrong]
**Solution**: [How to avoid]

### Mistake 2: [Description]
**Problem**: [What goes wrong]
**Solution**: [How to avoid]

---

## Version History

### Changes on [Date]
- Added [feature/change]
- Modified [component/function]
- Fixed [bug/issue]

---

## Useful Links

- [Figma Design](url)
- [GitHub Issue](url)
- [Supabase Dashboard](url)
- [Related Documentation](url)

---

**Last Updated**: [Date]
**Context Owner**: [Name/Claude]
