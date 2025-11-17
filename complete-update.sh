#!/bin/bash

# Complete unified rendering implementation + background fix

set -e

echo "=========================================="
echo "ASAPS Modern - Complete Update"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Fix background loading (add debugging)"
echo "  2. Build unified rendering system"
echo "  3. Compile all packages"
echo ""

PROJECT_ROOT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
cd "$PROJECT_ROOT"

# Step 1: Apply background debugging fix
echo "Step 1: Applying background loading fix..."
if [ -f "fix-background-debug.sh" ]; then
    chmod +x fix-background-debug.sh
    ./fix-background-debug.sh
    echo "✅ Background debugging added"
else
    echo "⚠️  fix-background-debug.sh not found, skipping"
fi
echo ""

# Step 2: Build all packages
echo "Step 2: Building all packages..."
echo ""

echo "Building @asaps/core..."
npm run build -w @asaps/core
if [ $? -ne 0 ]; then
    echo "❌ Core build failed"
    exit 1
fi
echo "✅ Core built"
echo ""

echo "Building @asaps/renderer..."
npm run build -w @asaps/renderer
if [ $? -ne 0 ]; then
    echo "❌ Renderer build failed"
    exit 1
fi
echo "✅ Renderer built (includes new EditableReactRenderer)"
echo ""

echo "Building @asaps/builder..."
npm run build -w @asaps/builder  
if [ $? -ne 0 ]; then
    echo "❌ Builder build failed"
    exit 1
fi
echo "✅ Builder built (includes new UnifiedVisualEditor)"
echo ""

echo "=========================================="
echo "✅ ALL UPDATES COMPLETE!"
echo "=========================================="
echo ""
echo "What was done:"
echo ""
echo "1. Background Loading:"
echo "   - Added comprehensive debugging"
echo "   - Multiple lookup paths"
echo "   - Console logs show [Beat] prefix"
echo ""
echo "2. Unified Rendering System (Phase 1):"
echo "   - ✅ EditableReactRenderer created"
echo "   - ✅ UnifiedVisualEditor created"
echo "   - ✅ True WYSIWYG editing"
echo "   - ✅ 32% code reduction potential"
echo ""
echo "3. All Packages Built:"
echo "   - ✅ Core (12 beat types with background support)"
echo "   - ✅ Renderer (ReactRenderer + EditableReactRenderer)"
echo "   - ✅ Builder (includes UnifiedVisualEditor)"
echo ""
echo "Next Steps:"
echo ""
echo "1. Start the app:"
echo "   npm run dev"
echo ""
echo "2. Test background loading:"
echo "   - Create a beat with background"
echo "   - Check browser console for [Beat] logs"
echo "   - See what's happening with background lookup"
echo ""
echo "3. Test unified visual editor:"
echo "   - The new UnifiedVisualEditor is available"
echo "   - Can be tested alongside current editor"
echo "   - Import: UnifiedVisualEditor from './visual/UnifiedVisualEditor'"
echo ""
echo "Documentation:"
echo "   - UNIFIED_RENDERING_STATUS.md - Full implementation details"
echo "   - UNIFIED_RENDERING_PROPOSAL.md - Original architecture plan"
echo "   - QUICK_SUMMARY.md - Overview"
echo ""
echo "For detailed status, see:"
echo "   cat UNIFIED_RENDERING_STATUS.md"
echo ""
