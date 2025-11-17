#!/bin/bash

# Quick fix for critical issues
echo "Fixing critical issues..."

# Apply fixes
cp packages/builder/src/components/Inspector-scrollable.tsx packages/builder/src/components/Inspector.tsx
cp packages/builder/src/editors/DialogTreeEditor-unlimited.tsx packages/builder/src/editors/DialogTreeEditor.tsx

# Build
npm run build

echo ""
echo "✅ Fixed:"
echo "  • Inspector scrolls - Save button accessible"
echo "  • Unlimited dialog depth"
echo "  • Collapsible tree nodes"
echo "  • Every choice → NPC or beat"
echo ""
echo "Run: npm run dev"
