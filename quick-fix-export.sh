#!/bin/bash

# Quick Apply All ASPS Export Fixes
# Run this to fix all export issues at once

echo "Applying all ASPS export fixes..."

# Fix 1: Duration multiplication
echo "• Fixing duration ×1000 bug..."
sed -i.bak 's/parseFloat(transitionElement\.getAttribute('\''duration'\''.*\* 1000/parseFloat(transitionElement.getAttribute('\''duration'\'' || '\''500'\'')/' \
    packages/core/src/xml/ASMLParser.ts

# Fix 2: Copy fixed useStoryBuilder
echo "• Fixing data preservation in export..."
if [ -f "packages/builder/src/hooks/useStoryBuilder-fixed.ts" ]; then
    cp packages/builder/src/hooks/useStoryBuilder-fixed.ts \
       packages/builder/src/hooks/useStoryBuilder.ts
fi

# Fix 3: Rebuild
echo "• Rebuilding packages..."
npm run build

echo ""
echo "✅ All fixes applied!"
echo ""
echo "Test with:"
echo "1. npm run dev"
echo "2. Import examples/forest_adventure_v2.xml"
echo "3. Export and check the XML"
echo "4. Run: node validate-roundtrip-fixed.js examples/forest_adventure_v2.xml <exported.xml>"
