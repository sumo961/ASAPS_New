#!/bin/bash

# Complete fix script - applies all fixes and rebuilds everything

set -e

echo "=========================================="
echo "ASAPS Modern - Complete Fix & Build"
echo "=========================================="
echo ""

PROJECT_ROOT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
cd "$PROJECT_ROOT"

echo "Step 1: Applying type assertion fix to StoryPreview..."
./fix-with-type-cast.sh
echo ""

echo "Step 2: Applying renderer styling fixes..."
./fix-renderer-styling.sh
echo ""

echo "Step 3: Adding background support to Beat base class..."
./add-background-support.sh
echo ""

echo "Step 4: Updating ALL visual beats with background support..."
./update-all-visual-beats-complete.sh
echo ""

echo "Step 5: Building all packages in correct order..."
echo ""

echo "Building @asaps/core..."
npm run build -w @asaps/core
echo "✅ Core built"
echo ""

echo "Building @asaps/renderer..."
npm run build -w @asaps/renderer
echo "✅ Renderer built"
echo ""

echo "Building @asaps/builder..."
npm run build -w @asaps/builder
echo "✅ Builder built"
echo ""

echo "=========================================="
echo "✅ ALL FIXES APPLIED & BUILT SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "What was fixed:"
echo "  ✅ TypeScript type resolution (StoryPreview)"
echo "  ✅ React lifecycle errors (ReactRenderer.clear)"
echo "  ✅ Positioned rendering styling (white boxes, blue buttons)"
echo "  ✅ Background image support (all 12 visual beats)"
echo ""
echo "Visual beats with background support:"
echo "  1. TitleScreenBeat"
echo "  2. IntroTextBeat"
echo "  3. DurScreenBeat"
echo "  4. EndScreenBeat"
echo "  5. DialogTreeBeat"
echo "  6. ConversationChoiceBeat"
echo "  7. MovementChoiceBeat"
echo "  8. PickPropBeat"
echo "  9. VideoBeat"
echo "  10. SWFBeat"
echo "  11. InputTextBeat"
echo "  12. HyperTextBeat"
echo ""
echo "You can now:"
echo "  npm run dev     - Start the builder"
echo "  npm run build   - Rebuild everything (core → renderer → builder)"
echo ""
echo "Next steps:"
echo "  - Test positioned rendering in preview"
echo "  - Add asset management for backgrounds"
echo "  - Test all beat types with visual elements"
