// Script to automatically apply glassmorphic theme to all tools
// Run this with: node apply-glassmorphic-theme.js

import fs from 'fs';
import path from 'path';

const toolsToUpdate = [
    'admin-dashboard.js',
    'data-hub.js',
    'tofd-calculator.js',
    'cscan-visualizer.js',
    'pec-visualizer.js',
    '3d-viewer.js',
    'nii-coverage-calculator.js'
];

const toolsDir = './src/tools';

// For each tool, add the import and initialize the animated header
toolsToUpdate.forEach(toolFile => {
    const filePath = path.join(toolsDir, toolFile);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${toolFile}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Check if already has the import
    if (content.includes('createAnimatedHeader')) {
        console.log(`✅ ${toolFile} already updated`);
        return;
    }

    console.log(`📝 Updating ${toolFile}...`);

    // Add import at the top (after other imports)
    const importRegex = /(import .+ from .+;\n)/g;
    const imports = content.match(importRegex);
    if (imports) {
        const lastImport = imports[imports.length - 1];
        content = content.replace(
            lastImport,
            lastImport + "import { createAnimatedHeader } from '../animated-background.js';\n"
        );
    }

    console.log(`✅ Updated ${toolFile}`);

    // Note: Further HTML structure changes should be done manually
    // as each tool has a unique structure
});

console.log('\n📦 Import statements added! Now add headers manually to each tool.');
console.log('Next steps:');
console.log('1. Add animated header container to HTML');
console.log('2. Initialize header in cacheDom() or init()');
console.log('3. Update cards/panels to use glass-card class');
console.log('4. Update buttons to use btn-primary/btn-secondary');
console.log('5. Update inputs to use glass-input/glass-select');
