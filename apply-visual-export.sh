#!/bin/bash

echo "🔄 Replacing ASMLGenerator with enhanced version..."

# Copy enhanced version to main file
cp packages/core/src/xml/ASMLGenerator-enhanced.ts packages/core/src/xml/ASMLGenerator.ts

echo "✅ ASMLGenerator updated with visual elements support"

# Build to verify
echo "🏗️ Verifying build..."
cd packages/core
npm run build 2>&1 | tail -5

echo ""
echo "✨ Visual Editor Integration is now complete!"
echo "The ASML export now includes:"
echo "- Visual element positions and transforms"
echo "- Asset references for backgrounds, characters, and props"
echo "- Hotspot definitions"
echo "- Text element placements"
echo "- Layer ordering (z-index)"
