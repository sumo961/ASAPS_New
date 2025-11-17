#!/bin/bash

# Phase 1 Complete - Build and Test Unified Rendering

echo "=========================================="
echo "Unified Rendering - Phase 1 Complete"
echo "=========================================="
echo ""

echo "What was created:"
echo "  ✅ EditableReactRenderer.tsx - Extends ReactRenderer with editing"
echo "  ✅ UnifiedVisualEditor.tsx - New WYSIWYG editor component"
echo "  ✅ Exported from renderer package"
echo ""

echo "Key improvements:"
echo "  1. Same rendering system for editor and preview"
echo "  2. True WYSIWYG - what you edit is what you get"
echo "  3. Drag and resize with visual feedback"
echo "  4. No more Konva dependency (will be removed in Phase 2)"
echo "  5. Simpler codebase - one renderer instead of two"
echo ""

echo "Now building all packages..."
echo ""

cd "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"

# Build in correct order
echo "Building core..."
npm run build -w @asaps/core
if [ $? -ne 0 ]; then
    echo "❌ Core build failed"
    exit 1
fi

echo "Building renderer..."
npm run build -w @asaps/renderer
if [ $? -ne 0 ]; then
    echo "❌ Renderer build failed"
    exit 1
fi

echo "Building builder..."
npm run build -w @asaps/builder
if [ $? -ne 0 ]; then
    echo "❌ Builder build failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Phase 1 Complete and Built Successfully"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Test the new UnifiedVisualEditor in the app"
echo "  2. Compare with current Konva-based editor"
echo "  3. If it works well, Phase 2 will:"
echo "     - Integrate UnifiedVisualEditor into WorkspaceView"
echo "     - Remove Konva dependency"
echo "     - Update all beat types to use unified system"
echo ""
echo "To test, you can now import UnifiedVisualEditor:"
echo "  import { UnifiedVisualEditor } from './visual/UnifiedVisualEditor';"
echo ""
echo "Start the dev server:"
echo "  npm run dev"
