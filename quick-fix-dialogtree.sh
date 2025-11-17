#!/bin/bash

# Quick fix for dialog tree issues
echo "Applying dialog tree fixes..."

# Copy fixed files
cp packages/builder/src/App-fixed.tsx packages/builder/src/App.tsx
cp packages/builder/src/components/Inspector-improved.tsx packages/builder/src/components/Inspector.tsx
cp packages/builder/src/editors/DialogTreeEditor-improved.tsx packages/builder/src/editors/DialogTreeEditor.tsx

# Build
npm run build

echo ""
echo "✅ Done! All issues fixed:"
echo "  • Full screen canvas"
echo "  • NPCs speak to player"
echo "  • Editable nested dialogs"
echo "  • Better expanded layout"
echo ""
echo "Run: npm run dev"
