# NDT Tool Suite - Complete Modular Version

## 📦 What You Have

A fully modular NDT tool suite split into separate, maintainable files ready for Vercel deployment.

## 🗂️ File Structure

```
ndt-suite/
├── public/
│   └── index.html                    ✅ Complete
├── src/
│   ├── main.js                       ✅ Complete
│   ├── theme.js                      ✅ Complete
│   ├── styles/
│   │   └── main.css                  ✅ Complete
│   └── tools/
│       ├── tofd-calculator.js        ✅ Complete (copy from artifact)
│       ├── cscan-visualizer.js       ✅ Complete (combine Part 1 + Part 2)
│       ├── pec-visualizer.js         ✅ Complete
│       └── 3d-viewer.js              ✅ Complete (combine Parts 1, 2, 3)
├── package.json                      ✅ Complete
├── vercel.json                       ✅ Complete
└── README.md                         ✅ This file
```

## 🚀 Quick Start (5 Minutes)

### 1. Create Project Structure

```bash
mkdir ndt-suite && cd ndt-suite
mkdir -p public src/styles src/tools
```

### 2. Copy Files

Copy each artifact into its corresponding file:

- **package.json** → `package.json`
- **vercel.json** → `vercel.json`
- **public/index.html** → `public/index.html`
- **src/main.js** → `src/main.js`
- **src/theme.js** → `src/theme.js`
- **src/styles/main.css** → `src/styles/main.css`
- **src/tools/tofd-calculator.js** → Copy the complete TOFD artifact
- **src/tools/pec-visualizer.js** → Copy the complete PEC artifact
- **src/tools/cscan-visualizer.js** → Combine both C-Scan parts into one file
- **src/tools/3d-viewer.js** → Combine all 3 parts into one file

**IMPORTANT for multi-part files:**

For **cscan-visualizer.js**: Combine Part 1 and Part 2 into a single file. Part 2 starts where Part 1 ends (after `updatePlot()` function).

For **3d-viewer.js**: Combine Parts 1, 2, and 3 into a single file in order. Remove the "Continue to Part X..." comments.

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` - all tools should work!

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Done! Your app is live.

## 📋 Complete File Contents Guide

### Files Ready to Copy As-Is

These files are complete and ready to copy directly:

1. ✅ `package.json`
2. ✅ `vercel.json`
3. ✅ `public/index.html`
4. ✅ `src/main.js`
5. ✅ `src/theme.js`
6. ✅ `src/styles/main.css`
7. ✅ `src/tools/tofd-calculator.js`
8. ✅ `src/tools/pec-visualizer.js`

### Files That Need Combining

#### cscan-visualizer.js
Combine Part 1 and Part 2 in this order:
1. Copy everything from Part 1
2. Remove the "// Continue to part 2..." comment at the end
3. Append everything from Part 2 (starting with `function renderFileList()`)
4. Make sure there's only ONE `export default { init, destroy }` at the very end

#### 3d-viewer.js
Combine Parts 1, 2, and 3 in this order:
1. Copy all imports and setup from Part 1 (up to the Layer class)
2. Append Part 2 (shader code and core functions)
3. Append Part 3 (event handlers and export)
4. Remove all "// Continue to Part X..." comments
5. Make sure there's only ONE `export default { init, destroy }` at the very end

## 🔧 Troubleshooting

### Issue: Module errors when running dev server

**Solution**: Make sure three.js is installed:
```bash
npm install three@0.164.1
```

### Issue: C-Scan or 3D Viewer not loading

**Solution**: Check that you combined the multi-part files correctly. There should be NO duplicate functions and only ONE export statement at the end.

### Issue: Plotly not working

**Solution**: Check that the Plotly CDN script is in `public/index.html`:
```html
<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"></script>
```

### Issue: Dark mode not working

**Solution**: Ensure the theme toggle button and theme.js are properly connected in main.js

### Issue: Build fails

**Solution**: 
```bash
rm -rf node_modules dist
npm install
npm run build
```

## 📝 File Combination Template for 3d-viewer.js

Here's the exact structure for combining the 3D viewer:

```javascript
// Start of file - from Part 1
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let container, scene, camera, renderer...
// ... rest of Part 1 variables and HTML

class Layer { ... }

// From Part 2
const vertexShader = `...`;
const fragmentShader = `...`;
function cacheDomElements() { ... }
function doInit() { ... }
function createDecalMaterial() { ... }
function loadDefaultModel() { ... }
function setModel(newModel) { ... }

// From Part 3
function handleModelUpload(event) { ... }
function handleTextureUpload(event) { ... }
// ... all other functions from Part 3

function animate() { ... }

// Only ONE export at the very end
export default {
    init: async (toolContainer) => { ... },
    destroy: () => { ... }
};
```

## 📊 Feature Completeness Checklist

### TOFD Calculator
- ✅ All input parameters with sliders
- ✅ Real-time canvas visualization
- ✅ Coverage and dead zone calculations
- ✅ Temperature compensation
- ✅ Analysis modal with recommendations
- ✅ Responsive design

### C-Scan Visualizer
- ✅ Multiple file upload
- ✅ Drag and drop support
- ✅ Composite generation with Web Worker
- ✅ Custom color scales
- ✅ Min/max thickness controls
- ✅ Export standard image
- ✅ Export clean transparent PNG
- ✅ File management UI
- ✅ Metadata display

### PEC Visualizer
- ✅ CSV/TSV data parsing
- ✅ Sample data generator
- ✅ Multiple color scales
- ✅ Smoothing options
- ✅ Grid toggle
- ✅ Reverse scale
- ✅ Custom min/max ranges
- ✅ Statistics display
- ✅ Clean PNG export
- ✅ View reset

### 3D Viewer
- ✅ OBJ model loading
- ✅ Default cylinder model
- ✅ Up to 8 texture layers
- ✅ Cylindrical projection mapping
- ✅ Transform controls (translate/rotate)
- ✅ Multi-axis projection (X/Y/Z)
- ✅ Texture offset, scale, rotation
- ✅ Flip horizontal/vertical
- ✅ Projection start/end clamping
- ✅ Dynamic lighting controls
- ✅ Layer visibility toggles
- ✅ Collapsible control panels
- ✅ Real-time shader updates

## 🎯 Testing Checklist

After setup, test each tool:

### TOFD Calculator
- [ ] Adjust sliders - visualization updates
- [ ] Change weld type - updates display
- [ ] Click "Run Analysis" - modal opens with recommendations
- [ ] Switch to another tool and back - no errors

### C-Scan Visualizer
- [ ] Upload a .txt or .csv file
- [ ] Adjust min/max thickness
- [ ] Upload multiple files
- [ ] Generate composite (2+ files)
- [ ] Export standard PNG
- [ ] Export clean PNG (transparent background)

### PEC Visualizer
- [ ] Click "Load Sample Data"
- [ ] Change color scale
- [ ] Toggle smoothing
- [ ] Apply custom range
- [ ] Reset to auto range
- [ ] Export PNG
- [ ] Paste custom CSV data

### 3D Viewer
- [ ] Default cylinder loads
- [ ] Add texture layer
- [ ] Move/rotate with gizmo
- [ ] Change projection axis
- [ ] Adjust offset/scale/rotation
- [ ] Flip horizontal/vertical
- [ ] Add multiple layers
- [ ] Toggle layer visibility
- [ ] Delete layers
- [ ] Adjust lighting
- [ ] Upload custom .obj file

## 🚢 Deployment Options

### Option 1: Vercel (Recommended)
```bash
vercel --prod
```
- Free tier available
- Automatic HTTPS
- Global CDN
- Instant deployments

### Option 2: Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Option 3: GitHub Pages
```bash
npm run build
# Deploy the dist/ folder
```

## 💡 Adding a New Tool

1. Create `src/tools/my-tool.js`:
```javascript
let container, dom = {};

const HTML = `<div>My Tool UI</div>`;

function cacheDom() {
    dom.button = container.querySelector('#my-button');
}

export default {
    init: (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        cacheDom();
    },
    destroy: () => {
        container.innerHTML = '';
    }
};
```

2. Add to `src/main.js`:
```javascript
import myTool from './tools/my-tool.js';

const tools = [
    // ... existing tools
    {
        id: 'mytool',
        name: 'My Tool',
        description: 'Description here',
        active: true,
        module: myTool,
        icon: `<svg>...</svg>`
    }
];
```

3. Add container to `public/index.html`:
```html
<div id="tool-mytool" class="tool-container hidden"></div>
```

## 📈 Performance Tips

1. **Lazy Load Heavy Tools**: Use dynamic imports for 3D Viewer
2. **Optimize Images**: Compress texture images before upload
3. **Limit Layers**: Keep 3D viewer under 5 layers for best performance
4. **Clear Cache**: Run `npm run build` fresh if issues occur

## 🆘 Getting More Help

- **Vite Docs**: https://vitejs.dev
- **Three.js Docs**: https://threejs.org
- **Plotly Docs**: https://plotly.com/javascript
- **Vercel Docs**: https://vercel.com/docs

## 📄 License

MIT - Free to use and modify