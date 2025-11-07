# State Components Library

Professional loading states and empty states for the NDT Suite application, designed to match the glassmorphic design system.

## Table of Contents

- [Loading States](#loading-states)
- [Empty States](#empty-states)
- [Usage Examples](#usage-examples)
- [Design Principles](#design-principles)

---

## Loading States

### Spinners

#### `Spinner`
Basic rotating circular spinner.

**Props:**
- `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
- `color`: 'primary' | 'white' | 'success' | 'warning' | 'danger' (default: 'primary')
- `className`: string (optional)

**Example:**
```jsx
import { Spinner } from './components/LoadingStates';

<Spinner size="lg" color="primary" />
```

#### `DotsSpinner`
Three animated dots.

**Props:**
- `size`: 'sm' | 'md' | 'lg' (default: 'md')
- `color`: 'primary' | 'white' | 'success' | 'warning' | 'danger' (default: 'primary')
- `className`: string (optional)

**Example:**
```jsx
<DotsSpinner size="md" color="primary" />
```

#### `RingSpinner`
Dual rotating rings.

**Props:**
- `size`: 'sm' | 'md' | 'lg' (default: 'md')
- `className`: string (optional)

**Example:**
```jsx
<RingSpinner size="lg" />
```

---

### Progress Indicators

#### `ProgressBar`
Linear progress bar with optional label.

**Props:**
- `progress`: number (0-100, default: 0)
- `showLabel`: boolean (default: true)
- `color`: 'primary' | 'success' | 'warning' | 'danger' (default: 'primary')
- `height`: 'sm' | 'md' | 'lg' (default: 'md')
- `className`: string (optional)

**Example:**
```jsx
<ProgressBar progress={65} showLabel={true} color="success" />
```

#### `IndeterminateProgress`
Animated progress bar without specific progress value.

**Props:**
- `color`: 'primary' | 'success' | 'warning' | 'danger' (default: 'primary')
- `height`: 'sm' | 'md' | 'lg' (default: 'md')
- `className`: string (optional)

**Example:**
```jsx
<IndeterminateProgress color="primary" height="md" />
```

#### `CircularProgress`
Circular progress indicator with percentage.

**Props:**
- `progress`: number (0-100, default: 0)
- `size`: 'sm' | 'md' | 'lg' (default: 'md')
- `showLabel`: boolean (default: true)
- `color`: 'primary' | 'success' | 'warning' | 'danger' (default: 'primary')
- `className`: string (optional)

**Example:**
```jsx
<CircularProgress progress={75} size="lg" showLabel={true} />
```

---

### Skeleton Loaders

#### `Skeleton`
Base skeleton component for custom shapes.

**Props:**
- `width`: string (default: '100%')
- `height`: string (default: '1rem')
- `borderRadius`: string (default: 'var(--radius-md)')
- `className`: string (optional)

**Example:**
```jsx
<Skeleton width="200px" height="24px" />
```

#### `SkeletonText`
Multiple text lines skeleton.

**Props:**
- `lines`: number (default: 3)
- `className`: string (optional)

**Example:**
```jsx
<SkeletonText lines={4} />
```

#### `SkeletonCard`
Card skeleton with optional image.

**Props:**
- `showImage`: boolean (default: true)
- `className`: string (optional)

**Example:**
```jsx
<SkeletonCard showImage={true} />
```

#### `SkeletonListItem`
List item skeleton with optional avatar.

**Props:**
- `showAvatar`: boolean (default: true)
- `className`: string (optional)

**Example:**
```jsx
<SkeletonListItem showAvatar={true} />
```

#### `SkeletonTable`
Table skeleton with configurable rows and columns.

**Props:**
- `rows`: number (default: 5)
- `columns`: number (default: 4)
- `className`: string (optional)

**Example:**
```jsx
<SkeletonTable rows={10} columns={5} />
```

#### `SkeletonAvatar`
Circular avatar skeleton.

**Props:**
- `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
- `className`: string (optional)

**Example:**
```jsx
<SkeletonAvatar size="lg" />
```

---

### Full Page Loaders

#### `LoadingOverlay`
Full-screen loading overlay with message.

**Props:**
- `message`: string (default: 'Loading...')
- `spinner`: 'default' | 'ring' | 'dots' (default: 'ring')
- `transparent`: boolean (default: false)
- `className`: string (optional)

**Example:**
```jsx
<LoadingOverlay
  message="Processing your data..."
  spinner="ring"
  transparent={false}
/>
```

#### `ContentLoader`
Content area loader with centered spinner.

**Props:**
- `type`: 'spinner' | 'ring' | 'dots' (default: 'spinner')
- `message`: string (default: 'Loading content...')
- `className`: string (optional)

**Example:**
```jsx
<ContentLoader type="ring" message="Loading data..." />
```

#### `InlineLoader`
Small inline loader for buttons.

**Props:**
- `size`: 'xs' | 'sm' | 'md' (default: 'sm')
- `className`: string (optional)

**Example:**
```jsx
<button className="btn-primary" disabled>
  <InlineLoader size="sm" />
  Loading...
</button>
```

#### `DashboardLoader`
Pre-configured dashboard skeleton layout.

**Props:**
- `className`: string (optional)

**Example:**
```jsx
<DashboardLoader />
```

#### `FormLoader`
Pre-configured form skeleton layout.

**Props:**
- `fields`: number (default: 4)
- `className`: string (optional)

**Example:**
```jsx
<FormLoader fields={5} />
```

---

## Empty States

### Base Component

#### `EmptyState`
Customizable base empty state component.

**Props:**
- `icon`: string (icon type name, default: 'default')
- `iconSize`: 'sm' | 'md' | 'lg' | 'xl' (default: 'lg')
- `title`: string
- `description`: string
- `action`: { label: string, onClick: function, icon?: string, disabled?: boolean }
- `secondaryAction`: { label: string, onClick: function, icon?: string, disabled?: boolean }
- `className`: string (optional)
- `children`: React.ReactNode (optional)

**Available Icons:**
- 'default', 'folder', 'document', 'search', 'users', 'data', 'chart', 'inbox', 'filter', 'image', 'clipboard'

**Example:**
```jsx
<EmptyState
  icon="folder"
  title="No Files Found"
  description="This folder is empty. Upload some files to get started."
  action={{
    label: 'Upload Files',
    onClick: handleUpload
  }}
/>
```

---

### Preset Empty States

#### `EmptyData`
No data available state.

**Props:**
- `title`: string (optional)
- `description`: string (optional)
- `onRefresh`: function (optional)
- `onImport`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyData
  onImport={handleImport}
  onRefresh={handleRefresh}
/>
```

#### `EmptyResults`
No search/filter results state.

**Props:**
- `query`: string (optional)
- `onClearFilters`: function (optional)
- `onReset`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyResults
  query="inspection data"
  onClearFilters={handleClearFilters}
/>
```

#### `EmptyFolder`
Empty folder/collection state.

**Props:**
- `folderName`: string (optional)
- `onCreate`: function (optional)
- `onUpload`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyFolder
  folderName="Inspection Reports"
  onCreate={handleCreate}
  onUpload={handleUpload}
/>
```

#### `EmptyInbox`
Empty inbox/notifications state.

**Props:**
- `title`: string (optional)
- `description`: string (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyInbox />
```

#### `EmptyList`
Empty list state.

**Props:**
- `itemType`: string (default: 'items')
- `onCreate`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyList
  itemType="inspections"
  onCreate={handleCreateInspection}
/>
```

#### `EmptyChart`
No chart data state.

**Props:**
- `chartType`: string (default: 'chart')
- `description`: string (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyChart chartType="analytics dashboard" />
```

#### `EmptyGallery`
Empty image gallery state.

**Props:**
- `onUpload`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyGallery onUpload={handleUploadImages} />
```

#### `EmptyPermission`
No access/permission state.

**Props:**
- `resource`: string (default: 'this content')
- `onRequest`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyPermission
  resource="this report"
  onRequest={handleRequestAccess}
/>
```

#### `EmptyUsers`
No users/team members state.

**Props:**
- `onInvite`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<EmptyUsers onInvite={handleInviteUsers} />
```

#### `ErrorState`
Error state with retry option.

**Props:**
- `title`: string (optional)
- `description`: string (optional)
- `onRetry`: function (optional)
- `onGoBack`: function (optional)
- `className`: string (optional)

**Example:**
```jsx
<ErrorState
  title="Connection Failed"
  description="Unable to connect to the server. Please check your connection."
  onRetry={handleRetry}
  onGoBack={handleGoBack}
/>
```

#### `ComingSoon`
Coming soon feature state.

**Props:**
- `feature`: string (optional)
- `description`: string (optional)
- `className`: string (optional)

**Example:**
```jsx
<ComingSoon
  feature="3D Visualization"
  description="Advanced 3D model visualization is under development."
/>
```

---

## Usage Examples

### Basic Loading State

```jsx
import { useState, useEffect } from 'react';
import { ContentLoader, EmptyData } from './components/LoadingStates';

function MyComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData().then(result => {
      setData(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <ContentLoader message="Loading data..." />;
  }

  if (data.length === 0) {
    return <EmptyData onRefresh={handleRefresh} />;
  }

  return <div>{/* Render data */}</div>;
}
```

### Skeleton Loading

```jsx
import { SkeletonCard } from './components/LoadingStates';

function DataCards({ loading, data }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {data.map(item => <Card key={item.id} data={item} />)}
    </div>
  );
}
```

### Form with Progress

```jsx
import { ProgressBar, InlineLoader } from './components/LoadingStates';

function UploadForm() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <form>
      {uploading && (
        <ProgressBar progress={progress} showLabel={true} color="success" />
      )}
      <button className="btn-primary" disabled={uploading}>
        {uploading ? (
          <>
            <InlineLoader size="sm" />
            Uploading...
          </>
        ) : (
          'Upload File'
        )}
      </button>
    </form>
  );
}
```

---

## Design Principles

### Consistency
All components follow the established glassmorphic design system with:
- Consistent spacing using design tokens
- Unified color palette
- Smooth animations and transitions
- Professional typography

### Accessibility
- Proper ARIA labels and roles
- Keyboard navigation support
- High contrast ratios for text
- Screen reader friendly

### Performance
- Efficient animations using CSS transforms
- Minimal re-renders
- Optimized SVG icons
- Lazy loading support

### Customization
- All components accept className prop
- Flexible sizing options
- Color variants available
- Easy to extend and modify

---

## Best Practices

1. **Use appropriate loading states**: Match the loader to the content being loaded (e.g., skeleton for lists, spinner for operations)

2. **Provide meaningful messages**: Give users context about what's happening

3. **Show progress when possible**: Use determinate progress bars when you can calculate progress

4. **Keep empty states actionable**: Include clear CTAs to guide users

5. **Maintain consistency**: Use the same components throughout your application

6. **Consider timing**: Don't show loading states for very fast operations (<200ms)

7. **Handle errors gracefully**: Use ErrorState instead of generic empty states for failures

---

## Support

For issues or questions about these components, please refer to the main project documentation or contact the development team.
