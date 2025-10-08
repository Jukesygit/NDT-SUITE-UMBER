# Glassmorphic Theme Application Guide

This guide shows how to apply the glassmorphic aesthetic with animated headers to all NDT Suite tools.

## What's Been Completed ✅

- ✅ Main app background with dark gradient
- ✅ Glassmorphic toolbar with blur effects
- ✅ Tool buttons with hover states and blue glow
- ✅ Landing page with glassmorphic card
- ✅ **Profile tool** - Fully updated with animated header
- ✅ Theme system with reusable CSS classes ([src/styles/glassmorphic.css](src/styles/glassmorphic.css))
- ✅ Animated background component ([src/animated-background.js](src/animated-background.js))
- ✅ Tool layout helpers ([src/tool-layout.js](src/tool-layout.js))

## Profile Tool Reference

Check [src/tools/profile.js](src/tools/profile.js) as the reference implementation showing:
- Animated background header
- Glassmorphic cards
- Styled form inputs
- Color-coded badges

## How to Apply to Other Tools

### Step 1: Add Import

```javascript
import { createAnimatedHeader } from '../animated-background.js';
```

### Step 2: Update HTML Structure

```javascript
const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <!-- Animated Header -->
    <div id="[tool-name]-header-container" style="flex-shrink: 0;"></div>

    <!-- Content Area -->
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <!-- Your tool content here -->
    </div>
</div>
`;
```

### Step 3: Initialize Header

In your `cacheDom()` or `init()` function:

```javascript
function cacheDom() {
    const q = (s) => container.querySelector(s);
    dom = {
        headerContainer: q('#[tool-name]-header-container'),
        // ... other elements
    };

    // Initialize animated header
    const header = createAnimatedHeader(
        'Tool Title',
        'Tool description/subtitle',
        {
            height: '180px',
            particleCount: 15,
            waveIntensity: 0.4
        }
    );
    dom.headerContainer.appendChild(header);
}
```

### Step 4: Update UI Elements

Replace existing classes with glassmorphic versions:

#### Cards/Panels
```html
<!-- Before -->
<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">

<!-- After -->
<div class="glass-card" style="padding: 24px;">
```

#### Buttons
```html
<!-- Primary Button Before -->
<button class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">

<!-- Primary Button After -->
<button class="btn-primary">

<!-- Secondary Button -->
<button class="btn-secondary">
```

#### Inputs
```html
<!-- Input Before -->
<input class="w-full px-4 py-2 border rounded-lg bg-gray-700 text-white">

<!-- Input After -->
<input class="glass-input">
```

#### Select Dropdowns
```html
<!-- Select Before -->
<select class="w-full px-4 py-2 border rounded-lg bg-gray-700 text-white">

<!-- Select After -->
<select class="glass-select">
```

#### Textareas
```html
<!-- Textarea Before -->
<textarea class="w-full px-4 py-2 border rounded-lg bg-gray-700 text-white">

<!-- Textarea After -->
<textarea class="glass-textarea">
```

#### Badges
```html
<!-- Badge Before -->
<span class="bg-purple-900 text-purple-200 px-2 py-1 rounded text-xs">

<!-- Badge After -->
<span class="glass-badge badge-purple">

<!-- Available badge colors: badge-blue, badge-green, badge-purple, badge-red -->
```

### Step 5: Add Cleanup

In your `destroy()` function:

```javascript
destroy: () => {
    // Destroy animated background
    const headerContainer = container?.querySelector('#[tool-name]-header-container');
    if (headerContainer) {
        const animContainer = headerContainer.querySelector('.animated-header-container');
        if (animContainer && animContainer._animationInstance) {
            animContainer._animationInstance.destroy();
        }
    }

    if (container) {
        container.innerHTML = '';
    }
}
```

## Available CSS Classes

### Containers
- `glass-card` - Prominent glassmorphic card with blur effect
- `glass-panel` - Subtle glassmorphic panel
- `glass-scrollbar` - Custom styled scrollbar

### Buttons
- `btn-primary` - Blue gradient primary button
- `btn-secondary` - Subtle secondary button

### Forms
- `glass-input` - Glassmorphic text input
- `glass-select` - Glassmorphic select dropdown
- `glass-textarea` - Glassmorphic textarea

### Badges
- `glass-badge` - Base badge style
- `badge-blue` - Blue accent (org_admin)
- `badge-green` - Green accent (editor, approved)
- `badge-purple` - Purple accent (admin)
- `badge-red` - Red accent (rejected, error)

### Modals
- `glass-modal-overlay` - Modal backdrop
- `glass-modal` - Modal container

## Tools Remaining

1. ⏳ Admin Dashboard - Import added, needs header initialization
2. ⏳ Data Hub
3. ⏳ TOFD Calculator
4. ⏳ C-Scan Visualizer
5. ⏳ PEC Visualizer
6. ⏳ 3D Viewer
7. ⏳ NII Coverage Calculator

## Tips

- **Performance**: Animated headers are optimized with configurable particle counts
- **Consistency**: Use the same header height (180px) across tools
- **Responsive**: All components are responsive and work on different screen sizes
- **Dark Only**: The theme is designed for dark mode (matches login page)
- **Animations**: Headers animate automatically, no mouse interaction needed

## Example: Quick Tool Update

Here's a minimal example for updating a simple tool:

```javascript
import { createAnimatedHeader } from '../animated-background.js';

const HTML = `
<div class="h-full w-full" style="display: flex; flex-direction: column; overflow: hidden;">
    <div id="my-tool-header" style="flex-shrink: 0;"></div>
    <div class="glass-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 20px 0; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                Section Title
            </h2>
            <button class="btn-primary">Action Button</button>
        </div>
    </div>
</div>
`;

function init(toolContainer) {
    container = toolContainer;
    container.innerHTML = HTML;

    // Initialize animated header
    const headerContainer = container.querySelector('#my-tool-header');
    const header = createAnimatedHeader('My Tool', 'Tool description');
    headerContainer.appendChild(header);
}
```

## Need Help?

- Check [src/tools/profile.js](src/tools/profile.js) for a complete working example
- See [src/styles/glassmorphic.css](src/styles/glassmorphic.css) for all available styles
- Use [src/tool-layout.js](src/tool-layout.js) for helper functions
