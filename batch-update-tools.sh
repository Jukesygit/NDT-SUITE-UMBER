#!/bin/bash

# Batch update script to add glassmorphic theme imports to remaining visualization tools

echo "Adding imports to remaining visualization tools..."

for tool in "cscan-visualizer" "pec-visualizer" "3d-viewer" "nii-coverage-calculator"; do
    file="src/tools/${tool}.js"

    if [ -f "$file" ]; then
        # Check if import already exists
        if ! grep -q "createAnimatedHeader" "$file"; then
            echo "✏️  Adding import to $tool..."

            # Add import after first line
            sed -i "1 a import { createAnimatedHeader } from '../animated-background.js';" "$file"

            echo "✅ Updated $tool"
        else
            echo "⏭️  $tool already has import"
        fi
    else
        echo "❌ File not found: $file"
    fi
done

echo ""
echo "✨ Imports added! Now manually:"
echo "1. Wrap HTML in flex container with header div"
echo "2. Initialize header in cacheDom/init"
echo "3. Add cleanup in destroy"
echo "4. Replace cards with glass-card/glass-panel"
echo "5. Replace buttons with btn-primary/btn-secondary"
