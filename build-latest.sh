#!/bin/bash

# Build and Test Script for Recent Changes
# January 16, 2025 - Visual Editor Redesign & Fixes

echo "🚀 Building ASAPS Modern with latest changes..."
echo "================================================"

# Navigate to project root
cd "$(dirname "$0")"

echo "✅ Changes implemented:"
echo "  - SpriteSheetEditor memory overflow fix"
echo "  - Visual Editor UI redesign (tabbed workspace)"
echo "  - Complete default settings"
echo "  - Asset export system (zip with directories)"
echo ""

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "🎯 Next steps to test:"
    echo "  1. Start the dev server: npm run dev"
    echo "  2. Create a visual beat (titleScreen, introText, etc.)"
    echo "  3. Test the new Visual Editor tab in the workspace"
    echo "  4. Try the SpriteSheetEditor with a large sprite sheet"
    echo "  5. Export a story and verify the zip structure"
    echo ""
    echo "📝 Key features to verify:"
    echo "  - Flowchart/Visual tabs switch smoothly"
    echo "  - Visual tab only appears for visual beats"
    echo "  - Visual editor has full workspace width"
    echo "  - Properties panel toggles in visual view"
    echo "  - No memory crashes with large sprite sheets"
    echo "  - Stories export as proper zip files"
else
    echo ""
    echo "❌ Build failed. Please check the errors above."
    echo ""
    echo "Common issues:"
    echo "  - Missing imports: Check WorkspaceView and VisualWorkspace imports"
    echo "  - Type errors: Verify Asset type is imported where needed"
    echo "  - Component props: Ensure all props are passed correctly"
fi

echo ""
echo "================================================"
echo "Session: January 16, 2025 - Major UI Improvements"
echo "================================================"
