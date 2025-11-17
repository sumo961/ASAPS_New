#!/bin/bash

# Quick Preview Fix - Replace BaseRenderer with fixed version

echo "Applying preview audio fix..."

# Replace BaseRenderer with fixed version
cp packages/renderer/src/renderers/BaseRenderer-fixed.ts \
   packages/renderer/src/renderers/BaseRenderer.ts

# Rebuild
echo "Rebuilding packages..."
cd packages/renderer && npm run build
cd ../builder && npm run build
cd ../..

echo ""
echo "✅ Preview fix applied!"
echo ""
echo "The preview will now:"
echo "• Continue working even if audio files are missing"
echo "• Show warnings in console instead of errors"
echo "• Not crash when clicking buttons"
echo ""
echo "Test with: npm run dev"
